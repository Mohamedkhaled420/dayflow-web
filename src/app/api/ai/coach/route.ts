// ============================================================
// Dayflow AI — JWT-gated coach route (PRD §10.3 / Amendment #12)
// ------------------------------------------------------------
// Auth, in order:
//   1. Authorization: Bearer <token> is REQUIRED (401 if missing).
//   2. Verification via createClient from src/utils/supabase/server.ts
//      (the canonical cookie-session helper) — and, when no cookie
//      session is present, direct verification of the presented
//      Bearer JWT with a request-scoped @supabase/ssr client (the
//      same per-request pattern src/middleware.ts already uses).
//      Either valid credential passes; anything else is 401.
//   3. Zod validation of the body BEFORE any Groq call (Amendment #12).
//
// Cascade per Amendment #16 (supersedes the PRD §10.1 table) with
// 429/503-only retries; the algorithmic floor answers when every
// model is exhausted. Model IDs come exclusively from
// src/lib/groq-models.ts (Amendment #13).
// ============================================================

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { GROQ_MODELS } from "@/lib/groq-models";
import {
  callGroq,
  GroqError,
  type GroqMessage,
  type GroqModel,
  type ReasoningEffort,
} from "@/lib/groq";

export const runtime = "nodejs";

/** One cascade hop: model + optional graded effort / JSON mode. */
interface CascadeStep {
  model: GroqModel;
  reasoningEffort?: ReasoningEffort;
  json?: boolean;
}

type CoachMode = "journal" | "workout" | "recap" | "coaching";

// Amendment #16 routing (this table supersedes PRD §10.1).
// Unannotated hops send no reasoning_effort; 'json' rides the
// first workout hop only, per the annotation in the amendment.
const ROUTES: Record<CoachMode, CascadeStep[]> = {
  journal: [
    { model: GROQ_MODELS.gptOss120b, reasoningEffort: "high" },
    { model: GROQ_MODELS.qwen38, reasoningEffort: "high" },
    { model: GROQ_MODELS.qwen36, reasoningEffort: "medium" },
  ],
  workout: [
    { model: GROQ_MODELS.qwen38, json: true },
    { model: GROQ_MODELS.gptOss120b },
    { model: GROQ_MODELS.qwen36 },
  ],
  recap: [
    { model: GROQ_MODELS.gptOss120b },
    { model: GROQ_MODELS.qwen38 },
    { model: GROQ_MODELS.qwen36 },
  ],
  coaching: [
    { model: GROQ_MODELS.qwen36 },
    { model: GROQ_MODELS.gptOss20b },
  ],
};

// ---------- TPM discipline (Amendment #16) ----------
// Every routed model shares an 8,000 TPM budget. Each coach request
// is capped at ~4K prompt tokens (≈16K characters at 4 chars/token)
// and at most the last 3 journal entries, so one heavy conversation
// can never exhaust the shared quota.

const MAX_PROMPT_TOKENS = 4_000;
const CHARS_PER_TOKEN = 4;
const MAX_JOURNAL_ENTRIES = 3;

function totalChars(messages: GroqMessage[]): number {
  return messages.reduce((n, m) => n + m.content.length, 0);
}

/**
 * Trim the outgoing prompt: keep system instructions and at most
 * the last 3 user entries (plus the turns that follow them), then
 * drop the oldest non-system messages until the estimate fits the
 * budget, finally truncating any single runaway message.
 */
function capMessages(messages: GroqMessage[]): GroqMessage[] {
  const userIndexes = messages
    .map((m, i) => (m.role === "user" ? i : -1))
    .filter((i) => i >= 0);
  const firstKept =
    userIndexes.length > MAX_JOURNAL_ENTRIES
      ? userIndexes[userIndexes.length - MAX_JOURNAL_ENTRIES]
      : 0;
  let kept = messages.filter((m, i) => m.role === "system" || i >= firstKept);

  const budget = MAX_PROMPT_TOKENS * CHARS_PER_TOKEN;
  while (totalChars(kept) > budget) {
    const idx = kept.findIndex((m) => m.role !== "system");
    if (idx === -1) break; // only system messages left
    kept = kept.filter((_, i) => i !== idx);
  }

  if (totalChars(kept) > budget) {
    // A single runaway message (e.g. a huge system prompt) still
    // overflows: truncate it in place to keep the request shapely.
    kept = kept.map((m) =>
      m.content.length > budget ? { ...m, content: m.content.slice(0, budget) } : m
    );
  }
  return kept;
}

