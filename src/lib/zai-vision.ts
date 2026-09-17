// ============================================================
// Dayflow AI — z.ai vision client (Phase 9 Nutrition)
// ------------------------------------------------------------
// Raw-fetch client for Z.ai's OpenAI-compatible endpoint, used as
// the PRIMARY food-photo hop by /api/ai/food. GLM-4V-Flash is the
// free-tier vision model on the platform, which is why it routes
// first — Groq's llama-4-scout backs it up, then the text cascade,
// then the offline estimator.
//
// Zero SDK (house rule, PRD §10.2): raw fetch, no dependencies,
// model IDs live in constants next to the caller. Auth is a single
// Bearer key:
//
//   ZAI_API_KEY   — free key from https://z.ai (API keys page)
//   ZAI_BASE_URL  — optional override (default public v4 endpoint)
//   ZAI_VISION_MODEL — optional override (default glm-4v-flash)
//
// When ZAI_API_KEY is absent this client throws a retry-class
// ZaiVisionError(503) and the cascade advances — the app works
// with no key at all and upgrades to free vision the moment one
// is configured.
//
// Error contract mirrors groq.ts: status-carrying error, upstream
// bodies logged server-side only, never returned to the client.
// ============================================================

const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_VISION_MODEL = "glm-4v-flash";

export class ZaiVisionError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ZaiVisionError";
  }
}

export function zaiVisionConfigured(): boolean {
  return Boolean(process.env.ZAI_API_KEY);
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

/**
 * Estimate food from a photo via GLM-4V-Flash. Returns the raw
 * assistant text (the route parses it — GLM tends to wrap JSON in
 * markdown fences even when asked not to, so parsing is lenient
 * and lives beside the JSON contract).
 */
export async function callZaiVision(opts: CallZaiVisionOptions): Promise<string> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new ZaiVisionError(503, "ZAI_API_KEY is not configured");
  }

  const baseUrl = process.env.ZAI_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.ZAI_VISION_MODEL ?? DEFAULT_VISION_MODEL;

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
      max_tokens: 800,
      // No response_format: not guaranteed across GLM vision
      // revisions — the prompt demands JSON and the parser is
      // fence-tolerant instead.
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new ZaiVisionError(res.status, await res.text().catch(() => ""));
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) {
    throw new ZaiVisionError(503, "empty vision answer");
  }
  return content;
}
