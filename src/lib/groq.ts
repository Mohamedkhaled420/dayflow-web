// ============================================================
// Dayflow AI — Groq core client (PRD §10.2, raw fetch, zero SDK)
// ------------------------------------------------------------
// Raw fetch only: no SDK imports, no Vercel AI Gateway. Model IDs
// come exclusively from src/lib/groq-models.ts (Amendment #13).
//
// reasoning_effort contract (Amendment #16): every routed model
// accepts the GRADED scale 'none' | 'low' | 'medium' | 'high'.
// REASONING_CAPABLE remains a gate so a future model that drops
// graded reasoning can never silently receive the field.
// ============================================================

import { GROQ_MODELS } from "./groq-models";

export type GroqModel = (typeof GROQ_MODELS)[keyof typeof GROQ_MODELS];

/** Graded reasoning scale (Amendment #16 — replaces the Phase 2 'default' toggle). */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Base URL is env-overridable so the sandbox can point the full
 *  cascade + SSE pipeline at a local mock Groq (scripts/mock-groq.mjs)
 *  — production behavior is unchanged when GROQ_BASE_URL is unset. */
function groqUrl(): string {
  return process.env.GROQ_BASE_URL ?? GROQ_URL;
}

// All four routed IDs accept reasoning_effort (verified 2026-09-11).
const REASONING_CAPABLE: ReadonlySet<GroqModel> = new Set([
  GROQ_MODELS.gptOss120b,
  GROQ_MODELS.gptOss20b,
  GROQ_MODELS.qwen38,
  GROQ_MODELS.qwen36,
]);

export class GroqError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "GroqError";
  }
}

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallGroqOptions {
  messages: GroqMessage[];
  model: GroqModel;
  temperature?: number;
  json?: boolean;
  /** Graded effort — attached ONLY for capable models (all four are). */
  reasoningEffort?: ReasoningEffort;
  maxTokens?: number;
  /** Abort/timeout signal for the upstream fetch (v0 audit #5). */
  signal?: AbortSignal;
}

/**
 * Calculate max completion tokens based on reasoning effort.
 * FIX: Bump token budget for reasoning models to prevent truncation (v0 audit #1).
 */
function getMaxTokens(opts: CallGroqOptions): number {
  if (opts.maxTokens) return opts.maxTokens;
  // Reasoning models need more tokens for think blocks + response
  return opts.reasoningEffort && opts.reasoningEffort !== 'none' ? 2048 : 1536;
}

export async function callGroq(opts: CallGroqOptions): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    // 503 is a retry-class failure for the route cascade: the coach
    // route falls through to the next model and finally the
    // algorithmic floor, so a missing key degrades gracefully
    // instead of hard-failing every request.
    throw new GroqError(503, "GROQ_API_KEY is not configured");
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_completion_tokens: getMaxTokens(opts),
  };
  if (opts.json) body.response_format = { type: "json_object" };

  // Attach the graded reasoning_effort ONLY for capable models
  // (Amendment #16: all four routed IDs are graded-reasoning
  // capable; the gate exists so a future incapable model can
  // never receive the field).
  if (opts.reasoningEffort && REASONING_CAPABLE.has(opts.model)) {
    body.reasoning_effort = opts.reasoningEffort;
  }

  const res = await fetch(groqUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new GroqError(res.status, await res.text().catch(() => ""));
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  
  // FIX: Strip think blocks from non-streaming responses (v0 audit #1)
  const stripped = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "") // unclosed (truncated)
    .trim();

  if (!stripped) {
    throw new GroqError(503, "empty answer after reasoning strip");
  }
  return stripped;
}

// ---------------------------------------------------------------
// Streaming (v0 audit #1: the coach felt frozen while Groq
// generated). Raw SSE pass-through — the route layer owns the
// client-facing event protocol; this function only guarantees
// "the upstream accepted the request" so the cascade can commit.
// ---------------------------------------------------------------

export interface CallGroqStreamResult {
  model: GroqModel;
  response: Response;
}

export async function callGroqStream(
  opts: CallGroqOptions
): Promise<CallGroqStreamResult> {
  if (!process.env.GROQ_API_KEY) {
    // Same retry-class semantics as callGroq: missing key → the
    // cascade advances and finally lands on the algorithmic floor.
    throw new GroqError(503, "GROQ_API_KEY is not configured");
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_completion_tokens: getMaxTokens(opts),
    stream: true,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.reasoningEffort && REASONING_CAPABLE.has(opts.model)) {
    body.reasoning_effort = opts.reasoningEffort;
  }

  const res = await fetch(groqUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw new GroqError(res.status, await res.text().catch(() => ""));
  }
  return { model: opts.model, response: res };
}

