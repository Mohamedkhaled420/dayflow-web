# Dayflow AI — AI Feature Test Log (Phase 6, T2)

**Endpoint under test:** `POST /api/ai/coach` (JWT-gated, Zod-validated request body, Groq cascade per Amendment #16, algorithmic floor as last resort).
**Runner:** `/home/z/my-project/scripts/ai_test.mjs` (repository-external QA harness; prompts sent verbatim from the Phase 6 brief).
**Authenticated as:** `mk510@atomicmail.io` (fresh 1-hour JWT per run).
**Environment note — read first:** `GROQ_API_KEY` is **not configured** in this QA environment (nor in Vercel — tracked since Phase 4). Every routed model therefore raises `GroqError(503, "GROQ_API_KEY is not configured")`, which is retry-class by design, so the cascade walks all hops and the **algorithmic floor answers every request with HTTP 200**. This is exactly the degradation path the PRD mandates, and it is what the log below documents. Re-run the same 12 prompts with the key set to capture live-model responses; the cascade table (model IDs, reasoning efforts, JSON mode) is included so the expected live path is unambiguous.

**Model routing (Amendment #16, from `src/lib/groq-models.ts` + `route.ts`):**

| Mode | Hop 1 | Hop 2 | Hop 3 |
|---|---|---|---|
| journal | `openai/gpt-oss-120b` @ effort high | `qwen/qwen3.8-27b` @ effort high | `qwen/qwen3.6-27b` @ effort medium |
| workout | `qwen/qwen3.8-27b` (JSON mode) | `openai/gpt-oss-120b` | `qwen/qwen3.6-27b` |
| coaching | `qwen/qwen3.6-27b` | `openai/gpt-oss-20b` | — |
| recap | `openai/gpt-oss-120b` | `qwen/qwen3.8-27b` | `qwen/qwen3.6-27b` |

> Note: the brief's model references (qwen3-32b, llama-3.3-70b) predate Amendment #16; the table above is the live registry and is authoritative.

---

## 1. Journal mode (`mode: "journal"`)

### Prompt 1
> "I'm feeling overwhelmed with work and can't focus. What should I do?"

- Expected: CBT-style reframing, no medical advice, under 200 words.
- HTTP: **200** (latency 297 ms)
- Actual response (algorithmic floor):
  > "Every day is a fresh start. What's one small win you can lock in today?"
- Verdict: graceful degradation ✅ · CBT reframing: N/A until Groq key set ⏳

### Prompt 2
> "I keep procrastinating on my side project. Why?"

- Expected: archetype-aware coaching.
- HTTP: **200** (240 ms)
- Actual response (floor): "Every day is a fresh start. What's one small win you can lock in today?"
- Verdict: graceful degradation ✅ · archetype awareness: N/A ⏳

### Prompt 3
> "I failed my habit streak again. I'm a failure."

- Expected: non-punitive Adaptive Reset language.
- HTTP: **200** (239 ms)
- Actual response (floor): "Every day is a fresh start. What's one small win you can lock in today?"
- Verdict: graceful degradation ✅ — the floor text is itself non-punitive and growth-mindset framed.

## 2. Workout mode (`mode: "workout"`, JSON mode + client Zod validation)

The client (`HabitsView.tsx`) validates the response against `WorkoutPlanSchema` **before render** (PRD §4.5). The validation mirror used here:

```js
{ title: string, focus?: string, durationMinutes?: number,
  blocks: [{ name: string, sets?: string, durationMinutes?: number, intensity?: string, cue?: string }] }
```

### Prompt 1
> "I have 30 minutes, no equipment, and I'm a beginner."

- HTTP: **200** (235 ms) · Zod validation: **fail — not JSON** (floor text).
- Actual response: "Every day is a fresh start. What's one small win you can lock in today?"
- Client behavior (verified in-browser): graceful alert "The coach couldn't be reached. Try again in a moment." — no crash, no unvalidated render. ✅ (finding F-5 in QA_MATRIX: message wording is misleading; JSON.parse runs before safeParse making the "plan didn't validate" branch dead code).

### Prompt 2
> "I want to build upper body strength. I have dumbbells and a pull-up bar."

- HTTP: **200** (242 ms) · Zod validation: **fail — not JSON** (floor text). Same graceful client path.

### Prompt 3
> "I'm sore from yesterday. Give me active recovery."

- HTTP: **200** (637 ms) · Zod validation: **fail — not JSON** (floor text). Same graceful client path.

## 3. Coaching mode (`mode: "coaching"`)

### Prompt 1
> "What's one thing I should focus on today?"

- HTTP: **200** (233 ms) · Actual (floor): "Every day is a fresh start. What's one small win you can lock in today?"

### Prompt 2
> "I'm tired. Should I push through or rest?"

- HTTP: **200** (232 ms) · Actual (floor): "Every day is a fresh start. What's one small win you can lock in today?"

### Prompt 3
> "I don't feel like working out today."

- HTTP: **200** (228 ms) · Actual (floor): "Every day is a fresh start. What's one small win you can lock in today?"

## 4. Recap mode (`mode: "recap"`)

### Prompt 1
> "Give me a daily recap."

- HTTP: **200** (230 ms) · Actual (floor): "Every day is a fresh start. What's one small win you can lock in today?"

### Prompt 2
> "How did I do this week?"

- HTTP: **200** (247 ms) · Actual (floor): "Every day is a fresh start. What's one small win you can lock in today?"

### Prompt 3
> "What patterns do you see in my behavior?"

- HTTP: **200** (229 ms) · Actual (floor): "Every day is a fresh start. What's one small win you can lock in today?"

---

## 5. Floor branch coverage (ctx-aware)

The floor is context-aware; all three branches were exercised directly:

| ctx | Response |
|---|---|
| `{ streak: 9 }` | "You're on a massive roll. Keep the momentum going." |
| `{ hydrationPct: 40 }` | "You're below 50% hydration. Drink 500ml now to protect focus." |
| `{ streak: 2, hydrationPct: 80 }` | "Every day is a fresh start. What's one small win you can lock in today?" |

## 6. Security & validation rows

| Case | HTTP | Body |
|---|---|---|
| No `Authorization` header | **401** | `{"error":"Unauthorized"}` |
| Invalid Bearer JWT | **401** | `{"error":"Invalid Session"}` |
| Invalid mode (`"bogus-mode"`) — Zod gate before any Groq call | **400** | `{"error":"Invalid request","issues":{…}}` |
| `/api/shortcuts/ingest` without JWT | **401** | `{"error":"Unauthorized"}` |
| `/api/shortcuts/ingest` with garbage JWT | **401** | `{"error":"Invalid Session"}` |

## 7. Rate limits / retries

No Groq 429/503 responses were observed against the live API — with the key absent every hop fails 503-class locally, which exercises the same retry/fallthrough logic. Free-tier limits (30 RPM / 1,000 RPD / 8,000 TPM) and the 4K-token prompt cap (`capMessages`, last-3-entries discipline) are enforced in code; TPM discipline verified by inspection (messages capped before the cascade, identical prompt per hop).

## 8. Self-check summary

- [x] All 12 prompts sent verbatim; exact prompts, HTTP status, latency, and responses logged above.
- [x] Zod validation outcome recorded for all workout prompts (fail-as-designed without a live model; no unvalidated content ever rendered).
- [x] No Groq 429/503 leaked to clients; the algorithmic floor triggered correctly on every exhausted cascade (this is the "or" branch of the brief's self-check).
- [ ] Live-model response quality (CBT framing, archetype awareness, progressive-overload JSON): **blocked on `GROQ_API_KEY`** — pending Vercel env var, tracked since Phase 4. The harness in `scripts/ai_test.mjs` (QA-side) can be re-run unchanged once the key is present.
