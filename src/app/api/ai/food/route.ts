// ============================================================
// Dayflow AI — food estimation route (Phase 9 Nutrition, PRD §4.6)
// ------------------------------------------------------------
// Cal AI-style calorie + macro estimation. Accepts EITHER a food
// photo (base64) OR a free-text description, and returns one
// editable estimate the client confirms before anything is logged
// (nothing lands in meal_logs from this route — the store owns
// writes, same optimistic discipline as every other log).
//
// Cascade (free tiers first):
//   photo:   z.ai GLM-4V-Flash → GLM-4.1V-Thinking-Flash (both free,
//            ZAI_API_KEY)  →  Groq llama-4-scout
//   text:    Groq coach cascade (qwen38 → gptOss120b → qwen36)
//   floor:   offline estimator (src/lib/food-db.ts), source:"fallback"
//
// Auth/robustness mirrors the coach route (Amendment #12 + v0
// audit): Supabase JWT/cookie gate, Zod validation BEFORE any AI
// call, per-user rate limit, stable machine error codes, upstream
// bodies logged server-side only. The auth helper is intentionally
// duplicated (not extracted) so this route can never break the
// open coach PRs by touching their files.
// ============================================================

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { GROQ_MODELS } from "@/lib/groq-models";
import {
  callGroq,
  callGroqVision,
  GroqError,
  type GroqMessage,
} from "@/lib/groq";
import { callZaiVision, ZaiVisionError } from "@/lib/zai-vision";
import { estimateMealFromText, type FoodEstimate } from "@/lib/food-db";

export const runtime = "nodejs";
// Vision hops can legitimately take ~10-25s (thinking revisions,
// retries); the Vercel Hobby default of 10s would kill mid-flight
// requests with a bare 504. 60s is the Hobby ceiling.
export const maxDuration = 60;

// ---------- request contract ----------

const MAX_IMAGE_BASE64 = 6_000_000; // ~4.5 MB binary after client downscale

const FoodRequestSchema = z
  .object({
    /** Base64 JPEG/PNG/WebP payload (no data: prefix). */
    imageBase64: z.string().max(MAX_IMAGE_BASE64).optional(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
    /** Free-text meal description ("2 eggs and toast with avocado"). */
    description: z.string().trim().min(2).max(500).optional(),
  })
  .refine((v) => v.imageBase64 || v.description, {
    message: "either an image or a description is required",
  });

// ---------- per-user rate limiting (mirrors the coach route) ----------

const RATE_LIMIT = 20;
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

// ---------- JSON contract (shared by every hop) ----------

// Tuned against real GLM vision answers: portion heuristics stop the
// model from guessing tiny servings, the macro-consistency rule keeps
// calories/macros from contradicting each other, and worked examples
// pin the exact output shape (GLM imitates examples far more reliably
// than it follows abstract schema descriptions).
const FOOD_JSON_CONTRACT = `You are a nutrition estimator used by a calorie-tracking app. Analyze the meal and reply with ONE JSON object only — no markdown fences, no commentary, no thinking:
{"name": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}

Estimating rules:
- Estimate what is visible or described as ONE realistic serving — what a person would actually sit down and eat, not 100 grams of it.
- Portion cues: dinner plate ≈ 26-28 cm across; palm-sized piece of meat, fish or poultry ≈ 120 g cooked; a fist ≈ 1 cup (≈ 150 g cooked rice or pasta, ≈ 30 g dry cereal); a thumb ≈ 1 tbsp oil, butter or nut butter; a deck of cards ≈ 30 g hard cheese; a scoop of ice cream ≈ 65 g.
- Several foods on one plate: name the plate overall (e.g. "Chicken, rice & salad") and total everything visible, including dressings and oils.
- Packaged food with a readable label: use the label values for the serving shown.
- Drinks count: 330 ml regular soda ≈ 140 kcal; 350 ml latte with whole milk ≈ 190 kcal; 350 ml fresh juice ≈ 150 kcal.
- Consistency check before answering: calories must be within ±25% of 4*protein_g + 4*carbs_g + 9*fat_g. If not, adjust the macros until they add up.
- name: short human label, max 6 words, no emoji. All numbers are whole numbers ≥ 0.
- If there is genuinely no identifiable food, reply exactly {"name":"Unknown food","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}.
- These are estimates only — never claim medical or lab accuracy.

Examples:
- "2 fried eggs, 2 slices of buttered toast and half an avocado" → {"name":"Eggs, toast & avocado","calories":560,"protein_g":24,"carbs_g":38,"fat_g":34}
- "a cheeseburger with medium fries" → {"name":"Cheeseburger & fries","calories":870,"protein_g":34,"carbs_g":82,"fat_g":45}
- "a bowl of greek yogurt with honey" → {"name":"Greek yogurt & honey","calories":220,"protein_g":17,"carbs_g":28,"fat_g":5}`;

export interface FoodReply {
  estimate: FoodEstimate;
  source: "ai" | "fallback";
  model?: string;
}

/**
 * Lenient JSON extraction, hardened against every shape seen from
 * GLM / Groq vision answers: markdown fences, a leading sentence,
 * reasoning blocks emitted by GLM thinking revisions, numeric strings,
 * top-level arrays of per-item objects (summed), and multiple
 * objects (first balanced one wins — indexOf/lastIndexOf would
 * fuse two objects into unparseable text). Null when nothing
 * usable is found.
 */

// Concatenated so no literal closing tag ever appears in source
// (tooling + JSX-safety house pattern, same as groq.ts sseDeltas).
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

/** First [...] whose brackets balance (arrays of per-item objects). */
function firstBalancedArray(text: string): string | null {
  const start = text.indexOf("[");
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
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Numbers may arrive as numbers or numeric strings ("350", "1,200"). */
function toCount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.round(v));
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(/[ ,]/g, ""));
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return null;
}

