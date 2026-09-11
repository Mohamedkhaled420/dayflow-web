# Phase 8 Remediation Record — Notion Rebrand + S1–S5

**Branch:** `feat/phase8-notion-rebrand` · **PR:** #10 · **Date:** 2026-09-12

This document maps every Phase 7 QA finding and every scope item (S1–S5)
to its disposition in this PR, plus the S3 legacy-convergence evidence.

---

## 1. QA findings (docs/QA_MATRIX.md + docs/ACCESSIBILITY_AUDIT.md)

| ID | Finding | Disposition in this PR |
|---|---|---|
| F-2 (Sev-2) | Inner scroll container never engages; body scrolls; mobile header unsticks | **Fixed.** `.df-app` = `100dvh` flex column + `overflow-x: clip` (clip ≠ scroll container, sticky survives); `min-h-0` through the whole chain (AppShell → panel → view). Every view's `h-full overflow-y-auto` now engages. Landing keeps `.df-window` + body scroll (220vh runway). |
| F-3 (Sev-2) | No sign-out anywhere | **Fixed.** Settings → Data → Account → "Sign out": wipes IndexedDB BEFORE ending the session (shared-device hygiene), `auth.signOut()`, redirect `/auth`. |
| F-4 (Sev-2) | Sign-up shows misleading "profile setup could not be completed"; "Check your email" branch unreachable | **Fixed.** Message order inverted: the no-session confirmation branch returns BEFORE the RLS-blocked profile bootstrap ever runs. |
| F-5 (Sev-3) | "Generate Workout" with floor answer shows network error — client `JSON.parse` before `safeParse` makes the validation branch dead code | **Fixed.** `JSON.parse` guarded in its own try/catch (HabitsView); `MorningTriadGate` localStorage read now Zod `safeParse`d instead of cast (F-5b). |
| F-6 (Sev-3) | Weekly heatmap cells non-interactive | **Accepted + made accessible.** Cells stay decorative (retroactive logging lives on the Timeline date picker, per STARTER_GUIDE); grid `aria-hidden`, sr-only summary line added carrying the same totals (per A-4 recommendation). |
| F-7 / A-1..A-3 (AA fails) | Light-theme muted 2.82:1, accent-text 1.89:1, CTA 2.01:1 | **Fixed by the rebrand palette** (DESIGN.md §7.1): muted `#757471` 4.67:1, accent-text `#1a6fc4` 4.76:1, CTA white-on-`#1a6fc4` 4.76:1. |
| A-4 | Heatmap not keyboard-accessible / not announced | **Fixed** (sr-only summary + aria-hidden grid, see F-6). |
| A-5 | "Ask Coach" lacks `aria-busy` / thinking live region | **Fixed.** Log container: `aria-live="polite"` + `aria-busy` while asking; Ask Coach button `aria-busy` + aria-label swap; shimmer block labeled "Coach is thinking". |
| A-6 / F-8 | Dock `aria-current="true"` → `"page"` | **Fixed** (DockItem, SidebarButton, header Settings button, ui/Dock.tsx; the `:has()` dock-shadow selector updated to match). |
| A-7 | Praise buttons name the preset, not the teammate | **Fixed.** `Send praise to {teammateName}: {message}`. |
| F-1 | Dock occludes sheet actions | **Retained hotfix** (z-60 overlays / z-100 toasts) — codified as Rule A below. |

## 2. Scope items

### S1 — surgical fixes
F-2, F-3, F-4, F-5 (+F-5b), F-6/A-4, A-5, A-6/F-8, A-7 — all above.

### S2 — dock avoidance (WS4)
`src/hooks/use-dock-visibility.ts`: reference-counted hide requests
(`requestDockHide(reason)` → release fn), reactive `useDockHidden()`,
component-level `useDockHideRequest(reason, active)`, global
`watchDockKeyboard()` (visualViewport >120px heuristic), mounted once in
AppShell. Rules: **A** overlays float (z-60/z-100) · **B** immersive hides
(keyboard, fullscreen journal editor — dock slides out transform+opacity,
`aria-hidden` + `inert`) · **C** content reserves a constant
`88px+safe-area` band → **CLS 0**. Reduced-motion: instant state change.

