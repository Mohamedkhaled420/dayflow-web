// ============================================================
// Dayflow AI — JWT-gated coach route (PRD §10.3 / Amendment #12)
// ------------------------------------------------------------
// Auth, in order:
//   1. Authorization: Bearer <token> when present (401 only if
//      neither credential verifies).
//   2. Verification via createClient from src/utils/supabase/server.ts
//      (the canonical cookie-session helper) — works with or without
//      a Bearer header, so a browser whose cookie session is valid
//      but whose client getSession() has not caught up still passes
//      (v0 audit #17). Otherwise direct verification of the presented
//      Bearer JWT with a request-scoped @supabase/ssr client (the
//      same per-request pattern src/middleware.ts already uses).
//      Either valid credential passes; anything else is 401.
//   3. Zod validation of the body BEFORE any Groq call (Amendment #12).
//   4. Per-user rate limiting BEFORE any Groq call (v0 audit #4).
//
// Cascade per Amendment #16 (supersedes the PRD §10.1 table) with
// retry-class hops; the algorithmic floor answers when every model
// is exhausted. Model IDs come exclusively from
// src/lib/groq-models.ts (Amendment #13).
//
// Error contract (v0 audit #3): clients receive stable machine
// codes — INVALID_SESSION | INVALID_REQUEST | RATE_LIMITED |
// COACH_UNAVAILABLE — with short human copy. Upstream Groq bodies
// are logged server-side only, never returned.
//
// Response envelope: { text, source: "ai" | "fallback", model? } so
// the UI can label algorithmic-floor answers honestly (v0 audit
// #16). Streaming clients (stream: true, non-workout modes) get
// SSE: meta → delta* → done | error.
// ============================================================

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { GROQ_MODELS } from "@/lib/groq-models";
import {
  callGroq,
  callGroqStream,
  GroqError,
  sseDeltas,
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

// ---------- per-user rate limiting (v0 audit #4) ----------
// In-memory sliding window. Best-effort on serverless (instances
// don't share memory), still meaningfully protects the shared Groq
// quota from a single hot user; a durable limiter is a follow-up.

const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 5 * 60_000;
const rateHits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const window = (rateHits.get(userId) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (window.length >= RATE_LIMIT) {
    rateHits.set(userId, window);
    return true;
  }
  window.push(now);
  rateHits.set(userId, window);
  if (rateHits.size > 500) {
    for (const [k, v] of rateHits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) rateHits.delete(k);
    }
  }
  return false;
}

// ---------- hop resilience ----------
// Retry-class: transient overload (429/503) AND model-lifecycle
// failures (400/404 — decommissioned or renamed model IDs, params a
// model rejects) plus timeouts/aborts. Every one of these advances
// the cascade instead of hard-failing the request (v0 audit #15).
// A hop that returns an EMPTY completion is also treated as a hop
// failure — the next model answers rather than "nothing to say".

const HOP_TIMEOUT_MS = 30_000;

function isRetryClass(e: unknown): boolean {
  if (e instanceof GroqError) return [400, 404, 429, 503].includes(e.status);
  if (e instanceof Error) {
    return e.name === "AbortError" || e.name === "TimeoutError";
  }
  return false;
}

function logHopFailure(mode: CoachMode, step: CascadeStep, e: unknown) {
  const status = e instanceof GroqError ? e.status : e instanceof Error ? e.name : "?";
  console.warn(`[coach] hop failed (mode=${mode} model=${step.model}): ${status}`);
}

// ---------- safety layer (v0 audit #20, minimal + high-precision) ----------
// Deterministic keyword gate on the LAST user message for the
// conversational modes. Never applied to workout mode (the JSON
// plan must stay parseable). Supportive, non-alarmist escalation.

const CRISIS_PATTERN =
  /\b(?:suicid(?:e|al)|kill(?:ing)?\s+(?:myself|me)|end(?:ing)?\s+(?:my\s+)?life|self[-\s]?harm|hurt(?:ing)?\s+myself)\b/i;
const CRISIS_SUFFIX =
  "\n\nIf things feel this heavy right now, please reach out — a crisis line is free and answered 24/7 (US/Canada 988, UK 116 123, EU 112). You deserve real support, and you don't have to carry this alone.";