const MAX_CALORIES = 10_000;
const MAX_PROTEIN_FAT = 600;
const MAX_CARBS = 1_200;

function fromObject(obj: Record<string, unknown>): FoodEstimate | null {
  const calories = toCount(obj.calories);
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 80)
      : "";
  if (calories === null || calories <= 0 || !name) return null;
  const clamp = (v: unknown, max: number) => {
    const n = toCount(v);
    return n === null ? null : Math.min(n, max);
  };
  return {
    name,
    calories: Math.min(calories, MAX_CALORIES),
    protein_g: clamp(obj.protein_g, MAX_PROTEIN_FAT),
    carbs_g: clamp(obj.carbs_g, MAX_CARBS),
    fat_g: clamp(obj.fat_g, MAX_PROTEIN_FAT),
  };
}

function parseEstimateJson(raw: string): FoodEstimate | null {
  const cleaned = stripThinkBlocks(raw)
    .replace(/```(?:json)?/gi, "")
    .trim();

  const objectText = firstBalancedObject(cleaned);
  if (objectText) {
    try {
      const parsed = JSON.parse(objectText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const estimate = fromObject(parsed as Record<string, unknown>);
        if (estimate) return estimate;
      }
    } catch {
      // fall through to the array path
    }
  }

  // Some revisions answer with an array of per-item objects — sum
  // them into one meal estimate (matches the single-row contract).
  const arrayText = firstBalancedArray(cleaned);
  if (arrayText) {
    try {
      const items = JSON.parse(arrayText);
      if (Array.isArray(items) && items.length > 0) {
        const parts = items
          .map((i) =>
            i && typeof i === "object" ? fromObject(i as Record<string, unknown>) : null
          )
          .filter((i): i is FoodEstimate => i !== null);
        if (parts.length > 0) {
          const sum = (pick: (e: FoodEstimate) => number | null) =>
            parts.reduce<number | null>((acc, e) => {
              const v = pick(e);
              return acc === null || v === null ? (acc ?? v) : acc + v;
            }, null);
          return {
            name: parts[0].name,
            calories: Math.min(sum((e) => e.calories) ?? 0, MAX_CALORIES),
            protein_g: sum((e) => e.protein_g),
            carbs_g: sum((e) => e.carbs_g),
            fat_g: sum((e) => e.fat_g),
          };
        }
      }
    } catch {
      // nothing usable
    }
  }

  return null;
}

// ---------- hop resilience ----------

const HOP_TIMEOUT_MS = 30_000; // shared by the z.ai chain + Groq vision hop

function retryClass(e: unknown): boolean {
  const status = e instanceof GroqError || e instanceof ZaiVisionError ? e.status : -1;
  if ([400, 404, 408, 429, 500, 502, 503, 504].includes(status)) return true;
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

function logHop(hop: string, e: unknown) {
  const status = e instanceof GroqError || e instanceof ZaiVisionError ? e.status : e instanceof Error ? e.name : "?";
  console.warn(`[food] hop failed (${hop}): ${status}`);
}

// ---------- the cascades ----------

async function estimateFromPhoto(
  imageBase64: string,
  mimeType: string,
  hint?: string
): Promise<FoodReply | null> {
  const prompt =
    FOOD_JSON_CONTRACT +
    (hint ? `\nThe user added this note: "${hint}". Weigh it in your estimate.` : "");

  // Hop 1: z.ai free vision chain (GLM-4V-Flash, then the thinking
  // revision). A missing ZAI_API_KEY throws retry-class (503) and
  // simply advances. Reports the model that actually answered.
  try {
    const zai = await callZaiVision({
      prompt,
      imageBase64,
      mimeType,
      signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    });
    const estimate = parseEstimateJson(zai.content);
    if (estimate && estimate.name !== "Unknown food" && estimate.calories > 0) {
      return { estimate, source: "ai", model: zai.model };
    }
  } catch (e) {
    if (retryClass(e)) logHop("zai-vision", e);
    else throw e;
  }

  // Hop 2: Groq llama-4-scout — the existing free Groq account.
  try {
    const raw = await callGroqVision({
      model: GROQ_MODELS.llama4Scout,
      prompt,
      imageBase64,
      mimeType,
      signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    });
    const estimate = parseEstimateJson(raw);
    if (estimate && estimate.name !== "Unknown food" && estimate.calories > 0) {
      return { estimate, source: "ai", model: GROQ_MODELS.llama4Scout };
    }
  } catch (e) {
    if (retryClass(e)) logHop("groq-vision", e);
    else throw e;
  }

  return null; // both vision hops exhausted
}

async function estimateFromText(description: string): Promise<FoodReply | null> {
  const messages: GroqMessage[] = [
    { role: "system", content: FOOD_JSON_CONTRACT },
    { role: "user", content: `Estimate this meal: ${description}` },
  ];
  // Same cheap-first order as the coach's workout route.
  for (const model of [GROQ_MODELS.qwen38, GROQ_MODELS.gptOss120b, GROQ_MODELS.qwen36]) {
    try {
      const raw = await callGroq({
        messages,
        model,
        json: true,
        temperature: 0.2,
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
      });
      const estimate = parseEstimateJson(raw);
      if (estimate && estimate.name !== "Unknown food" && estimate.calories > 0) {
        return { estimate, source: "ai", model };
      }
    } catch (e) {
      if (retryClass(e)) logHop(`text:${model}`, e);
      else throw e;
    }
  }
  return null;
}

// ---------- auth (duplicated from the coach route on purpose:
// extracting a shared helper would touch coach/route.ts and risk
// conflicting with the open coach PRs; consolidate after they land) ----------

async function verifyRequester(authHeader: string | null): Promise<string | null> {
  const cookieClient = await createClient();
  const { data: { user } } = await cookieClient.auth.getUser();
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
  const { data: { user: bearerUser } } = await bearerClient.auth.getUser();
  return bearerUser?.id ?? null;
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

  const parsed = FoodRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: "INVALID_REQUEST", error: "That request didn't look right." },
      { status: 400 }
    );
  }

  if (rateLimited(userId)) {
    return Response.json(
      {
        code: "RATE_LIMITED",
        error: "You're logging quickly — give it a moment before trying again.",
      },
      { status: 429 }
    );
  }

  const { imageBase64, mimeType, description } = parsed.data;

  try {
    // ---------- photo path ----------
    if (imageBase64) {
      const reply = await estimateFromPhoto(
        imageBase64,
        mimeType ?? "image/jpeg",
        description
      );
      if (reply) return Response.json(reply);
      // Vision hops exhausted: if the user attached a note, the text
      // cascade still gets a chance with it.
      if (description && description.length >= 2) {
        const textReply = await estimateFromText(description);
        if (textReply) return Response.json(textReply);
      }
      return Response.json(
        {
          code: "FOOD_VISION_UNAVAILABLE",
          error: "Couldn't analyze that photo — try describing the meal in words.",
        },
        { status: 503 }
      );
    }

    // ---------- text path ----------
    const reply = await estimateFromText(description!);
    if (reply) return Response.json(reply);

    // Offline estimator floor — honestly labeled.
    const offline = estimateMealFromText(description!);
    if (offline) {
      return Response.json({ estimate: offline, source: "fallback" });
    }
    return Response.json(
      {
        code: "NO_FOOD_MATCH",
        error: "Couldn't estimate that — enter it manually?",
      },
      { status: 422 }
    );
  } catch (e: unknown) {
    console.error("[food] estimation failed:", e);
    return Response.json(
      {
        code: "FOOD_UNAVAILABLE",
        error: "Food estimation is unreachable right now. Try again in a moment.",
      },
      { status: 502 }
    );
  }
}

export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