/**
 * Parse an SSE body into text deltas. Yields only content chunks;
 * network/parse errors surface as exceptions to the caller.
 *
 * FIX (stateful carry): upstream tokenizers split text ANYWHERE, so
 * both think tags can arrive cut in half ("ILDuc" + "i>", or
 * "ilda..." split across deltas). Without the carry buffer below,
 * a split closing tag is never matched, the stream stays inside the
 * think block forever, and the WHOLE reply is silently eaten (found
 * by pointing the cascade at a hostile local mock that splits the
 * closing tag across two deltas); a split opening tag leaks raw
 * reasoning into the visible chat instead.
 */
export async function* sseDeltas(
  response: Response
): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const OPEN = "<" + "think" + ">";
  const CLOSE = "</" + "think" + ">";
  let inThinkBlock = false;
  let carry = "";

  /** Strip think tags from one upstream delta; returns the visible
   *  text ("" when the delta was pure reasoning). */
  const stripDelta = (delta: string): string => {
    let buf = carry + delta;
    carry = "";
    let text = "";
    for (;;) {
      if (buf === "") return text;
      if (inThinkBlock) {
        const closeIdx = buf.indexOf(CLOSE);
        if (closeIdx !== -1) {
          inThinkBlock = false;
          buf = buf.slice(closeIdx + CLOSE.length);
          continue;
        }
        // No full closing tag — park a possible partial-tag tail.
        const keep = Math.min(CLOSE.length - 1, buf.length);
        carry = keep > 0 ? buf.slice(buf.length - keep) : "";
        return text;
      }
      const openIdx = buf.indexOf(OPEN);
      if (openIdx !== -1) {
        text += buf.slice(0, openIdx);
        inThinkBlock = true;
        buf = buf.slice(openIdx + OPEN.length);
        continue;
      }
      // No opening tag — but the tail might be a partial opening
      // tag; hold the longest such suffix for the next delta.
      let keep = 0;
      for (let k = Math.min(OPEN.length - 1, buf.length); k > 0; k--) {
        if (OPEN.startsWith(buf.slice(buf.length - k))) {
          keep = k;
          break;
        }
      }
      text += buf.slice(0, buf.length - keep);
      carry = keep > 0 ? buf.slice(buf.length - keep) : "";
      return text;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              const clean = stripDelta(delta);
              if (clean) yield clean;
            }
          } catch {
            // Malformed keep-alive/comment fragments — skip rather
            // than kill a healthy stream.
          }
        }
      }
    }
    // Stream ended: the carry was real content after all (it never
    // completed into a tag) — flush it. Inside an UNCLOSED think
    // block it is truncated reasoning: drop it, matching callGroq.
    if (carry && !inThinkBlock) yield carry;
    carry = "";
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------
// Vision (Phase 9 Nutrition): multimodal food-photo analysis via
// Groq's vision tier (GROQ_MODELS.llama4Scout). Routed ONLY by
// /api/ai/food — the vision tier is NOT part of the coach cascade
// and never receives reasoning_effort. Same error contract as
// callGroq: GroqError with retry-class status; think-strip; the
// route falls through to z.ai / the offline estimator on failure.
// ---------------------------------------------------------------

export interface CallGroqVisionOptions {
  /** Vision-tier model ID (GROQ_MODELS.llama4Scout). */
  model: GroqModel;
  /** Instruction prompt — the JSON contract lives in the route. */
  prompt: string;
  /** Base64 image payload (no data: prefix). */
  imageBase64: string;
  mimeType?: string;
  temperature?: number;
  /** Abort/timeout signal for the upstream fetch. */
  signal?: AbortSignal;
}

export async function callGroqVision(opts: CallGroqVisionOptions): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    throw new GroqError(503, "GROQ_API_KEY is not configured");
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model,
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
      max_completion_tokens: 800,
      // Estimation wants a parseable object; a model that rejects
      // response_format fails as retry-class and the caller falls
      // through to the next hop.
      response_format: { type: "json_object" },
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new GroqError(res.status, await res.text().catch(() => ""));
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  const stripped = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "") // unclosed (truncated)
    .trim();

  if (!stripped) {
    throw new GroqError(503, "empty answer after reasoning strip");
  }
  return stripped;
}
