// ============================================================
// Dayflow AI — workout routine route (Phase 10 Workouts)
// ------------------------------------------------------------
// Generates ONE complete, science-based training session,
// picking exercises ONLY from the bundled 1,324-exercise library
// so the plan flows straight into the gym logger (library ids
// attached — how-to instructions and PR tracking keep working).
//
// Cascade (free tiers first):
//   1. z.ai GLM-4.5-Flash / GLM-4-Flash (free, ZAI_API_KEY)
//   2. Groq qwen3.8 (json mode, free tier)
//   3. template floor — deterministic evidence-based plan from
//      src/lib/routine-floor.ts, honestly labeled source:"fallback"
//
// The prompt pins evidence-based programming rules (ACSM/NSCA-
// aligned: volume landmarks, rep ranges, RPE, frequency, exercise
// order, progression) and the model must choose from an
// equipment-compliant, focus-shaped catalog. Every model answer
// is re-validated server-side: names are fuzzy-mapped to real
// library rows, sets/reps/rest are clamped, and a plan that maps
// fewer than 3 exercises is treated as a hop failure.
//
// Auth/robustness mirrors the coach + food routes (Amendment #12
// + v0 audit): Supabase JWT/cookie gate, Zod validation BEFORE
// any AI call, per-user rate limit, stable machine error codes,
// upstream bodies logged server-side only. Auth helper
// intentionally duplicated (same discipline as /api/ai/food —
// never risk breaking the coach route's open PRs).
// ============================================================

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { GROQ_MODELS } from "@/lib/groq-models";
import { callGroq, GroqError, type GroqMessage } from "@/lib/groq";
import { callZaiChat, ZaiChatError, zaiChatConfigured } from "@/lib/zai-chat";
import {
  buildCatalog,
  buildTemplatePlan,
  catalogPrompt,
  estimatePlanMinutes,
  matchLibraryExercise,
} from "@/lib/routine-floor";
import type { ExerciseRecord } from "@/lib/exercise-db";
import {
  ROUTINE_EQUIPMENT,
  ROUTINE_FOCUS,
  ROUTINE_GOALS,
  ROUTINE_LEVELS,
  type PlanExercise,
  type RoutineBrief,
  type RoutineEquipment,
  type RoutineFocus,
  type RoutineGoal,
  type RoutineLevel,
  type RoutinePlan,
} from "@/lib/routine";

export const runtime = "nodejs";
// Free-tier flash models can take 10-30 s under load; the Vercel
// Hobby default of 10 s would kill mid-flight requests.
export const maxDuration = 60;

// ---------- request contract ----------

const RoutineRequestSchema = z.object({
  goal: z.enum(ROUTINE_GOALS),
  level: z.enum(ROUTINE_LEVELS),
  daysPerWeek: z.number().int().min(2).max(6),
  equipment: z.enum(ROUTINE_EQUIPMENT),
  focus: z.enum(ROUTINE_FOCUS),
  notes: z.string().trim().max(300).optional(),
  history: z
    .object({
      recentExercises: z.array(z.string().max(80)).max(16),
      weekSessions: z.number().int().min(0).max(21),
      weekVolumeKg: z.number().min(0).max(1_000_000),
    })
    .optional(),
});

// ---------- per-user rate limiting (routines are expensive) ----------

const RATE_LIMIT = 8;
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

// ---------- the science contract ----------
// Worked examples pin the output shape (GLM imitates examples far
// more reliably than abstract schema descriptions — same lesson
// as the food route). Programming rules are ACSM/NSCA-aligned.

const GOAL_RULES: Record<RoutineGoal, string> = {
  muscle:
    "Goal is muscle growth: 6-12 reps on compounds and 8-15 on isolation, every set within 0-3 reps of failure. Land the session at 4-7 exercises and 16-24 total hard sets for the focus muscles.",
  strength:
    "Goal is strength: the FIRST exercise runs 3-6 reps at RPE 7-9 with 3-5 min rest; the rest are muscle-building accessories at 6-10 reps. Keep 4-6 exercises.",
  fatloss:
    "Goal is fat loss while keeping muscle: compounds at 6-12 reps, isolation at 10-15, rests 45-90 s, and if equipment allows end with one short conditioning block (6-10 min, e.g. rope jumps or bike intervals).",
  endurance:
    "Goal is muscular endurance: 12-20 reps per set, 1-2 reps in reserve, 45-90 s rests, and include one conditioning block.",
  health:
    "Goal is general health and capability: 8-12 reps, moderate effort (RPE 6-8), 60-90 s rests, one exercise per major pattern.",
};

