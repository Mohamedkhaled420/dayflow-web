# Phase 6.5 — Brand Mark Pixel-Diff Report

**Method** — `public/logo.svg` (parametric rebuild, never auto-traced) rendered by
headless Chromium at 512×512 on `--color-surface`, vs the reference render
(`Ribbon_logo_with_sun_dot_2K` downscaled to 512 with LANCZOS, matching the
reference's own production pipeline). Diff metric: per-pixel max channel delta.

## Result

| Threshold (max channel delta) | Differing pixels | Share |
|---|---|---|
| > 16 | 7,474 | 2.85% |
| > 24 | 5,560 | 2.12% |
| **> 32** | **4,669** | **1.78% — PASS (budget ≤ 2%)** |
| > 48 | 3,685 | 1.41% |

Evidence: `pixeldiff-reference-512.png`, `pixeldiff-render-512.png`,
`pixeldiff-heatmap.png`, `pixeldiff-side-by-side.png`.

## Geometry (measured from the reference, 512 scale)

- Ring centerline **R = 167**, stroke **29**, round caps; gap ends at
  20.7° / 47.3° (clock angles from 12h) → gap ~26.6° wide.
- Sun dot: r = 15.5 at 37.0° on the ring path (`--color-accent-recovery`).
- Inner hook: **a single circular arc** — center (51.99, 234.30), r = 101.33;
  least-squares fit to the measured centerline, residuals < 0.25px.
- Specular hairline: 3px bloom at r = 176.5, 285°→20° CW, ink token with
  measured opacity ramp (peak 0.9 near 11h).
- Junction flare: recovery-family lens where the hook blends into the ring
  (phi ≈ 250.5–262°).

## Color mapping (tokens only in components)

| Reference zone | Measured | Implementation |
|---|---|---|
| 12h plateau | #42b9f1 | `--color-accent-hydration` (#38bdf8) |
| 7–9h plateau | #fc8939 | `--color-accent-recovery` (#f0883e) |
| gap-end (bottom arc) | #59aafb | `--color-accent-focus` (#58a6ff) |
| 300° transition | #75adc3 | `color-mix(recovery 33%, hydration)` |
| 285° transition | #aba18e | `color-mix(recovery 62%, hydration)` |
| 270° transition | #df8f52 | `color-mix(recovery 91%, hydration)` |
| 90° shading | #4195f5 | `color-mix(focus 90%, surface)` |
| 135° shading dip | #1a79eb | `--df-brand-deep` (dedicated token — exceeds any 2-token mix chroma) |
| 180° shading | #49b5ea | `color-mix(hydration 82%, ink-muted)` |
| 195°/202° shading | #98a39d / #b39e83 | `color-mix(recovery 52–65%, hydration)` |
| Sun dot | #f7883e | `--color-accent-recovery` |

## Iteration log

| Version | Diff @ 32 | Change |
|---|---|---|
| v1 | 3.47% | first parametric build (specular swept the wrong way) |
| v2 | 1.89% | specular 285→20 CW, measured transition stops, R=167 |
| v3 | 1.83% | stroke 29 (swept 28/29/30) |
| v7 | 1.75% | bright junction flare + reshaped hook start |
| v9/v10 | **1.78%** | hook as a single fitted circular arc (smoothness beats polyline hugging) — **final** |

The accepted 1.78% residual is dominated by the reference's raster bloom
(soft outer glow at 330–360° and specular feathering) which a token-only
vector deliberately does not reproduce pixel-perfectly.
