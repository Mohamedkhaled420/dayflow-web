// ============================================================
// Dayflow AI — Groq core client (PRD §10.2, raw fetch, zero SDK)
// ------------------------------------------------------------
// Raw fetch only: no SDK imports, no Vercel AI Gateway. Model IDs
// come exclusively from src/lib/groq-models.ts (Amendment #13).
//
// reasoning_effort contract (PRD §10.1):
//   - qwen/qwen3-32b accepts 'none' | 'default' ONLY (no low/medium/high)
//   - Llama models do not expose reasoning_effort at all — it is
//     NEVER sent to them (REASONING_CAPABLE gate below).
// ============================================================

import { GROQ_MODELS } from "./groq-models";

export type GroqModel = (typeof GROQ_MODELS)[keyof typeof GROQ_MODELS];

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Only these models accept a reasoning_effort field on Groq's free tier.
const REASONING_CAPABLE: ReadonlySet<GroqModel> = new Set([GROQ_MODELS.qwen32b]);

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
  /** 'default' enables thinking mode — attached ONLY for capable models. */
  reasoningEffort?: "none" | "default";
  maxTokens?: number;
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

  // Attach reasoning_effort ONLY for capable models, and ONLY when
  // enabling it. Llama models must never receive this field.
  if (opts.reasoningEffort === "default" && REASONING_CAPABLE.has(opts.model)) {
    body.reasoning_effort = "default";
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new GroqError(res.status, await res.text().catch(() => ""));
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