const LEVEL_RULES: Record<RoutineLevel, string> = {
  beginner:
    "Level is beginner: 4-5 exercises only, 2-3 sets each, prefer machines and simple movements over barbell skill lifts, and mention form safety in the notes.",
  intermediate: "Level is intermediate: 5-6 exercises, 3-4 sets on the main lifts.",
  advanced:
    "Level is advanced: 5-7 exercises, up to 4-5 sets on the main lift, intensity techniques allowed on the last isolation exercise (drop set, rest-pause).",
};

const GOAL_LABELS: Record<RoutineGoal, string> = {
  muscle: "build muscle",
  strength: "raw strength",
  fatloss: "fat loss while keeping muscle",
  endurance: "muscular endurance + conditioning",
  health: "general health and capability",
};

const EQUIP_LABELS: Record<RoutineEquipment, string> = {
  gym: "full commercial gym (barbells, machines, cables, dumbbells)",
  home: "home setup — dumbbells, kettlebells, bands, bodyweight only",
  bodyweight: "bodyweight only, no equipment",
};

const FOCUS_HINT: Record<RoutineFocus, string> = {
  auto: "pick today's session to best balance their week",
  push: "chest, shoulders and triceps emphasis",
  pull: "back, rear delts and biceps emphasis",
  legs: "quads, hamstrings, glutes and calves emphasis",
  upper: "balanced upper body (push + pull)",
  lower: "balanced lower body",
  full: "full body — one big movement per pattern",
  cardio: "conditioning and core focus",
};

function scienceSystemPrompt(brief: RoutineBrief): string {
  return [
    "You are Dayflow's strength & conditioning coach. You write ONE complete, science-based training session as pure JSON, choosing exercises ONLY from the catalog in the user message.",
    "",
    "Programming rules you MUST follow (evidence-based, ACSM/NSCA-aligned):",
    "- Exercise order: multi-joint compounds first while fresh; single-joint isolation later.",
    "- Weekly logic: 2-3 training days → full-body sessions; 4 days → upper/lower; 5-6 days → push/pull/legs. Today's session must fit that split.",
    "- Volume honesty: prescribe only sets the athlete can do with good form. Never exceed 8 sets of one exercise.",
    "- Rest guidance: 2-4 min for heavy compounds, 60-90 s for isolation.",
    "- Progression: describe double progression (hit the top of the rep range on all sets, then add load).",
    "- Safety: notes must be practical coaching cues, never medical claims. Respect any injury constraint the user lists by swapping the movement.",
    `- ${GOAL_RULES[brief.goal]}`,
    `- ${LEVEL_RULES[brief.level]}`,
    "",
    "Reply with ONE JSON object only — no markdown fences, no commentary, no thinking:",
    '{"title": string (max 34 chars, e.g. "Push Power — Chest & Delts"),',
    ' "focusSummary": string (max 80 chars, one sentence),',
    ' "science": string (2-3 sentences citing the actual programming logic: rep ranges, volume, frequency),',
    ' "principles": array of 3-5 short strings (e.g. "10-20 sets/muscle/week"),',
    ' "warmup": array of 2-3 short strings,',
    ' "exercises": array of 4-7 objects: {"name": string EXACTLY as written in the catalog, "sets": int 2-6, "reps": string like "6-8" or "10" (omit for timed), "durationSec": int (only for holds/cardio, seconds), "restSec": int 45-300, "rpe": int 6-10, "note": string max 70 chars coaching cue},',
    ' "cooldown": array of 1-3 short strings}',
    "",
    "Worked example (abbreviated):",
    '{"title":"Pull Day — Back & Biceps","focusSummary":"Heavy hinge plus vertical and horizontal pulling.","science":"Heavy rows first hit the mid-back while fresh; 6-10 reps on compounds maximizes mechanical tension, then higher-rep isolation adds volume toward 15 weekly sets per muscle, hit twice weekly.","principles":["Compounds first","12-16 back sets/week","2x frequency/week","Double progression"],"warmup":["5 min easy rowing","Band pull-aparts 2x15"],"exercises":[{"name":"barbell bent-over row","sets":4,"reps":"6-8","restSec":180,"rpe":8,"note":"Brace hard, pull to the lower ribs."},{"name":"cable seated row","sets":3,"reps":"10-12","restSec":105,"rpe":8,"note":"Squeeze 1 s at full contraction."},{"name":"barbell curl","sets":3,"reps":"10-12","restSec":60,"rpe":9,"note":"No swinging — control the negative."}],"cooldown":["Lat stretch 30 s/side"]}',
  ].join("\n");
}

