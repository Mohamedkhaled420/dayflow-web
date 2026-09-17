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
//   photo:   z.ai GLM-4V-Flash (free)  →  Groq llama-4-scout
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

const FOOD_JSON_CONTRACT = `You are a nutrition estimator. Analyze the food and reply with ONE JSON object, no markdown fences, no commentary:
{"name": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}
Rules: name is a short human label (max 6 words, e.g. "Grilled chicken salad"); calories is a whole-number kcal estimate for what is visible/described as ONE realistic serving; protein_g/carbs_g/fat_g are whole-number grams. If you truly cannot identify food, reply {"name":"Unknown food","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}. Estimates only — never claim medical accuracy.`;

export interface FoodReply {
  estimate: FoodEstimate;
  source: "ai" | "fallback";
  model?: string;
}

/**
 * Lenient JSON extraction: GLM wraps answers in ```json fences even
 * when told not to; some hops prepend a sentence. Pull the first
 * {...} block and parse; null when nothing parseable.
 */
function parseEstimateJson(raw: string): FoodEstimate | null {
  const fenced = raw.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
    const n = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;
    const calories = n(obj.calories);
    const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 80) : "";
    if (calories === null || !name) return null;
    return {
      name,
      calories: Math.min(calories, 10_000),
      protein_g: n(obj.protein_g),
      carbs_g: n(obj.carbs_g),
      fat_g: n(obj.fat_g),
    };
  } catch {
    return null;
  }
}

// ---------- hop resilience ----------

const HOP_TIMEOUT_MS = 25_000;

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

  // Hop 1: z.ai GLM-4V-Flash — free tier, routes first. A missing
  // ZAI_API_KEY throws retry-class (503) and simply advances.
  try {
    const raw = await callZaiVision({
      prompt,
      imageBase64,
      mimeType,
      signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    });
    const estimate = parseEstimateJson(raw);
    if (estimate && estimate.name !== "Unknown food" && estimate.calories > 0) {
      return { estimate, source: "ai", model: "glm-4v-flash" };
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