### S3 — legacy convergence conclusion
The six legacy views + dialogs consume `--df-*` tokens exclusively; Phase 8
remapped token VALUES in `theme.css` only, so the Notion rebrand landed
atomically with zero view-code color edits.

Grep evidence (run on this branch):

```
$ rg -c 'var\(--df-' src/components/dayflow/
  TimelineView.tsx   86      HabitsView.tsx     51      MorningTriadGate.tsx  13
  DailyView.tsx      29      ChatView.tsx       29      ShortcutsSetupCard.tsx 28
  WeeklyView.tsx     38      SettingsView.tsx   81      InstallAppCard.tsx    13
  EventDialog.tsx    30      AppShell.tsx       14

$ node scripts/check-raw-colors.mjs
  ✓ drift guard: no raw colors in CSS outside theme.css

$ pnpm lint   (dayflow/no-raw-colors: error)   → 0 problems
```

The only `rgba(` strings outside theme.css/palette.ts live in
`LiquidGlass.tsx` as build-time-generated SVG displacement-map data-URLs
(`scripts/gen-lg-maps.mjs`, "do not edit by hand", Phase 5, unchanged).

### S4 — nutrition (DEFERRED to PR #11, audit-first)
PRD §4.6 promises "Nutrition & Hydration … fast-entry <2 taps"; README
markets food tracking; migration `0002` has NO meals table and the Phase 5
store rewrite dropped the field silently. Per the agreed plan, PR #11 will
audit §4.6 and REPORT before any schema work; if meals enter scope they go
through the schema-owner migration path + Meals UI. No nutrition code in
this PR (the Daily "Meals 0/3" tile remains goal-display only, as at
Phase 5).

### S5 — privacy suite
- **Export:** already shipped and QA-verified (JSON backup + day Markdown);
  coverage matrix documented in `docs/PRIVACY.md` §2.
- **Delete account:** owner-side `delete_user_account()` SECURITY DEFINER
  RPC proposed in `docs/PRIVACY.md` §3 (draft SQL + open review items);
  client never touches service_role. In-app guidance stub in Settings →
  Data → Account (S5) until the migration lands.

## 3. Phase 8 design decisions implemented

1. **Journal rich text (decision 1):** full-featured composer
   (`JournalComposer.tsx`) — undo/redo, bold/italic/underline/strike,
   H1–H3, lists, quote, code, link, fullscreen (dock-hide Rule B), word
   count; output stored via `addJournalEntry`, rendered ONLY through
   `sanitizeJournalHtml()` (allowlist sanitizer, `src/lib/journal-html.ts`);
   legacy plain-text entries render through the same path (pre-escaped).
2. **CTA discipline (decision 2):** in-app solid `#1a6fc4` primary +
   neutral secondary; gradient (`--df-hero-gradient`) on the landing hero
   CTA only.
3. **Dia chat shell (decision 3, revised):** browser chrome as functional
   Journal/Coach shell — traffic lights = sync status, back/forward =
   journal history, refresh = re-run coach answer, omnibar = mode+privacy
   (tap to switch journal ↔ training), hero area = message flow, quick
   cards = preset chips, aurora = static. Chrome collapses below 400px
   (back/forward hidden). Landing reuses `<DiaChrome>` as a static REAL
   frame (dogfooding marketing).
4. **BackgroundPaths on /auth only** (token-colored light filaments,
   reduced-motion static; slice cover); authenticated app keeps zero
   infinite path/blur animations.

## 4. Verification performed on this branch

- `pnpm build` green: drift guard ✓, ESLint ✓, TypeScript strict ✓,
  Next 16 production build ✓ (10 routes).
- Production server smoke test at 375×812 and 1280×800:
  `/` 200, `/auth` 200, zero page errors; token cascade verified in
  computed styles (body `rgb(255,255,255)`/ink `rgb(55,53,47)`, panel
  border `rgb(233,233,231)`, traffic lights `rgb(31,136,61)` ×3).
- Screenshots: `docs/screenshots/phase8/` (landing mobile, landing shell
  frame, auth mobile + desktop).
- Not re-run here (needs live Supabase session): authenticated-view QA
  matrix — recommend re-running the Phase 6 matrix rows for Timeline /
  Daily / Weekly / Habits / Journal / Settings against this branch before
  merge, focusing on F-2 (scroll engagement) and the new Journal composer.
