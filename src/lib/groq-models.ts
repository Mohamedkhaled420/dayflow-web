// ============================================================
// Dayflow AI — Groq model registry (Amendment #16)
// ------------------------------------------------------------
// The ONLY place model IDs live. Catalog verified 2026-09-11 by a
// human-run probe: all four routed IDs below are chat/reasoning
// models on the account's free tier (30 RPM / 1,000 RPD /
// 8,000 TPM / 200,000 TPD) and ALL of them accept the graded
// reasoning_effort scale ('none' | 'low' | 'medium' | 'high').
//
// The account also exposes non-chat models (STT, TTS, safety
// classifiers, and a low-quota legacy tier). Those are NEVER valid
// routing targets. The full forbidden-ID list is documented in the
// Phase 3 PR body — intentionally NOT in source, so a catalog grep
// of src/ can only ever find the four routed IDs.
// ============================================================

export const GROQ_MODELS = {
  gptOss120b: "openai/gpt-oss-120b",
  gptOss20b: "openai/gpt-oss-20b",
  qwen38: "qwen/qwen3.8-27b",
  qwen36: "qwen/qwen3.6-27b",
} as const;
