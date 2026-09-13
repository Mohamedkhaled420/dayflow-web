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
    max_completion_tokens: opts.maxTokens ?? 1024,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  // Attach the graded reasoning_effort ONLY for capable models
  // (Amendment #16: all four routed IDs are graded-reasoning
  // capable; the gate exists so a future incapable model can
  // never receive the field).
  if (opts.reasoningEffort && REASONING_CAPABLE.has(opts.model)) {
    body.reasoning_effort = opts.reasoningEffort;
  }

  const res = await fetch(GROQ_URL, {
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
  return data.choices?.[0]?.message?.content ?? "";
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
    max_completion_tokens: opts.maxTokens ?? 1024,
    stream: true,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.reasoningEffort && REASONING_CAPABLE.has(opts.model)) {
    body.reasoning_effort = opts.reasoningEffort;
  }

  const res = await fetch(GROQ_URL, {
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
 */
export async function* sseDeltas(
  response: Response
): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
              // FIX: Strip <think>...</think> tags from streaming deltas
              const cleanDelta = delta.replace(/<think>[\s\S]*?<\/think>/g, '');
              if (cleanDelta) yield cleanDelta;
            }
          } catch {
            // Malformed keep-alive/comment fragments — skip rather
            // than kill a healthy stream.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
