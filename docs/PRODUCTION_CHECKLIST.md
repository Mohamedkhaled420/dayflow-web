# Dayflow AI — Production Readiness Checklist (Phase 6, T4)

**Verification environment:** production build (`next build && next start`) on Node 22, live Supabase project `fqxahjzdlowadjmjfsey.supabase.co` (ACTIVE_HEALTHY, us-east-1), real authenticated sessions, Management-API (PAT) inspection for RLS/server-side state. Every checkbox below cites its evidence.

---

## 1. Environment variables

- [x] `NEXT_PUBLIC_SUPABASE_URL` — **verified working** (client, middleware, coach route, passkeys all resolve the live project). Vercel: set in Phase 2; re-verify in dashboard → Settings → Environment Variables.
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **verified working** (auth sign-in/up, REST with RLS, realtime). Vercel: set.
- [ ] `GROQ_API_KEY` — **NOT set in Vercel (Production or Preview)** — tracked since Phase 4. The app ships gracefully (algorithmic floor answers all four modes, HTTP 200, no 500s; see `AI_TEST_LOG.md`), but live-model coaching/workouts/recaps are dark until the key is added. **This is the single blocking env action for full AI functionality.**
- [x] No `.env` files committed — `.gitignore` covers `.env*`; `git ls-files | grep -i env` returns nothing; `.env.local` / `.env.test` exist only in the QA sandbox (never staged).
- [x] No hardcoded secrets in source — full-tree grep for `sbp_`, `ghp_`, `gsk_`, `eyJ` (JWT prefixes), `service_role`: zero matches in `src/`, `supabase/`, workflows, and docs.

## 2. Error handling

- [x] All API routes return structured error JSON — coach: `{"error":"Unauthorized"}` (401), `{"error":"Invalid Session"}` (401), `{"error":"Invalid request","issues":…}` (400, Zod flatten), 502 without leaking Groq bodies; ingest: same envelope. Verified by direct calls.
- [x] Groq 429/503 triggers algorithmic fallback, not 500 — every mode answered HTTP 200 via the floor when all cascade hops failed (12/12 prompts). 429/503 are the only retry-class codes; others raise 502 with a sanitized message.
- [x] Supabase connection failures show user-friendly toast — write paths return success booleans; UI surfaces toasts ("That didn't look like a valid email — or the invite couldn't be sent.", "Coach unavailable (HTTP …)", "The coach couldn't be reached…"). Verified in-browser.
- [x] Invalid JWT returns 401, not a crash — coach + ingest both return `{"error":"Invalid Session"}` 401 for garbage bearers; middleware redirects unauthenticated page loads to `/auth` (verified: `GET /` → 307).

## 3. Edge cases

- [x] Empty state (new user, no habits/logs) — Timeline shows "Nothing tracked yet — Tap Log above to add sleep or a workout."; goals render zeroed rings with CTAs ("Add glass"); Habits grid renders only the inline add row; verified with a freshly onboarded account (screenshot `empty-state-new-user.png`).
- [x] Offline mode boots from the SW cache — network disabled at the browser level, reload still renders the app shell + Timeline from the service worker (app-shell precache from Phase 4). Writes queue as optimistic local state and sync when back online (delta sync pulls on boot; `last_sync_timestamp` updated).
- [x] Slow network / optimistic writes — hydration, habit completion, journal saves, and workout logs render immediately (local IndexedDB store) with Supabase confirming afterward (201/204 observed after the UI update); the profiles PATCH updating `last_sync_timestamp` observed on every write.
- [x] Concurrent edits / Delta Sync — boot sequence rehydrates the IndexedDB snapshot, then pulls server deltas (`bootDayflowSync`); every write path updates `last_sync_timestamp` (PATCH 204 verified on all writes). Last-writer-wins per row is the shipped model; no data loss observed in single-user and two-user team testing.

## 4. Performance

- [x] Initial JS **186.7 KB gzipped** (9 chunks referenced by the route HTML; gzip-measured from the build output) — under the 200 KB budget, down from Phase 4's 191.7 KB.
- [x] Lighthouse (mobile perf preset, `/auth`): **Performance 99**, TBT 0 ms (INP proxy well under 200 ms), FCP/LCP **1.6 s** (< 2.5 s), **CLS 0**, server response 10 ms. Authenticated app shell loads 14 JS chunks total including lazy views.
- [x] Lighthouse CI wired: `.github/workflows/lighthouse.yml` + `.lighthouserc.json` assert minScore 0.9 on performance / accessibility / best-practices (Phase 5 T5); the current 99/95 scores pass those gates.
- [x] No layout shifts on hydration — boot skeleton occupies the same frame as the rehydrated shell (CLS 0 measured).

## 5. Security (RLS verified with real cross-user JWTs + admin API)

| Check | Evidence | Status |
|---|---|---|
| Journal entries owner-only | user B (`qa-teammate`) `GET journal_entries` → **0 rows** while user A holds multiple entries; B's sentinel read of A's content impossible | ✅ |
| Hydration / habit / workout / sleep logs owner-only | B `GET` each table → **0 rows** (A has data in all four) | ✅ |
| Forged ownership blocked | B `POST hydration_logs` with `user_id = A` → **403 `42501` "new row violates row-level security policy"** | ✅ |
| Profiles self-scoped | B `GET profiles` → exactly 1 row (own); A's row invisible | ✅ |
| Team activities team-scoped | B (team member) sees the 3 team rows; policies in `0008_team_invites_jwt_policies.sql` / `0003` verify `team_id` membership | ✅ |
| Anonymous blocked | anon key (no JWT): reads → 0 rows; insert → **401 (42501)** | ✅ |
| `/api/ai/coach` requires JWT | no header → 401; garbage bearer → 401 (verified) | ✅ |
| `/api/shortcuts/ingest` requires JWT | no header → 401; garbage bearer → 401 (verified) | ✅ |
| Zod gate before Groq spend | invalid body → 400 with issues, no upstream call | ✅ |

**Admin-API provisioning verified** (PAT): test users created/confirmed via `POST/PUT /auth/v1/admin/users`; project list and key inventory pulled via Management API. Secrets handled via 600-permission temp files, never echoed or committed.

## 6. Remaining pre-ship actions (owner)

1. **Set `GROQ_API_KEY` in Vercel** (Production + Preview) — unlocks live-model journal/coaching/workout/recap; re-run `AI_TEST_LOG.md` prompts afterward (harness: `scripts/ai_test.mjs`, QA-side).
2. **Enable the WebAuthn factor in Supabase Auth** (RP ID = `dayflow-web.vercel.app`) so "Continue with Face ID" completes instead of falling back (the fallback chain itself is verified and safe).
3. **Palette decision for light-theme AA contrast** (A-1…A-3 in `ACCESSIBILITY_AUDIT.md`) — dark theme already conforms.
4. Optional follow-ups: add sign-out (F-3), fix the sign-up error-message order (F-4), weekly heatmap interactivity + labels (A-4), `aria-busy` on Ask Coach (A-5), `aria-current="page"` (A-6).
5. **Rotate credentials exposed during development** (GitHub PAT, Supabase PAT) per the rotation ledger.

## 7. Self-check summary

- [x] tsc `--noEmit` clean; `pnpm build` passes (includes ESLint + raw-color drift guard).
- [x] Every checklist item above carries concrete evidence (status codes, row counts, scores, screenshots).
- [x] Environment / error-handling / edge-case / performance / security sections: all green except the two explicitly-opened owner actions (Groq key, WebAuthn factor) and the light-theme palette decision — each documented with the exact step to close it.
