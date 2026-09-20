// ============================================================
// Dayflow AI — z.ai vision client (Phase 9 Nutrition)
// ------------------------------------------------------------
// Raw-fetch client for Z.ai's OpenAI-compatible endpoint, used as
// the PRIMARY food-photo hop by /api/ai/food. The free vision
// tier depends on WHICH platform issued the key:
//
//   api.z.ai (international)        → glm-4.6v-flash  (free)
//   open.bigmodel.cn (China)        → glm-4v-flash    (free)
//
// The two platforms share the API shape but NOT model catalogs:
// "glm-4v-flash" / "glm-4.1v-thinking-flash" are bigmodel.cn-only
// IDs that 400 with code 1211 ("Unknown Model") on api.z.ai, and
// "glm-4.6v-flash" is international-only. So the client tries the
// international hop first, and a key that fails auth there (1000-
// series 401) falls through to the bigmodel.cn hop — one key from
// either platform lights up free vision with zero configuration.
//
// Zero SDK (house rule, PRD §10.2): raw fetch, no dependencies.
// Auth is a single Bearer key, accepted under any of the common
// env spellings so a Vercel variable named ZAI_API_KEY,
// Z_AI_API_KEY, ZAI_KEY, GLM_API_KEY, ZHIPU_API_KEY or
// ZHIPUAI_API_KEY all work:
//
//   ZAI_API_KEY      — free key from https://z.ai (API keys page)
//   ZAI_BASE_URL     — optional override (replaces the
//                      international base; also disables the
//                      bigmodel.cn fallback hop)
//   ZAI_VISION_MODEL — optional override (pins ONE model on the
//                      international base instead of the default)
//
// When no key is configured this client throws a retry-class
// ZaiVisionError(503) and the cascade advances — the app works
// with no key at all and upgrades to free vision the moment one
// is configured.
//
// Error contract mirrors groq.ts: status-carrying error, upstream
// bodies logged server-side only, never returned to the client.
// ============================================================

const INTERNATIONAL_BASE_URL = "https://api.z.ai/api/paas/v4";
const CN_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

/** One (platform, model) attempt — see the header comment. */
interface VisionHop {
  baseUrl: string;
  model: string;
  label: string;
}

function defaultHops(): VisionHop[] {
  // Explicit base override (local proxy / self-hosted relay):
  // single hop, caller owns the routing.
  if (process.env.ZAI_BASE_URL) {
    const model = process.env.ZAI_VISION_MODEL ?? "glm-4.6v-flash";
    return [
      { baseUrl: process.env.ZAI_BASE_URL, model, label: `custom ${model}` },
    ];
  }
  // Explicit model override pins that model on the international
  // platform (paid tiers like glm-4.6v work here too).
  if (process.env.ZAI_VISION_MODEL) {
    return [
      {
        baseUrl: INTERNATIONAL_BASE_URL,
        model: process.env.ZAI_VISION_MODEL,
        label: `z.ai ${process.env.ZAI_VISION_MODEL}`,
      },
    ];
  }
  return [
    {
      baseUrl: INTERNATIONAL_BASE_URL,
      model: "glm-4.6v-flash",
      label: "z.ai glm-4.6v-flash",
    },
    {
      baseUrl: CN_BASE_URL,
      model: "glm-4v-flash",
      label: "bigmodel glm-4v-flash",
    },
  ];
}

/** Thinking revisions spend tokens on reasoning before the JSON. */
const THINKING_MODEL_MAX_TOKENS = 3072;
const DEFAULT_MAX_TOKENS = 800;

/**
 * GLM-4.6V honors the thinking switch (docs: "Thinking Mode
 * Switch"); forced-thinking models (glm-4.5v, glm-5.3*) REJECT a
 * disabled switch, and pre-4.5 revisions predate the parameter.
 * Only send it where it is documented to work.
 */
function wantsThinkingDisabled(model: string): boolean {
  return /4\.6v/.test(model);
}

/** Models that emit reasoning no matter what get a bigger budget. */
function isForcedThinking(model: string): boolean {
  return /thinking|4\.5v|5\.3/.test(model);
}

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
 * Tries each (platform, model) hop once (with a single quick
 * retry on rate-limit/5xx); any hop that answers wins, the
 * cascade only advances when every hop fails or returns nothing
 * usable.
 */
export async function callZaiVision(
  opts: CallZaiVisionOptions
): Promise<ZaiVisionReply> {
  const apiKey = zaiApiKey();
  if (!apiKey) {
    throw new ZaiVisionError(503, "ZAI_API_KEY is not configured");
  }

  let lastError: unknown = new ZaiVisionError(503, "no z.ai model answered");

  for (const hop of defaultHops()) {
    const maxTokens = isForcedThinking(hop.model)
      ? THINKING_MODEL_MAX_TOKENS
      : DEFAULT_MAX_TOKENS;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
      try {
        const body: Record<string, unknown> = {
          model: hop.model,
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
        };
        if (wantsThinkingDisabled(hop.model)) {
          // Clean, fast answers — the worked examples in the route
          // prompt pin the output shape better than reasoning does.
          body.thinking = { type: "disabled" };
        }

        const res = await fetch(`${hop.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: opts.signal,
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          const err = new ZaiVisionError(
            res.status,
            `${hop.label}: ${errBody.slice(0, 300)}`
          );
          lastError = err;
          if (RETRYABLE_STATUSES.has(res.status) && attempt === 0) continue;
          break; // non-retryable (or retried already) — next hop
        }

        const data = await res.json();
        const content: string = data.choices?.[0]?.message?.content ?? "";
        if (!content.trim()) {
          lastError = new ZaiVisionError(503, `${hop.label}: empty vision answer`);
          if (attempt === 0) continue; // one retry — flash revisions
          // sometimes emit an empty first completion under load
          break;
        }
        return { content, model: hop.model };
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