function crisisSuffixFor(mode: CoachMode, messages: GroqMessage[]): string {
  if (mode !== "journal" && mode !== "coaching") return "";
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return lastUser && CRISIS_PATTERN.test(lastUser.content) ? CRISIS_SUFFIX : "";
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
  /** SSE streaming for conversational clients (v0 audit #1). */
  stream: z.boolean().optional(),
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

interface CoachReply {
  text: string;
  source: "ai" | "fallback";
  model?: string;
}

async function generateWithFallback(
  mode: CoachMode,
  messages: GroqMessage[],
  ctx: { streak?: number; hydrationPct?: number } = {}
): Promise<CoachReply> {
  // TPM discipline happens once, before the cascade: every hop
  // receives the SAME capped prompt (Amendment #16).
  const capped = capMessages(messages);
  for (const step of ROUTES[mode]) {
    try {
      const text = await callGroq({
        messages: capped,
        model: step.model,
        json: step.json,
        // Graded effort rides ONLY the hops the amendment annotates;
        // callGroq drops the field for any non-capable model.
        reasoningEffort: step.reasoningEffort,
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
      });
      if (!text.trim()) continue; // empty completion → next model
      return { text, source: "ai", model: step.model };
    } catch (e) {
      if (isRetryClass(e)) {
        logHopFailure(mode, step, e);
        continue;
      }
      throw e;
    }
  }
  return { text: algorithmicFallback(ctx), source: "fallback" };
}

// ---------- SSE streaming path ----------

function sseEvent(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

/**
 * Streamed coach answer. Events (one JSON object per `data:` line):
 *   { type: "meta",   source: "ai" | "fallback", model? }
 *   { type: "delta",  text: string }
 *   { type: "done",   source: "ai" | "fallback" }
 *   { type: "error",  code: string }
 * meta is only emitted after the first content delta, so a hop that
 * fails before producing text can still fall through to the next
 * model without the client ever seeing a half-started answer.
 */
function streamCoachAnswer(
  mode: CoachMode,
  messages: GroqMessage[],
  ctx: { streak?: number; hydrationPct?: number } = {}
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const suffix = crisisSuffixFor(mode, messages);
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          // Client disconnected — nothing more to do.
        }
      };
      try {
        const capped = capMessages(messages);
        for (const step of ROUTES[mode]) {
          try {
            const { model, response } = await callGroqStream({
              messages: capped,
              model: step.model,
              json: step.json,
              reasoningEffort: step.reasoningEffort,
              signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
            });
            let full = "";
            let firstDelta = true;
            for await (const delta of sseDeltas(response)) {
              if (firstDelta) {
                safeEnqueue(sseEvent({ type: "meta", source: "ai", model }));
                firstDelta = false;
              }
              full += delta;
              safeEnqueue(sseEvent({ type: "delta", text: delta }));
            }
            if (firstDelta) {
              // Accepted but produced no content — treat as a hop
              // failure so the next model gets a chance.
              throw new GroqError(502, "empty stream");
            }
            if (suffix) safeEnqueue(sseEvent({ type: "delta", text: suffix }));
            safeEnqueue(sseEvent({ type: "done", source: "ai", model }));
            controller.close();
            return;
          } catch (e) {
            if (isRetryClass(e) || e instanceof GroqError) {
              logHopFailure(mode, step, e);
              continue;
            }
            throw e;
          }
        }
        // Every hop exhausted — the algorithmic floor, labeled honestly.
        const text = algorithmicFallback(ctx);
        safeEnqueue(sseEvent({ type: "meta", source: "fallback" }));
        safeEnqueue(sseEvent({ type: "delta", text: text + suffix }));
        safeEnqueue(sseEvent({ type: "done", source: "fallback" }));
        controller.close();
      } catch (e) {
        console.error("[coach] stream failed:", e);
        safeEnqueue(sseEvent({ type: "error", code: "COACH_UNAVAILABLE" }));
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx et al.) so deltas arrive live.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Amendment #12 gate: Bearer token when present is verified either as
 * the caller's Supabase cookie session (canonical helper) or as the
 * presented JWT itself (request-scoped client). A missing Bearer is
 * acceptable when the cookie session is valid (same-origin fetches
 * always carry cookies). Returns the authenticated user id, or null.
 */
async function verifyRequester(authHeader: string | null): Promise<string | null> {
  // 2a. Cookie session via the canonical v0 helper.
  const cookieClient = await createClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (user) return user.id;

  // 2b. No cookie session — verify the presented Bearer JWT directly
  // with a stateless request-scoped client (house pattern of
  // src/middleware.ts; not a second singleton, same env precedence
  // as the v0 helpers). getUser() sends the global Authorization
  // header as the bearer credential.
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
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
  // 1. Amendment #12: Supabase Auth JWT (or cookie session) —
  // protects the Groq quota from anonymous abuse.
  const authHeader = req.headers.get("authorization");
  const userId = await verifyRequester(authHeader);
  if (!userId) {
    return Response.json(
      { code: "INVALID_SESSION", error: "Sign in again — your session expired." },
      { status: 401 }
    );
  }

  // 2. Validate mode + messages before spending any Groq request.
  const parsed = CoachRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: "INVALID_REQUEST", error: "That request didn't look right." },
      { status: 400 }
    );
  }

  // 3. Per-user rate limit before spending any Groq request.
  if (rateLimited(userId)) {
    return Response.json(
      {
        code: "RATE_LIMITED",
        error: "You're asking quickly — give the coach a minute before trying again.",
      },
      { status: 429 }
    );
  }

  const { mode, messages, ctx } = parsed.data;

  try {
    // Streaming path: conversational modes only — the workout JSON
    // plan is validated client-side and needs the full envelope.
    if (parsed.data.stream && mode !== "workout") {
      return streamCoachAnswer(mode, messages, ctx ?? {});
    }

    const reply = await generateWithFallback(mode, messages, ctx ?? {});
    const suffix = crisisSuffixFor(mode, messages);
    return Response.json({
      text: suffix ? reply.text + suffix : reply.text,
      source: reply.source,
      model: reply.model,
    });
  } catch (e: unknown) {
    // Full detail server-side only — the client gets a stable code
    // with short human copy (v0 audit #3: never leak Groq bodies).
    console.error("[coach] generation failed:", e);
    return Response.json(
      {
        code: "COACH_UNAVAILABLE",
        error: "The coach couldn't be reached. Try again in a moment.",
      },
      { status: 502 }
    );
  }
}

export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
