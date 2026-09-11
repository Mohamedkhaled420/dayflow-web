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
  light: "linear-gradient(135deg, #FFE6CF, #D6E8FF)",
  dark: "linear-gradient(135deg, #303C5B, #3B2B4B)",
  system: "linear-gradient(135deg, #FFE6CF 50%, #3B2B4B 50%)",
} as const;

/** Browser chrome theme-color metadata (app/layout.tsx viewport). */
export const THEME_META_COLORS = {
  light: "#FFE6E0",
  dark: "#313348",
} as const;

/**
 * PWA install surfaces (Phase 4 ship): manifest theme_color /
 * background_color and the browser <meta name="theme-color">, pinned
 * to --color-surface (#0e1117) so the installed app shell, splash
 * background, and address-bar chrome all read as one surface.
 */
export const PWA_SURFACE_COLORS = {
  theme: "#0e1117",
  background: "#0e1117",
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
