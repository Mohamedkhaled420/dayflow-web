// ============================================================
// Dayflow AI — z.ai text client (Phase 10 Workouts)
// ------------------------------------------------------------
// Raw-fetch client for Z.ai's OpenAI-compatible chat endpoint,
// used as the PRIMARY hop by /api/ai/workout-plan. Mirrors
// zai-vision.ts on purpose (same platform-hopping logic, same
// error contract) so the two stay interchangeable:
//
//   api.z.ai (international)   → glm-4.5-flash   (free)
//   open.bigmodel.cn (China)   → glm-4-flash     (free)
//
// The two platforms share the API shape but NOT model catalogs
// (see zai-vision.ts header), so the client tries the
// international hop first and a 1000-series 401 falls through
// to the bigmodel.cn hop — one key from either platform lights
// up free text generation with zero configuration.
//
// Zero SDK (house rule, PRD §10.2): raw fetch, no dependencies.
// Key accepted under the same env spellings as zai-vision:
// ZAI_API_KEY / Z_AI_API_KEY / ZAI_KEY / GLM_API_KEY /
// ZHIPU_API_KEY / ZHIPUAI_API_KEY. Overrides specific to text:
//
//   ZAI_TEXT_MODEL — pin ONE text model on the international
//                    base (paid tiers like glm-4.6 work here)
//   ZAI_BASE_URL   — replaces the international base and also
//                    disables the bigmodel.cn fallback hop
//
// When no key is configured this client throws a retry-class
// ZaiChatError(503) and the cascade advances — routine building
// still works via Groq and the template floor.
// ============================================================

const INTERNATIONAL_BASE_URL = "https://api.z.ai/api/paas/v4";
const CN_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

/** One (platform, model) attempt — see the header comment. */
interface ChatHop {
  baseUrl: string;
  model: string;
  label: string;
}

function defaultHops(): ChatHop[] {
  // Explicit base override (local proxy / self-hosted relay):
  // single hop, caller owns the routing.
  if (process.env.ZAI_BASE_URL) {
    const model = process.env.ZAI_TEXT_MODEL ?? "glm-4.5-flash";
    return [
      { baseUrl: process.env.ZAI_BASE_URL, model, label: `custom ${model}` },
    ];
  }
  // Explicit model override pins that model on the international
  // platform (paid tiers like glm-4.6 work here too).
  if (process.env.ZAI_TEXT_MODEL) {
    return [
      {
        baseUrl: INTERNATIONAL_BASE_URL,
        model: process.env.ZAI_TEXT_MODEL,
        label: `z.ai ${process.env.ZAI_TEXT_MODEL}`,
      },
    ];
  }
  return [
    {
      baseUrl: INTERNATIONAL_BASE_URL,
      model: "glm-4.5-flash",
      label: "z.ai glm-4.5-flash",
    },
    {
      baseUrl: CN_BASE_URL,
      model: "glm-4-flash",
      label: "bigmodel glm-4-flash",
    },
  ];
}

/** One quick in-hop retry on these before advancing the cascade. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, 429, 500, 502, 503, 504,
]);
const RETRY_DELAY_MS = 600;

export class ZaiChatError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ZaiChatError";
  }
}

/**
 * The key under any of its common env spellings — kept in sync
 * with zai-vision.ts so one Vercel variable lights up both
 * clients.
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

export function zaiChatConfigured(): boolean {
  return Boolean(zaiApiKey());
}

export interface CallZaiChatOptions {
  /** Fully-formed system prompt — the JSON contract lives in the route. */
  system: string;
  /** The user turn (brief + catalog + history). */
  user: string;
  /** 0-2; routine briefs want a little variety without hallucination. */
  temperature?: number;
  /** Completion budget — the route sizes it to the plan JSON. */
  maxTokens?: number;
  /** Abort/timeout signal for the upstream fetch. */
  signal?: AbortSignal;
}

export interface ZaiChatReply {
  /** Raw assistant text (the route parses it leniently). */
  content: string;
  /** The model that actually answered (reported to the client). */
  model: string;
}

/**
 * Generate text via the z.ai free chat chain. Tries each
 * (platform, model) hop once (with a single quick retry on
 * rate-limit/5xx); any hop that answers with non-empty content
 * wins, the cascade only advances when every hop fails.
 */
export async function callZaiChat(
  opts: CallZaiChatOptions
): Promise<ZaiChatReply> {
  const apiKey = zaiApiKey();
  if (!apiKey) {
    throw new ZaiChatError(503, "ZAI_API_KEY is not configured");
  }

  let lastError: unknown = new ZaiChatError(503, "no z.ai model answered");

  for (const hop of defaultHops()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
      try {
        // No response_format: not guaranteed across GLM text
        // revisions — the prompt demands JSON and the route parser
        // is fence/think-tolerant instead (same discipline as the
        // food route).
        const res = await fetch(`${hop.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: hop.model,
            messages: [
              { role: "system", content: opts.system },
              { role: "user", content: opts.user },
            ],
            temperature: opts.temperature ?? 0.6,
            max_tokens: opts.maxTokens ?? 2048,
          }),
          signal: opts.signal,
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          const err = new ZaiChatError(
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
          lastError = new ZaiChatError(503, `${hop.label}: empty chat answer`);
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

  throw lastError instanceof ZaiChatError
    ? lastError
    : new ZaiChatError(502, "z.ai chat failed");
}
