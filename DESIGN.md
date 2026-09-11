# Dayflow AI — Design Contract (DESIGN.md)

Phase 0 (Codify) deliverable. This document is binding for every agent session alongside the PRD (v6.2). Where the PRD speaks, the PRD wins; this file records how the PRD maps onto the codebase as it exists today, plus the extraction decisions that keep the shipped app pixel-stable during the transformation.

---

## 1. Token Inventory

All visual decisions are semantic tokens (PRD §5.2). Raw hex/rgb values live in exactly two source files, both under `src/styles/`:

| Source | Role |
|---|---|
| `src/styles/theme.css` | The only stylesheet allowed to contain literal color/radius/shadow values. PRD §9.1 `@theme` block (verbatim) + shadcn utility mapping + the full legacy `--df-*` token set (light `:root` / dark `.dark`). |
| `src/styles/palette.ts` | Category & brand **data** colors — user-editable values persisted in the store and rendered into SVG fills (see *Exemptions* below). |

### 1.1 PRD §9.1 product tokens (verbatim — new components must use these)

| Token | Semantic role |
|---|---|
| `--color-surface` | Base app surface (dark-first scheme) |
| `--color-surface-subtle` | Recessed surface (wells, tracks, inputs) |
| `--color-surface-glass` | Translucent floating surface (T0 material base) |
| `--color-surface-elevated` | Raised surface (thumbs, popovers, menus) |
| `--color-ink` | Primary text on dark surfaces |
| `--color-ink-muted` | Secondary text |
| `--color-ink-faint` | Tertiary/disabled text, grab handles |
| `--color-accent-focus` | Career Work semantic accent |
| `--color-accent-craft` | Personal Craft semantic accent |
| `--color-accent-fitness` | Movement semantic accent |
| `--color-accent-recovery` | Sleep & Dip semantic accent |
| `--color-accent-hydration` | Water semantic accent |
| `--hairline` | 1px glass edge (light-catching top line) |
| `--hairline-accent` | Accent-tinted hairline (active glass edge) |
| `--radius-panel` / `--radius-sheet` / `--radius-pill` | Signature radii (24 / 32 / 9999px) |
| `--ease-spring-critical` | Critically-damped spring easing (CSS approximation) |
| `--duration-press` | Press feedback duration (120ms — see §4) |

### 1.2 Legacy Dayflow tokens (`--df-*`, extraction-preserved)

The six shipped views still render the original Dayflow look. Their values were ported 1:1 from `globals.css` into `theme.css` — same names, same values, both themes. Groups: window background/border (`--df-window-*`), panel fills/borders/shadows (`--df-panel-*`), sidebar selection (`--df-sidebar-*`), text ramp (`--df-text-primary/secondary/tertiary/muted`), accent (`--df-accent`, `--df-accent-text`), controls (`--df-control-*`), segments (`--df-segment-*`), cards (`--df-card-*`), hour grid (`--df-hour-*`), right panel, summary cards, donut, buttons, chips, inputs, daily grid, chat surfaces, mobile nav, floating materials (`--df-material-*`, `--df-dock-*`).

Phase 0 additions (values extracted verbatim from view code, now tokenized): `--df-white` (ink on accent fills), `--df-scrim` (dialog overlay), `--df-water-ink` (deep hydration accent), `--df-destructive` / `--df-destructive-text` / `--df-destructive-soft` (danger ramp), `--df-streak` / `--df-streak-fill` (habit-flame accents), radii (`--df-radius-panel/card/card-lg/control/btn/focus`), shadows (`--df-primary-btn-glow`, `--df-lift-shadow`, `--df-dock-shadow`), `--df-generating-bg` (shimmer gradient), and the brand mark set (`--df-logo-gradient/shadow/border/dot`).

### 1.3 Exemptions (guard-scoped, deliberate)