function userPrompt(brief: RoutineBrief, catalogText: string): string {
  const lines = [
    `Athlete brief:`,
    `- Goal: ${GOAL_LABELS[brief.goal]}`,
    `- Level: ${brief.level}`,
    `- Training days/week: ${brief.daysPerWeek} (today's session should fit a sensible split for this frequency)`,
    `- Equipment available: ${EQUIP_LABELS[brief.equipment]}`,
    `- Today's focus: ${brief.focus === "auto" ? FOCUS_HINT.auto : `${brief.focus} (${FOCUS_HINT[brief.focus]})`}`,
  ];
  if (brief.notes) lines.push(`- User constraints: "${brief.notes}"`);
  if (
    brief.history &&
    (brief.history.recentExercises.length > 0 || brief.history.weekSessions > 0)
  ) {
    const h = brief.history;
    const bits: string[] = [];
    if (h.recentExercises.length > 0)
      bits.push(
        `most-logged exercises: ${h.recentExercises.slice(0, 12).join(", ")}`
      );
    if (h.weekSessions > 0)
      bits.push(
        `this week: ${h.weekSessions} session(s)${
          h.weekVolumeKg > 0
            ? `, ~${Math.round(h.weekVolumeKg).toLocaleString("en-US")} kg volume`
            : ""
        }`
      );
    lines.push(
      `- Training history (personalize, but keep variety): ${bits.join("; ")}`
    );
  }
  lines.push(
    "",
    "Exercise catalog — pick ONLY from these exact names:",
    catalogText
  );
  return lines.join("\n");
}

// ---------- lenient JSON extraction (mirrors /api/ai/food) ----------

// Concatenated so no literal closing tag ever appears in source.
const THINK_OPEN = "<" + "think" + ">";
const THINK_CLOSE = "</" + "think" + ">";

function stripThinkBlocks(text: string): string {
  let out = "";
  let rest = text;
  for (;;) {
    const open = rest.indexOf(THINK_OPEN);
    if (open === -1) return out + rest;
    out += rest.slice(0, open);
    const close = rest.indexOf(THINK_CLOSE, open + THINK_OPEN.length);
    if (close === -1) return out; // unterminated thinking — drop the tail
    rest = rest.slice(close + THINK_CLOSE.length);
  }
}

/** First {...} whose braces balance, respecting strings/escapes. */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// ---------- validation + library mapping ----------

/** "6-8" / "6–8" / "6 to 8" / "10" / "AMRAP" → [lo, hi] | null */
function parseReps(v: unknown): [number, number] | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.min(50, Math.max(1, Math.round(v)));
    return [n, n];
  }
  if (typeof v !== "string") return null;
  const m = v.match(/(\d+)\s*(?:[-–—]|to)\s*(\d+)/i);
  if (m) {
    const lo = Math.min(50, Math.max(1, parseInt(m[1], 10)));
    const hi = Math.min(50, Math.max(lo, parseInt(m[2], 10)));
    return [lo, hi];
  }
  const single = v.match(/(\d+)/);
  if (single) {
    const n = Math.min(50, Math.max(1, parseInt(single[1], 10)));
    return [n, n];
  }
  return null; // AMRAP / prose — treated as unspecified
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n =
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
};

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Turn one model answer into a validated RoutinePlan mapped onto
 * real library rows. Returns null when the answer is unusable
 * (too few catalog matches) — the cascade then advances.
 */
