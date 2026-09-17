// ============================================================
// Dayflow AI — z.ai vision client (Phase 9 Nutrition)
// ------------------------------------------------------------
// Raw-fetch client for Z.ai's OpenAI-compatible endpoint, used as
// the PRIMARY food-photo hop by /api/ai/food. GLM-4V-Flash is the
// free-tier vision model on the platform, which is why it routes
// first — GLM-4.1V-Thinking-Flash (also free) backs it up, then
// Groq's llama-4-scout, then the text cascade, then the offline
// estimator.
//
// Zero SDK (house rule, PRD §10.2): raw fetch, no dependencies.
// Auth is a single Bearer key, accepted under any of the common
// env spellings so a Vercel variable named ZAI_API_KEY,
// Z_AI_API_KEY, ZAI_KEY, GLM_API_KEY, ZHIPU_API_KEY or
// ZHIPUAI_API_KEY all work:
//
//   ZAI_API_KEY      — free key from https://z.ai (API keys page)
//   ZAI_BASE_URL     — optional override (default public v4 endpoint)
//   ZAI_VISION_MODEL — optional override (pins ONE model instead
//                      of the default free-tier chain below)
//
// When no key is configured this client throws a retry-class
// ZaiVisionError(503) and the cascade advances — the app works
// with no key at all and upgrades to free vision the moment one
// is configured.
//
// Error contract mirrors groq.ts: status-carrying error, upstream
// bodies logged server-side only, never returned to the client.
// ============================================================

const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";

/**
 * Free vision tiers, most stable first. The thinking revision
 * emits reasoning blocks before the JSON, which the route's
 * lenient parser strips — it is kept as a fallback in case the
 * flash revision is rate-limited or retired.
 */
const DEFAULT_VISION_MODELS: readonly string[] = [
  "glm-4v-flash",
  "glm-4.1v-thinking-flash",
];

/** Thinking revisions spend tokens on reasoning before the JSON. */
const THINKING_MODEL_MAX_TOKENS = 3072;
const DEFAULT_MAX_TOKENS = 800;

/** One quick in-hop retry on these before advancing the cascade. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, 429, 500, 502, 503, 504,
]);
const RETRY_DELAY_MS = 600;

export class ZaiVisionError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ZaiVisionError";
  }
}

/**
 * The key under any of its common env spellings. The route tells
 * users to configure ZAI_API_KEY, but accepting the frequent
 * aliases (Z_AI_API_KEY, ZAI_KEY, GLM_API_KEY, ZHIPU_API_KEY,
 * ZHIPUAI_API_KEY) means a differently-spelled Vercel variable
 * still lights up free vision instead of silently skipping.
 */
function zaiApiKey(): string | undefined {
  return (
    process.env.ZAI_API_KEY ||
    process.env.Z_AI_API_KEY ||
    process.env.ZAI_KEY ||
    process.env.GLM_API_KEY ||
    process.env.ZHIPU_API_KEY ||
    process.env.ZHIPUAI_API_KEY ||
    undefined
  );
}

export function zaiVisionConfigured(): boolean {
  return Boolean(zaiApiKey());
}

export interface CallZaiVisionOptions {
  /** Instruction prompt — the JSON contract lives in the route. */
  prompt: string;
  /** Base64 image payload (no data: prefix). */
  imageBase64: string;
  mimeType?: string;
  temperature?: number;
  /** Abort/timeout signal for the upstream fetch. */
  signal?: AbortSignal;
}

export interface ZaiVisionReply {
  /** Raw assistant text (the route parses it leniently). */
  content: string;
  /** The model that actually answered (reported to the client). */
  model: string;
}

/**
 * Estimate food from a photo via the z.ai free vision chain.
 * Tries each model once (with a single quick retry on
 * rate-limit/5xx); any model that answers wins, the cascade only
 * advances when every model fails or returns nothing usable.
 */
export async function callZaiVision(
  opts: CallZaiVisionOptions
): Promise<ZaiVisionReply> {
  const apiKey = zaiApiKey();
  if (!apiKey) {
    throw new ZaiVisionError(503, "ZAI_API_KEY is not configured");
  }

  const baseUrl = (process.env.ZAI_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );
  const models = process.env.ZAI_VISION_MODEL
    ? [process.env.ZAI_VISION_MODEL]
    : DEFAULT_VISION_MODELS;

  let lastError: unknown = new ZaiVisionError(503, "no z.ai model answered");

  for (const model of models) {
    const maxTokens = model.includes("thinking")
      ? THINKING_MODEL_MAX_TOKENS
      : DEFAULT_MAX_TOKENS;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: opts.prompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${opts.mimeType ?? "image/jpeg"};base64,${opts.imageBase64}`,
                    },
                  },
                ],
              },
            ],
            temperature: opts.temperature ?? 0.2,
            max_tokens: maxTokens,
            // No response_format: not guaranteed across GLM vision
            // revisions — the prompt demands JSON and the parser is
            // fence/think-tolerant instead.
          }),
          signal: opts.signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const err = new ZaiVisionError(res.status, body);
          lastError = err;
          if (RETRYABLE_STATUSES.has(res.status) && attempt === 0) continue;
          break; // non-retryable (or retried already) — next model
        }

        const data = await res.json();
        const content: string = data.choices?.[0]?.message?.content ?? "";
        if (!content.trim()) {
          lastError = new ZaiVisionError(503, "empty vision answer");
          if (attempt === 0) continue; // one retry — flash revisions
          // sometimes emit an empty first completion under load
          break;
        }
        return { content, model };
      } catch (e) {
        if (opts.signal?.aborted) throw e; // route timeout wins
        lastError = e;
        if (attempt === 0) continue; // transient network error — retry once
        break;
      }
    }
  }

  throw lastError instanceof ZaiVisionError
    ? lastError
    : new ZaiVisionError(502, "z.ai vision failed");
}