| Exemption | Reason |
|---|---|
| `src/styles/palette.ts` | Category colors are **data**, not chrome — persisted in the store, user-editable via the Settings swatch picker, and rendered into SVG fill attributes (which cannot consume `var()`). One source of truth, imported by `seed.ts`, `compute.ts`, and the views. |
| `src/app/auth/**` | v0's auth pages are deferred to Phase 1 by explicit brief constraint (no restyle, zero diffs). They hold a mint/dark scheme (`#151a22`, `#a6f0d0`, `#0e1117`, `#ff9b9b`, `#c3f8e1`) that has no token equivalents yet. The drift guard exempts these files; Phase 1 must tokenize or redesign them. |
| `src/app/icon.svg`, `public/logo.svg` | Brand SVG assets. Standalone SVG files cannot reference page CSS variables (the favicon renders outside the document). Gradient stops stay literal. |

### 1.4 Dual system & convergence plan

The app currently ships a warm light-first Dayflow theme (`--df-*`, light default) while the PRD's §9.1 tokens are dark-first. Phase 0 is extraction-only: both systems coexist, zero visual drift. Convergence (later phase, human-approved): map legacy views onto §9.1 tokens (work→`accent-focus`, personal→`accent-craft`, fitness→`accent-fitness`, sleep→`accent-recovery`, water→`accent-hydration`) and add a light variant of the §9.1 ramp. "Meals" has no §9.1 accent yet — pending a PRD amendment.

### 1.5 Drift guards (CI-enforced)

- **ESLint rule `dayflow/no-raw-colors`** (inline plugin in `eslint.config.mjs`): errors on any hex / `rgb()` / `hsl()` literal in `src/**/*.{ts,tsx}` string or template literals, except the files in §1.3.
- **`scripts/check-raw-colors.mjs`**: scans every `.css` under `src/` except `theme.css` for raw color literals.
- Both are chained into `pnpm build` (`check-raw-colors && eslint . && next build`), so Vercel builds fail on drift.

---

## 2. Signature Primitive Spec — the glass panel

**One layout primitive = the brand** (PRD §5.4): a glass panel with a top hairline and a scroll-edge fade. Every surface (timeline blocks, stat tiles, recaps, team cards, journal entries) is this primitive with token-driven variants. No second card style.

### 2.1 Recipe

1. **Fill** — translucent surface: `--color-surface-glass` (PRD scheme) or `--df-panel-fill` (legacy views).
2. **Top hairline** — light catching the material's edge: `inset 0 1px 0 var(--hairline)` (use `--hairline-accent` for the active/selected state). Legacy panels approximate it with `--df-panel-inner-glow`.
3. **Scroll-edge fade** — content dissolves beneath floating chrome instead of hitting a divider: the `.df-edge-fade` mask (16px top / 20px bottom, `mask-image` gradient). Apply to any scroll container that slides under a floating surface.
4. **Frost** (T0, baseline): `backdrop-filter: blur(18px) saturate(1.7)` + hairline. Optional per §6.1.
5. **GPU layer** — every `backdrop-filter` element is promoted: `transform: translateZ(0); will-change: transform` (prevents the WebKit black-box crash; PRD §9.2).

### 2.2 Material tiers (PRD §6.1, performance-gated)

| Tier | Recipe | Where |
|---|---|---|
| **T0 Frosted** | `blur(18px) saturate(1.7)` + hairline | Panels, cards, dialogs (`GlassPanel frosted`) |
| **T1 Liquid** | T0 + `feDisplacementMap` refraction + specular rim — **max 4 live instances**, never inside scroll containers | Tab dock, sheet grabber, primary Log CTA, segmented thumb (Phase 2+) |
| **T2 Solid** | Opaque `--color-surface` | `prefers-reduced-transparency`, low-power fallback |

Legacy classes: `.df-material` (T0, blur 24px — legacy value preserved), `.df-dock` (dock material, blur capped at `backdrop-blur-xl` per §9.2), both with `@supports` / reduced-transparency / increased-contrast fallbacks already wired in `globals.css`.

### 2.3 Reference component

`src/components/ui/GlassPanel.tsx` — typed props (`surface`, `radius`, `hairline`, `edgeFade`, `frosted`), tokens only, zero feature logic. New screens compose this; legacy views keep their `.df-*` classes until their convergence phase.

