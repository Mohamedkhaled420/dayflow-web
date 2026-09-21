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

/** Default colors for the six goal categories + leisure. */
export const CATEGORY_COLORS = {
  work: "#8BAAFF",
  personal: "#B984FF",
  fitness: "#FF706B",
  meals: "#F6BE74",
  sleep: "#6E66D4",
  water: "#56CFEE",
  leisure: "#88E5DF",
} as const satisfies Record<string, string>;

/** Fallback color for events whose category was deleted. */
export const UNTRACKED_COLOR = "#A0AEC0";

/** The 12 swatches offered in Settings → Categories. */
export const CATEGORY_SWATCHES = [
  "#8BAAFF",
  "#CF8FFF",
  "#90DDF0",
  "#6E66D4",
  "#88E5DF",
  "#B984FF",
  "#FF706B",
  "#F6BE74",
  "#56CFEE",
  "#FF5950",
  "#A0AEC0",
  "#6AADFF",
] as const;

/** Appearance picker preview gradients (Settings → Appearance). */
export const THEME_SWATCHES = {
  light: "linear-gradient(135deg, #FFE3CE, #FFC9A8)",
  dark: "linear-gradient(135deg, #3A322A, #4A2C1B)",
  system: "linear-gradient(135deg, #FFE3CE 50%, #4A2C1B 50%)",
} as const;

/** Browser chrome theme-color metadata (app/layout.tsx viewport +
 *  ChromeThemeSync). Values mirror --df-window-bg 1:1 (#FAF5EC light /
 *  #1C1917 dark in theme.css) so the address-bar band on phones blends
 *  EXACTLY into the app surface — any tint difference reads as a
 *  "browser band" and kills the native feel. */
export const THEME_META_COLORS = {
  light: "#FAF5EC",
  dark: "#1C1917",
} as const;

/**
 * PWA install surfaces (Phase 4 ship): manifest theme_color /
 * background_color and the browser <meta name="theme-color">, pinned
 * to the Sunrise Flow light window surface (--df-window-bg #FAF5EC —
 * the app defaults to light) so the installed app shell, splash
 * background, and address-bar chrome all read as one warm-ivory
 * surface.
 */
export const PWA_SURFACE_COLORS = {
  theme: "#FAF5EC",
  background: "#FAF5EC",
} as const;

/**
 * Open Graph text colors (Phase 6.5 / B4) — satori cannot resolve
 * CSS custom properties (next/og renders standalone), so the ink
 * tokens are materialized here. Values mirror the Sunrise Flow
 * --df-text-primary / --df-text-secondary 1:1 (#362D20 / #6B5F4E)
 * because the OG canvas is the warm-ivory PWA surface — light ink
 * would vanish on it.
 */
export const OG_TEXT_COLORS = {
  ink: "#362D20",
  inkMuted: "#6B5F4E",
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
 */
export const MACRO_COLORS = {
  protein: "#FF706B",
  carbs: "#56CFEE",
  fat: "#B984FF",
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
