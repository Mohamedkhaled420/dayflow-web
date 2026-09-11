// ============================================================
// Dayflow AI — Groq model registry (PRD §10.1 / Amendment #13)
// ------------------------------------------------------------
// The ONLY place model IDs live. Verified at Phase 2 kickoff via:
//   GET https://api.groq.com/openai/v1/models
// (probe pending a live GROQ_API_KEY — see PR body). If the catalog
// returns the legacy un-namespaced ID, flip it here and nowhere else.
// ============================================================

export const GROQ_MODELS = {
  qwen32b: "qwen/qwen3-32b",
  llama70b: "llama-3.3-70b-versatile",
  llama8b: "llama-3.1-8b-instant",
} as const;
