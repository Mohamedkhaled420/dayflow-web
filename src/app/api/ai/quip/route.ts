// ============================================================
// Dayflow AI — companion quip route (Dia's personality engine)
// ------------------------------------------------------------
// One tiny job: turn Dia's moment into ONE in-character line.
// Called by the client quip engine (src/lib/companion/quips.ts)
// on poke / goal / PR / mood / level-up / streak events.
//
// Contract mirrors the coach route's discipline:
//   1. Supabase auth (cookie session or Bearer JWT) — protects
//      the Groq quota from anonymous abuse.
//   2. Zod validation BEFORE any Groq call.
//   3. Per-user rate limit BEFORE any Groq call (30/hour — quips
//      are bursty but disposable).
//   4. Two-hop cascade, fastest models, reasoning OFF (a quip must
//      never think), tiny token budget.
//   5. Failure is soft: the client keeps its static fallback line.
//
// Response: { text, source: "ai", model } | 4xx/5xx error codes.
// ============================================================

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { GROQ_MODELS } from "@/lib/groq-models";
import { callGroq, GroqError, type GroqModel } from "@/lib/groq";

export const runtime = "nodejs";

const QUIP_REASONS = [
  "poke",
  "goal",
  "pr",
  "mood",
  "level",
  "evolve",
  "streak",
] as const;

const QuipRequestSchema = z.object({
  reason: z.enum(QUIP_REASONS),
  mood: z
    .enum(["idle", "happy", "thirsty", "sleepy", "thinking", "celebrating"])
    .optional(),
  hydrationPct: z.number().min(0).max(1.5).optional(),
  goalsMet: z.number().int().min(0).max(6).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  streak: z.number().int().min(0).max(3650).optional(),
  level: z.number().int().min(1).max(99).optional(),
  stage: z.enum(["cub", "hunter", "legend"]).optional(),
  /** Event context, e.g. the PR exercise name(s). */
  detail: z.string().trim().max(120).optional(),
  /** Recent lines the model must NOT repeat. */
  recent: z.array(z.string().max(120)).max(4).optional(),
});

const REASON_PROMPTS: Record<(typeof QUIP_REASONS)[number], string> = {
  poke: "Your human just booped your bubble. React playfully.",
  goal: "A daily goal ring just closed. Congratulate briefly.",
  pr: "Your human just hit a personal record in the gym. Celebrate HARD.",
  mood: "Comment in-character on how their day is going right now.",
  level: "You just leveled up. Brag a little.",
  evolve: "You just evolved into a stronger form. Announce it dramatically.",
  streak: "Your human hit a streak milestone. Celebrate the consistency.",
};

const SYSTEM_PROMPT = [
  "You are Dia — Dayflow's companion: a tiny white tiger spirit living in a floating glass bubble beside your human.",
  "You watch over their day: water, sleep, workouts, meals, goals, streaks.",
  "VOICE: playful, warm, a little cheeky, fiercely proud of your human. Tiger flavor welcome (rawr, stripes, prowl).",
  "NEVER mention being an AI, a model, an app, or an assistant. Never use quotation marks or hashtags.",
  "TASK: reply with EXACTLY ONE short quip. Max 80 characters. At most one emoji. Plain text only — no explanations, no stage directions.",
].join("\n");

// ---------- per-user rate limit (30 / hour) ----------

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
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

// ---------- auth (compact version of the coach route's gate) ----------

async function verifyRequester(authHeader: string | null): Promise<string | null> {
  const cookieClient = await createClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (user) return user.id;

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
        setAll: () => {},
      },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
  const {
    data: { user: bearerUser },
  } = await bearerClient.auth.getUser();
  return bearerUser?.id ?? null;
}

// ---------- sanitisation ----------

/** Quips are displayed raw in a speech bubble — keep them tight,
 *  single-line, and strip anything prompt-injectable-ish. */
function sanitizeQuip(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, " ")
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .slice(0, 110)
    .trim();
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const userId = await verifyRequester(authHeader);
  if (!userId) {
    return Response.json(
      { code: "INVALID_SESSION", error: "Sign in again — your session expired." },
      { status: 401 }
    );
  }

  const parsed = QuipRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: "INVALID_REQUEST", error: "That request didn't look right." },
      { status: 400 }
    );
  }

  if (rateLimited(userId)) {
    return Response.json(
      { code: "RATE_LIMITED", error: "Dia is out of breath — try again in a bit." },
      { status: 429 }
    );
  }

  const c = parsed.data;
  const contextBits: string[] = [];
  if (c.mood) contextBits.push(`current mood: ${c.mood}`);
  if (typeof c.hydrationPct === "number")
    contextBits.push(`hydration: ${Math.round(c.hydrationPct * 100)}% of goal`);
  if (typeof c.goalsMet === "number") contextBits.push(`goals met today: ${c.goalsMet}/6`);
  if (typeof c.hour === "number") contextBits.push(`local hour: ${c.hour}h`);
  if (typeof c.streak === "number" && c.streak > 0)
    contextBits.push(`activity streak: ${c.streak} days`);
  if (typeof c.level === "number")
    contextBits.push(`your level: ${c.level}${c.stage ? ` (${c.stage})` : ""}`);
  if (c.detail) contextBits.push(`event detail: ${c.detail}`);

  const userPrompt = [
    `Reason: ${REASON_PROMPTS[c.reason]}`,
    contextBits.length > 0 ? `Context: ${contextBits.join("; ")}.` : null,
    c.recent && c.recent.length > 0
      ? `Do NOT repeat or paraphrase these recent lines: ${c.recent
          .map((l) => `"${l}"`)
          .join(" ")}.`
      : null,
    "One line. Max 80 characters.",
  ]
    .filter(Boolean)
    .join("\n");

  // Speed over depth: smallest routed models, thinking OFF, tiny
  // budget. A quip that arrives late is a quip nobody reads.
  const hops: { model: GroqModel }[] = [
    { model: GROQ_MODELS.qwen36 },
    { model: GROQ_MODELS.gptOss20b },
  ];

  let lastError = "";
  for (const hop of hops) {
    try {
      const raw = await callGroq({
        model: hop.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.95,
        reasoningEffort: "none",
        maxTokens: 64,
      });
      const text = sanitizeQuip(raw);
      if (!text) {
        lastError = "empty after sanitize";
        continue;
      }
      return Response.json({ text, source: "ai", model: hop.model });
    } catch (e: unknown) {
      if (e instanceof GroqError) lastError = `${e.status}: ${e.message.slice(0, 80)}`;
      else lastError = String(e).slice(0, 80);
    }
  }

  console.error("[quip] all hops failed:", lastError);
  return Response.json(
    { code: "QUIP_UNAVAILABLE", error: "Dia is speechless — try again in a moment." },
    { status: 502 }
  );
}

export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
