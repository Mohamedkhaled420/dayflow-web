// ============================================================
// Dayflow AI — category & brand DATA colors
// ------------------------------------------------------------
// These are NOT design tokens (PRD §5.2 / DESIGN.md §1):
// category colors are user-editable DATA — they are persisted
// in the store, rendered into SVG fills, and picked from the
// Settings palette popover. Raw hex is therefore allowed HERE
// and nowhere else outside src/styles/theme.css (enforced by
// the `dayflow/no-raw-colors` ESLint rule + check-raw-colors
// build script, both of which exempt this file).
//
// Single source of truth: seed defaults, compute fallbacks,
// the Settings swatch picker, and view accents all import
// from here so the palette can never drift.
// ============================================================

import type { GoalProgress } from "@/lib/types";

/** Default colors for the six goal categories + leisure.
 *  Lively Pastel family (Phase 10): saturated enough to read as
 *  timeline EVENT fills, each one generation-linked to its pastel
 *  surface token (indigo→lavender, pink→pink-200, etc.). */
export const CATEGORY_COLORS = {
  work: "#818CF8", // indigo-400
  personal: "#34D399", // emerald-400
  fitness: "#F472B6", // pink-400
  meals: "#FB923C", // orange-400
  sleep: "#A78BFA", // violet-400
  water: "#22D3EE", // cyan-400
  leisure: "#A3E635", // lime-400
} as const satisfies Record<string, string>;

/** Fallback color for events whose category was deleted. */
export const UNTRACKED_COLOR = "#A1A1AA";

/** Phase 11 — quick-action category card fills (the reference
 *  chat home's "How can I help you today?" grid). The
 *  300-generation pastels: card SURFACES, not event fills, so
 *  they sit one step lighter than CATEGORY_COLORS. Fixed in both
 *  modes — ink stays charcoal (--df-quick-ink). */
export const QUICK_ACTION_COLORS = {
  trip: "#FDE047", // yellow-300 (reference: tourism)
  cooking: "#FDBA74", // orange-300 (reference: cooking)
  sport: "#F9A8D4", // pink-300 (reference: sport)
  art: "#86EFAC", // green-300 (reference: art)
} as const satisfies Record<string, string>;

/** The 12 swatches offered in Settings → Categories. */
export const CATEGORY_SWATCHES = [
  "#818CF8",
  "#A78BFA",
  "#F472B6",
  "#FB923C",
  "#FDE68A",
  "#34D399",
  "#22D3EE",
  "#A3E635",
  "#C084FC",
  "#F87171",
  "#38BDF8",
  "#A1A1AA",
] as const;

/** Appearance picker preview gradients (Settings → Appearance). */
export const THEME_SWATCHES = {
  light: "linear-gradient(135deg, #A5B4FC, #D9F99D)",
  dark: "linear-gradient(135deg, #2A2547, #4C1D95)",
  system: "linear-gradient(135deg, #A5B4FC 50%, #4C1D95 50%)",
} as const;

/** Browser chrome theme-color metadata (app/layout.tsx viewport +
 *  ChromeThemeSync). Values mirror --df-window-bg 1:1 (#A5B4FC light /
 *  #1E1B2E dark in theme.css) so the address-bar band on phones blends
 *  EXACTLY into the app surface — any tint difference reads as a
 *  "browser band" and kills the native feel. */
export const THEME_META_COLORS = {
  light: "#A5B4FC",
  dark: "#1E1B2E",
} as const;

/**
 * Companion (Dia, the 3D tiger) scene lighting. three.js materials
 * cannot read CSS custom properties, so the companion's key/rim/
 * shadow colors live HERE with the other exempt data colors and
 * stay in sync with the Lively Pastel surfaces by hand.
 *  - keyLight: warm ivory sun (matches the app's warm surfaces)
 *  - rimLight: the water category blue — thematic + reads on fur
 *  - shadow:  ink-tinted contact shadow, softened by opacity
 */
export const COMPANION_LIGHTS = {
  keyLight: "#FFE9D6",
  rimLight: CATEGORY_COLORS.water,
  shadow: "#1B1B2A",
} as const;

/**
 * Companion cosmetics + progression (same three.js exemption as
 * COMPANION_LIGHTS — materials can't read CSS variables). Colors for
 * Dia's unlockables and evolution auras:
 *  - headband / knot: coral training band (first PR unlock)
 *  - crown / gem:     gold + aqua royal set (30-day streak unlock)
 *  - auraHunter:      cool confident halo (stage 2)
 *  - auraLegend:      warm gold halo (stage 3)
 */
export const COMPANION_COSMETICS = {
  headband: "#FF5A5F",
  headbandKnot: "#E6484D",
  crown: "#F5B93F",
  crownGem: "#5AC8FA",
  auraHunter: "#8FD3FF",
  auraLegend: "#FFD166",
} as const;

/**
 * PWA install surfaces (Phase 4 ship): manifest theme_color /
 * background_color and the browser <meta name="theme-color">, pinned
 * to the Lively Pastel light window surface (--df-window-bg #A5B4FC —
 * the app defaults to light) so the installed app shell, splash
 * background, and address-bar chrome all read as one periwinkle
 * surface.
 */
export const PWA_SURFACE_COLORS = {
  theme: "#A5B4FC",
  background: "#A5B4FC",
} as const;

/**
 * Open Graph text colors (Phase 6.5 / B4) — satori cannot resolve
 * CSS custom properties (next/og renders standalone), so the ink
 * tokens are materialized here. Values mirror the Lively Pastel
 * --df-text-primary / --df-text-secondary 1:1 (#1E293B / #3F4668);
 * both clear WCAG AA on the periwinkle OG canvas.
 */
export const OG_TEXT_COLORS = {
  ink: "#1E293B",
  inkMuted: "#3F4668",
} as const;

/**
 * Circadian zone colors (Phase 5 T1c) — DATA colors for the Timeline
 * overlay bands: green Peaks, orange Dip. Same data-color rules as
 * CATEGORY_COLORS above (raw hex allowed only in this file).
 */
export const CIRCADIAN_COLORS = {
  peak: "#34C759",
  dip: "#F59E0B",
} as const;

/**
 * Nutrition macro colors (Phase 9) — DATA colors for the DailyView
 * nutrition card bars. Calorie ring uses the meals category amber;
 * macros get distinct hues so the three bars never read as one.
 * Retinted to the Lively Pastel family (pink/cyan/violet).
 */
export const MACRO_COLORS = {
  protein: "#F472B6",
  carbs: "#22D3EE",
  fat: "#A78BFA",
} as const;

/** Convenience: every fallback used by the goals layer (lib/compute). */
export const GOAL_FALLBACK_COLORS: Record<
  GoalProgress["key"],
  string
> = {
  work: CATEGORY_COLORS.work,
  personal: CATEGORY_COLORS.personal,
  fitness: CATEGORY_COLORS.fitness,
  sleep: CATEGORY_COLORS.sleep,
  water: CATEGORY_COLORS.water,
  meals: CATEGORY_COLORS.meals,
};