---

## 3. Component State Matrix (Definition of Done — PRD §5.5)

Every component ships with all ten states. A PR that cannot demonstrate them does not merge.

| # | State | Requirement | Where it lives |
|---|---|---|---|
| 1 | `default` | Token-driven rest state; no raw values | component base styles |
| 2 | `pressed` | Feedback at pointer-down, ≤120ms, subtle scale (0.97) | `.df-press` / `--duration-press` |
| 3 | `loading` | No spinner walls — register intent instantly, keep current UI, transition when ready (Suspense/useTransition); secondary affordance after ~2s | per-feature (Phase 2+) |
| 4 | `empty` | Personality, never a bare void — explain the state and offer the next action | per-feature |
| 5 | `error` | Destructive ramp (`--df-destructive` mixes, `--df-destructive-text`); message + recovery path | token ramp |
| 6 | `disabled` | Opacity + `--df-text-muted`/`--color-ink-faint`; no hover/press feedback; cursor not-allowed | component styles |
| 7 | `dark` | `.dark` token swaps (legacy `--df-*` today; §9.1 ramp after convergence) | `theme.css` |
| 8 | `reduced-motion` | All animation off (`@media (prefers-reduced-motion: reduce)` kills `.df-rise`, `.df-press`, `.df-lift`, shimmer) | `globals.css` |
| 9 | `reduced-transparency` | Backdrop-filter off, opaque `--background` surface (T2) | `globals.css` |
| 10 | `focus-visible` | 2px accent outline, 2px offset, keyboard-only (never on pointer taps) | `globals.css` |

Icons: single Lucide family, consistent stroke (1.8 default). Empty states get personality (copy + illustration direction per feature).

---

## 4. Motion Spec

- **Library:** `motion/react` is the mandated library for all NEW animated components (PRD §5.6). Phase 0 skeletons are motion-library-free — CSS `transform`/`opacity` transitions on `--ease-spring-critical` / `--duration-press` — so Phase 0 adds no dependency and no second library. The existing `framer-motion` imports in legacy views are untouched (extraction-only) and migrate to `motion/react` as each view converges. **Never add a new `framer-motion` import.**
- **Springs:** critically damped, ~0.3s response (`bounce: 0`) — `springSoft` in `src/lib/motion.ts`; momentum (bounce 0.2) only for flick-driven motion. CSS approximation: `cubic-bezier(0.32, 0.72, 0, 1)`.
- **Compositor-only:** animate `transform` + `opacity` exclusively. Never animate layout properties (width/top/margin). `will-change` only while animating — **except** backdrop-filter elements, which carry `will-change: transform` permanently as a WebKit crash guard (PRD §9.2 hard constraint; see §2.1.5).
- **Press feedback:** on pointer-down, not release; 100ms target per PRD §5.6 — implemented as the `--duration-press` token (120ms per the §9.1 verbatim block). The token is the implementation source of truth; the 20ms delta is a documented PRD-internal discrepancy pending amendment. Snappiness over spectacle.
- **Segmented controls:** sliding spring thumbs (`Segmented.tsx` — thumb translates on `--ease-spring-critical`); Phase 1 swaps to `motion` `layoutId` shared-element thumbs.
- **Tab dock indicator:** `layoutId="dock-pill"` spring pill (Phase 1, `motion/react`); CSS-transform placeholder today.
- **Reduced motion:** every animation has a `prefers-reduced-motion` fallback (see §3, row 8).

---

## 5. Brand System (Phase 6.5)

The brand mark is a ribbon "day cycle": a near-complete ring with a single
gap at ~1:15 holding the sun dot, and an inner hook spiraling off the ring's
inner edge toward 9 o'clock. It was rebuilt **parametrically** from the
reference render (never auto-traced) in `public/logo.svg` — the single source
of truth for every icon surface — and verified with a Chromium pixel-diff
(≤2% budget, measured **1.78%** at 512px; report in
`docs/screenshots/phase6-5/`).

**Anatomy** (viewBox 512, center 256,256):