function buildPlanFromModel(
  raw: string,
  brief: RoutineBrief,
  catalog: ExerciseRecord[]
): RoutinePlan | null {
  const cleaned = stripThinkBlocks(raw)
    .replace(/```(?:json)?/gi, "")
    .trim();
  const objectText = firstBalancedObject(cleaned);
  if (!objectText) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(objectText);
  } catch {
    return null;
  }

  const rawExercises = Array.isArray(parsed.exercises) ? parsed.exercises : [];
  if (rawExercises.length < 3) return null;

  const exercises: PlanExercise[] = [];
  const seen = new Set<string>();
  for (const item of rawExercises) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = cleanText(r.name, 80);
    if (!name) continue;
    const match = matchLibraryExercise(name, catalog);
    if (!match || seen.has(match.id)) continue;
    seen.add(match.id);
    const reps = parseReps(r.reps);
    const durationSec =
      reps == null && typeof r.durationSec === "number"
        ? clampInt(r.durationSec, 10, 1800, 60)
        : null;
    exercises.push({
      id: match.id,
      n: match.name, // library name is authoritative
      t: match.target,
      e: match.equipment,
      sets: clampInt(r.sets, 1, 8, 3),
      lo: durationSec != null ? null : (reps?.[0] ?? 10),
      hi: durationSec != null ? null : (reps?.[1] ?? 10),
      durationSec,
      restSec: clampInt(r.restSec, 30, 360, 90),
      rpe: typeof r.rpe === "number" ? clampInt(r.rpe, 4, 10, 8) : null,
      note: cleanText(r.note, 90),
    });
  }

  // a plan with <3 usable catalog exercises is a hop failure
  if (exercises.length < 3) return null;

  const title = cleanText(parsed.title, 40) ?? "Training session";
  const focusSummary = cleanText(parsed.focusSummary, 90) ?? "";
  const science = cleanText(parsed.science, 400) ?? "";
  const principles = (Array.isArray(parsed.principles) ? parsed.principles : [])
    .map((p) => cleanText(p, 40))
    .filter((p): p is string => !!p)
    .slice(0, 5);
  const warmup = (Array.isArray(parsed.warmup) ? parsed.warmup : [])
    .map((w) => cleanText(w, 80))
    .filter((w): w is string => !!w)
    .slice(0, 4);
  const cooldown = (Array.isArray(parsed.cooldown) ? parsed.cooldown : [])
    .map((c) => cleanText(c, 80))
    .filter((c): c is string => !!c)
    .slice(0, 4);

  return {
    title,
    focusSummary,
    science,
    principles,
    warmup,
    cooldown,
    exercises,
    estMinutes: estimatePlanMinutes(exercises),
    goal: brief.goal,
    level: brief.level,
    equipment: brief.equipment,
    focus: brief.focus,
    daysPerWeek: brief.daysPerWeek,
  };
}

// ---------- hop resilience ----------

const HOP_TIMEOUT_MS = 45_000;

function retryClass(e: unknown): boolean {
  const status =
    e instanceof GroqError || e instanceof ZaiChatError ? e.status : -1;
  if ([400, 404, 408, 429, 500, 502, 503, 504].includes(status)) return true;
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

function logHop(hop: string, e: unknown) {
  const status =
    e instanceof GroqError || e instanceof ZaiChatError
      ? e.status
      : e instanceof Error
        ? e.name
        : "?";
  console.warn(`[workout-plan] hop failed (${hop}): ${status}`);
}

// ---------- auth (duplicated from the food route on purpose) ----------

async function verifyRequester(authHeader: string | null): Promise<string | null> {
  const cookieClient = await createClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (user) return user.id;

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
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

// ---------- the cascade ----------

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const userId = await verifyRequester(authHeader);
  if (!userId) {
    return Response.json(
      { code: "INVALID_SESSION", error: "Sign in again — your session expired." },
      { status: 401 }
    );
  }

  const parsed = RoutineRequestSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json(
      { code: "INVALID_REQUEST", error: "That routine brief didn't look right." },
      { status: 400 }
    );
  }

  if (rateLimited(userId)) {
    return Response.json(
      {
        code: "RATE_LIMITED",
        error:
          "That's a few routines quickly — give it a minute before generating another.",
      },
      { status: 429 }
    );
  }

  const brief = parsed.data as RoutineBrief;
  const catalog = buildCatalog(brief);
  const system = scienceSystemPrompt(brief);
  const user = userPrompt(brief, catalogPrompt(catalog));

  try {
    // Hop 1: z.ai free GLM text chain — the primary brain.
    if (zaiChatConfigured()) {
      try {
        const zai = await callZaiChat({
          system,
          user,
          temperature: 0.7,
          maxTokens: 3072,
          signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        });
        const plan = buildPlanFromModel(zai.content, brief, catalog);
        if (plan) {
          return Response.json({ plan, source: "ai", model: zai.model });
        }
        // usable-but-unparseable answer → try the next brain
        console.warn("[workout-plan] z.ai answer didn't map to the library");
      } catch (e) {
        if (retryClass(e)) logHop("zai-chat", e);
        else throw e;
      }
    }

    // Hop 2: Groq qwen3.8 in strict JSON mode.
    try {
      const messages: GroqMessage[] = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];
      const raw = await callGroq({
        messages,
        model: GROQ_MODELS.qwen38,
        json: true,
        temperature: 0.7,
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
      });
      const plan = buildPlanFromModel(raw, brief, catalog);
      if (plan) {
        return Response.json({ plan, source: "ai", model: GROQ_MODELS.qwen38 });
      }
      console.warn("[workout-plan] groq answer didn't map to the library");
    } catch (e) {
      if (retryClass(e)) logHop("groq", e);
      else throw e;
    }

    // Floor: deterministic evidence-based template, honestly labeled.
    return Response.json({
      plan: buildTemplatePlan(brief),
      source: "fallback",
    });
  } catch (e: unknown) {
    console.error("[workout-plan] generation failed:", e);
    return Response.json(
      {
        code: "ROUTINE_UNAVAILABLE",
        error: "Couldn't build a routine right now. Try again in a moment.",
      },
      { status: 502 }
    );
  }
}

export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