// Amendment #12: validate the request body BEFORE any Groq call.
const CoachRequestSchema = z.object({
  mode: z.enum(["journal", "workout", "recap", "coaching"]),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().max(32_000),
      })
    )
    .min(1)
    .max(40),
  ctx: z
    .object({
      streak: z.number().optional(),
      hydrationPct: z.number().optional(),
    })
    .optional(),
});

function algorithmicFallback(ctx: { streak?: number; hydrationPct?: number }): string {
  if (ctx.streak && ctx.streak > 7) {
    return "You're on a massive roll. Keep the momentum going.";
  }
  if (ctx.hydrationPct !== undefined && ctx.hydrationPct < 50) {
    return "You're below 50% hydration. Drink 500ml now to protect focus.";
  }
  return "Every day is a fresh start. What's one small win you can lock in today?";
}

async function generateWithFallback(
  mode: CoachMode,
  messages: GroqMessage[],
  ctx: { streak?: number; hydrationPct?: number } = {}
): Promise<string> {
  // TPM discipline happens once, before the cascade: every hop
  // receives the SAME capped prompt (Amendment #16).
  const capped = capMessages(messages);
  for (const step of ROUTES[mode]) {
    try {
      return await callGroq({
        messages: capped,
        model: step.model,
        json: step.json,
        // Graded effort rides ONLY the hops the amendment annotates;
        // callGroq drops the field for any non-capable model.
        reasoningEffort: step.reasoningEffort,
      });
    } catch (e) {
      // Groq transient/overload codes: 429 (rate limit) and 503 (service
      // unavailable) — the only retry-class failures. Anything else throws.
      if (e instanceof GroqError && (e.status === 429 || e.status === 503)) continue;
      throw e;
    }
  }
  return algorithmicFallback(ctx);
}

/**
 * Amendment #12 gate: Bearer token is mandatory; the credential is then
 * verified either as the caller's Supabase cookie session (canonical
 * helper) or as the presented JWT itself (request-scoped client).
 * Returns the authenticated user id, or null → 401.
 */
async function verifyRequester(authHeader: string): Promise<string | null> {
  // 2a. Cookie session via the canonical v0 helper.
  const cookieClient = await createClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (user) return user.id;

  // 2b. No cookie session — verify the presented Bearer JWT directly
  // with a stateless request-scoped client (house pattern of
  // src/middleware.ts; not a second singleton, same env precedence
  // as the v0 helpers). getUser() sends the global Authorization
  // header as the bearer credential.
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const cookieStore = await cookies();
  const bearerClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {}, // stateless verification — no cookie writes
      },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
  const { data: { user: bearerUser } } = await bearerClient.auth.getUser();
  return bearerUser?.id ?? null;
}

export async function POST(req: Request) {
  // 1. Amendment #12: Supabase Auth JWT — protects the Groq quota from
  // anonymous abuse. Missing bearer → 401 before anything else runs.
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await verifyRequester(authHeader);
  if (!userId) {
    return Response.json({ error: "Invalid Session" }, { status: 401 });
  }

  // 2. Validate mode + messages before spending any Groq request.
  const parsed = CoachRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const text = await generateWithFallback(
      parsed.data.mode,
      parsed.data.messages,
      parsed.data.ctx ?? {}
    );
    return Response.json({ text });
  } catch (e: unknown) {
    // Never leak upstream Groq error bodies to the client.
    return Response.json(
      { error: e instanceof Error ? e.message : "Coach error" },
      { status: 502 }
    );
  }
}

export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