- Ring: centerline R=167, stroke 29, round caps; the two path ends sit at
  20.7° and 47.3° (clock angles from 12 o'clock), leaving the gap that holds
  the dot. Drawn as six gradient sub-arcs so the along-path color story maps
  correctly (a single linear gradient cannot wrap >180°).
- Sun dot: r=15.5 at 37° on the ring path — the "sun in the day's opening."
- Inner hook: **a single circular arc** (center ≈ (52, 234.3), r ≈ 101.3)
  from under the ring band at ~247° to the terminus cap at 269.5°; recovery
  orange, blending into the ring via a small junction flare.
- Specular hairline: 3px ink-white bloom along the top arc's outer edge
  (285°→20°), peaking near 11 o'clock.

**Color** (tokens only in components):

- Principal gradient stops are the §9.1 accents: `--color-accent-hydration`
  (sky-blue plateau through 12h) → `--color-accent-recovery` (orange through
  7–9h) on the top arc; `--color-accent-focus` at the bottom arc's gap end.
- Transition shading reproduces the reference render via `color-mix()`
  derivations of those tokens (see `src/components/brand/logoGeometry.ts`);
  the one value that exceeds any two-token mix's chroma — the tubular
  shading dip `#1a79eb` — lives as `--df-brand-deep` in theme.css.
- Dot = `--color-accent-recovery`.
- Monochrome variant: pure `--color-ink` on `--color-surface` where the
  gradient is not appropriate (e.g. inline text-adjacent contexts).

**Clear space & minimum size:** clear space = 1× dot diameter (31px at
viewBox 512, i.e. 6% of the mark's width) on all sides; minimum render size
16px (below that the gap and dot merge — prefer the monochrome dot-only
fallback).

**Motion:**

- **LogoFormation** — the ONE documented §5.6 exception to the
  compositor-only rule: a scroll-bound path draw (public landing only, one
  path set, zero idle cost; springs stiffness 120 / damping 30).
  `prefers-reduced-motion` renders the mark fully formed with no binding.
- **LogoLoop** — the indeterminate loader (sm 24 / md 48 / lg 112):
  a 69% ring arc rotating 360° per 1.4s (transform) + the sun dot blinking
  (opacity) as the arc passes the gap. Compositor-only. Reduced motion
  freezes it at 25% rotation with a steady dot; reduced transparency pins
  the dot opaque. Never mounted inside the dock, inside scroll lists, or as
  a fullscreen wall (§5.6 / PRD §7).

---

## 6. The 16-Pattern Ban List

Banned from any screen. Audit target: **≤1 trigger per PR** (PRD §5.1).

**The nine verbatim patterns (PRD §5.1, v6.1 + v6.2 identical):**

1. Inter-as-identity
2. Serif-italic accent words
3. "VibeCode Purple"
4. Gradients/glows as decoration
5. Identical icon-on-top feature cards
6. Numbered step banners
7. Emoji nav icons
8. All-caps section labels
9. Colored card edge borders

**Seven completions** — the PRD section is titled "16-Pattern Ban List" but enumerates only nine (stable across v6.1 and v6.2; the PRD is marked initial). The following seven are engineering completions in the same anti-slop spirit, **pending human amendment** to become contractual:

10. Text drop-shadows / glowing headlines
11. Animated or auto-cycling gradient backgrounds
12. Stacked glass (backdrop-filter nested inside backdrop-filter — muddy translucency and a perf cliff)
13. Radius inflation (bubble radii on inline elements; `--radius-*` tokens exist precisely so this can't drift)
14. Landing-page-itis inside the app (full-viewport centered hero + floating CTA where a working surface belongs)
15. Monotony grids (uniform equal-height card rows with no hierarchy — density must follow data importance)
16. Skeleton-screen flashing on every navigation (keep current UI until ready per §3 row 3; skeletons are for genuine cold starts only)

*(Audit note: legacy views contain a small number of pre-existing uppercase micro-labels — "HYDRATION", day headers — inherited from the native app port. They predate this contract, are tracked as triggers in the audit, and are fair game for the convergence phase.)*
