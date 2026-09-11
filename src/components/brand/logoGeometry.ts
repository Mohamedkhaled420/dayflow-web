// ============================================================
// Dayflow AI — brand mark geometry (Phase 6.5 / B1)
// ------------------------------------------------------------
// Single source of truth for the mark's path data, shared by
// LogoMark (static), LogoFormation (scroll draw-on) and
// LogoLoop (indeterminate loader).
//
// Geometry was rebuilt parametrically from the reference render
// (docs/screenshots/phase6-5/pixeldiff-*) and verified with a
// Chromium pixel-diff: 1.78% differing pixels at 512px (<=2%
// budget, threshold max-channel delta 32).
//
// All angles are clock angles: 0 = 12 o'clock, CW positive.
//   ring centerline R = 167, stroke = 29, viewBox 512
//   gap (with sun dot) centered ~37 deg CW of 12 o'clock
//   hook = single circular arc, center (51.99, 234.30), r = 101.33
// ============================================================

export const LOGO_VIEWBOX = 512;
export const LOGO_R = 167;
export const LOGO_STROKE = 29;

/** Ring sub-arcs. Drawn with round caps; shared endpoints are
 *  covered by the neighbouring stroke (same annulus), so only the
 *  two gap-edge caps are ever visible — by design. */
export const TOP_ARC_1 = "M 315.03 99.78 A 167 167 0 0 0 111.37 172.5"; // gap edge -> 300 deg (CCW)
export const TOP_ARC_2 = "M 111.37 172.5 A 167 167 0 0 0 99.07 313.12"; // 300 -> 250 deg
export const BOT_ARC_1 = "M 378.73 142.75 A 167 167 0 0 1 374.09 374.09"; // gap edge -> 135 deg (CW)
export const BOT_ARC_2 = "M 374.09 374.09 A 167 167 0 0 1 256 423"; // 135 -> 180 deg
export const BOT_ARC_3 = "M 256 423 A 167 167 0 0 1 160.21 392.8"; // 180 -> 215 deg
export const BOT_ARC_4 = "M 160.21 392.8 A 167 167 0 0 1 99.07 313.12"; // 215 -> 250 deg

/** Inner hook: one circular arc from under the ring band (~247 deg)
 *  to the terminus cap at (269.5 deg, r=105). */
export const HOOK_ARC = "M 102.66 322.05 A 101.33 101.33 0 0 0 151 256.92";

/** Sun dot in the gap, on the ring path. */
export const DOT_CX = 355.06;
export const DOT_CY = 124.54;
export const DOT_R = 15.5;

/** Specular hairline along the top arc's outer edge (285 -> 20 deg). */
export const SPECULAR_ARC = "M 85.51 210.32 A 176.5 176.5 0 0 1 316.37 90.14";
export const SPECULAR_R = 176.5;

/** Junction flare (the ribbon blending into the ring's inner edge,
 *  phi ~250.5..262) — filled lens, recovery family. */
export const JUNCTION_LENS =
  "M 112.25 306.91 A 152.5 152.5 0 0 1 104.98 277.22 L 131.72 273.47 Q 130.04 278.3 128.35 283.13 Q 125.93 287.94 123.5 292.75 Q 120.29 297.62 117.07 302.49 Q 120.08 302.78 123.09 303.07 Z";

/** Full ring as one path (for the loop's dash animation). */
export const RING_CIRCLE = `M 256 89 A ${LOGO_R} ${LOGO_R} 0 1 1 255.9 89`;

// ------------------------------------------------------------
// Gradient stop colors — token expressions only (PRD §9.1).
// The principal stops are the accent tokens; transition stops are
// color-mix() derivations that reproduce the reference render's
// gradient (verified in the pixel-diff report).
// ------------------------------------------------------------
export const STOPS = {
  hyd: "var(--color-accent-hydration)",
  rec: "var(--color-accent-recovery)",
  foc: "var(--color-accent-focus)",
  ink: "var(--color-ink)",
  /** measured #75adc3 (300 deg) */
  m300: "color-mix(in srgb, var(--color-accent-recovery) 33%, var(--color-accent-hydration))",
  /** measured #aba18e (285 deg) */
  m285: "color-mix(in srgb, var(--color-accent-recovery) 62%, var(--color-accent-hydration))",
  /** measured #df8f52 (270 deg) */
  m270: "color-mix(in srgb, var(--color-accent-recovery) 91%, var(--color-accent-hydration))",
  /** measured #4195f5 (90 deg) */
  m90: "color-mix(in srgb, var(--color-accent-focus) 90%, var(--color-surface))",
  /** measured #1a79eb (135 deg) — tubular shading dip; dedicated token */
  m135: "var(--df-brand-deep)",
  /** measured #49b5ea (180 deg) */
  m180: "color-mix(in srgb, var(--color-accent-hydration) 82%, var(--color-ink-muted))",
  /** measured #98a39d (195 deg) */
  m195: "color-mix(in srgb, var(--color-accent-recovery) 52%, var(--color-accent-hydration))",
  /** measured #b39e83 (202 deg) */
  m202: "color-mix(in srgb, var(--color-accent-recovery) 65%, var(--color-accent-hydration))",
} as const;
