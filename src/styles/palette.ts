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
 *  Living Pastel Sky family (Phase 14, reference "Dayflow (4).html"):
 *  the reference CAT palette — soft pastels that read as timeline
 *  EVENT fills on the ivory window (#FFFBF3). Text/dot art on top
 *  of these uses the 60/40 ink mix (see components) so nothing
 *  sits white-on-pastel. */
export const CATEGORY_COLORS = {
  work: "#A3C4F3", // baby blue ice (reference: Work)
  personal: "#98F5E1", // aquamarine (reference: Personal)
  fitness: "#FFCFD2", // cotton rose (reference: Fitness)
  meals: "#FDE4CF", // powder petal (reference: Meals)
  sleep: "#CFBAF0", // mauve (reference: Sleep)
  water: "#A3C4F3", // baby blue ice (reference: Water orb)
  leisure: "#B9FBC0", // celadon (reference: Leisure)
} as const satisfies Record<string, string>;

/** Fallback color for events whose category was deleted. */
export const UNTRACKED_COLOR = "#9A98AA";

/** Phase 11 — quick-action category card fills (the reference
 *  chat home's "How can I help you today?" grid). Pastel card
 *  SURFACES from the Phase 14 palette; ink stays charcoal
 *  (--df-quick-ink). */
export const QUICK_ACTION_COLORS = {
  trip: "#8EECF5", // electric aqua (reference: tourism)
  cooking: "#FDE4CF", // powder petal (reference: cooking)
  sport: "#FFCFD2", // cotton rose (reference: sport)
  art: "#B9FBC0", // celadon (reference: art)
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
  light: "linear-gradient(135deg, #FFFBF3, #FFCFD2)",
  dark: "linear-gradient(135deg, #17151F, #4B4580)",
  system: "linear-gradient(135deg, #FFFBF3 50%, #17151F 50%)",
} as const;

/** Browser chrome theme-color metadata (app/layout.tsx viewport +
 *  ChromeThemeSync). Values mirror --df-window-bg 1:1 (#FFFBF3 light /
 *  #17151F dark in theme.css) so the address-bar band on phones blends
 *  EXACTLY into the app surface — any tint difference reads as a
 *  "browser band" and kills the native feel. */
export const THEME_META_COLORS = {
  light: "#FFFBF3",
  dark: "#17151F",
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
  shadow: "#141416",
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
 * to the Editorial Cream light window surface (--df-window-bg
 * #FBF7F0 — the app defaults to light) so the installed app shell,
 * splash background, and address-bar chrome all read as one cream
 * surface.
 */
export const PWA_SURFACE_COLORS = {
  theme: "#FFFBF3",
  background: "#FFFBF3",
} as const;

/**
 * Open Graph text colors (Phase 6.5 / B4) — satori cannot resolve
 * CSS custom properties (next/og renders standalone), so the ink
 * tokens are materialized here. Values mirror the Editorial Cream
 * --df-text-primary / --df-text-muted 1:1 (#1D1D1F / #6E6E73);
 * both clear WCAG AA on the cream OG canvas.
 */
export const OG_TEXT_COLORS = {
  ink: "#2B2940",
  inkMuted: "#5F5C78",
} as const;

/**
 * Circadian zone colors (Phase 5 T1c) — DATA colors for the Timeline
 * overlay bands: green Peaks, orange Dip. Same data-color rules as
 * CATEGORY_COLORS above (raw hex allowed only in this file).
 */
export const CIRCADIAN_COLORS = {
  peak: "#FFCFD2",
  dip: "#FDE4CF",
} as const;

/**
 * Phase 13 — the four-tab shell accents (reference nav). Each tab
 * tints the sliding pill highlight, the plus FAB, and the pane's
 * interactive accents: Today cobalt, Nutrition amber, Training
 * pink, Habits green.
 */
export const TAB_ACCENTS = {
  today: "#A3C4F3",
  nutrition: "#FDE4CF",
  training: "#FFCFD2",
  habits: "#B9FBC0",
  coach: "#CFBAF0",
} as const;

/**
 * Phase 13 — Today living-sky circadian zones (reference ZN table).
 * DATA colors for the zone label dot, the next-up card tint, and
 * the sky overlay copy. Ordered by hour offset from wake.
 */
export const ZONE_COLORS = {
  rest: "#CFBAF0",
  warmup: "#FDE4CF",
  peak: "#FFCFD2",
  steady: "#A3C4F3",
  dip: "#9A98AA",
  secondWind: "#CFBAF0",
  windDown: "#B9FBC0",
} as const;

/**
 * Phase 13 — habit row accent palette (reference PAL). Habits cycle
 * through these in order when created without an explicit color.
 */
export const HABIT_COLORS = [
  "#FFCFD2",
  "#A3C4F3",
  "#FDE4CF",
  "#CFBAF0",
  "#B9FBC0",
  "#98F5E1",
] as const;

/**
 * Phase 13 — habit streak SEALS (reference TR tiers). Six scalloped
 * badge tiers, earned by keeping any single habit alive for N days.
 * `a`/`b` are the gradient stops; glyphs live in the Habits view.
 */
export const SEAL_TIERS = [
  { key: "spark", name: "Spark", days: 3, a: "#FDE4CF", b: "#FDE4CF" },
  { key: "kindle", name: "Kindle", days: 7, a: "#FFCFD2", b: "#FFCFD2" },
  { key: "ember", name: "Ember", days: 14, a: "#FFCFD2", b: "#F1C0E8" },
  { key: "hearth", name: "Hearth", days: 30, a: "#CFBAF0", b: "#CFBAF0" },
  { key: "beacon", name: "Beacon", days: 60, a: "#90DBF4", b: "#90DBF4" },
  { key: "sun", name: "Sun", days: 100, a: "#FBF8CC", b: "#FDE4CF" },
] as const;

/**
 * Phase 13 — quick-log workout activities (reference ACT). Each
 * carries its accent + a sensible default duration; the sliding
 * highlight in the manual logger tints to the active activity.
 */
export const WORKOUT_ACTIVITIES = [
  { key: "Strength", color: "#FFCFD2", defaultMin: 45 },
  { key: "Run", color: "#FDE4CF", defaultMin: 30 },
  { key: "Walk", color: "#B9FBC0", defaultMin: 40 },
  { key: "Cycle", color: "#A3C4F3", defaultMin: 45 },
  { key: "Swim", color: "#98F5E1", defaultMin: 30 },
  { key: "Yoga", color: "#CFBAF0", defaultMin: 40 },
  { key: "HIIT", color: "#FFCFD2", defaultMin: 20 },
  { key: "Other", color: "#9A98AA", defaultMin: 30 },
] as const;

/**
 * Nutrition macro colors (Phase 9 → Phase 13 retint) — DATA colors
 * for the Nutrition pane bars. Reference: protein = system blue,
 * carbs = sun amber, fat = violet (the --acc/--sun/--ft family).
 */
export const MACRO_COLORS = {
  protein: "#A3C4F3",
  carbs: "#FDE4CF",
  fat: "#CFBAF0",
} as const;

/**
 * Phase 13 — the Today living-sky scene ART (numeric RGB so no raw
 * color literals enter component code; the ESLint drift guard only
 * exempts this file). Keyframes: [hour, topStop, bottomStop]. The
 * scene interpolates between neighbors as the day (or the user's
 * drag) sweeps through.
 */
export const SKY_KEYFRAMES: [number, [number, number, number], [number, number, number]][] = [
  [0, [42, 39, 80], [75, 69, 128]],
  [5, [42, 39, 80], [75, 69, 128]],
  [6.5, [185, 166, 232], [255, 207, 210]],
  [8.5, [163, 196, 243], [253, 228, 207]],
  [12, [142, 201, 242], [230, 248, 255]],
  [16.5, [163, 196, 243], [253, 228, 207]],
  [19, [183, 154, 224], [255, 184, 168]],
  [21, [42, 39, 80], [75, 69, 128]],
  [24, [42, 39, 80], [75, 69, 128]],
];

/** Hill pairs [dayColor, nightColor] — the three parallax ridges. */
export const HILL_COLORS: [number, number, number][][] = [
  [
    [185, 251, 192],
    [58, 58, 110],
  ],
  [
    [152, 245, 225],
    [46, 45, 90],
  ],
  [
    [144, 219, 244],
    [35, 34, 72],
  ],
];

/** Sun / moon / star / cloud tints (fixed art). */
export const SCENE_ART = {
  sunGlow: [255, 233, 168],
  sunCore: [251, 248, 204],
  moonHalo: [205, 214, 255],
  moonCore: [244, 241, 255],
  star: [255, 255, 255],
  cloud: [255, 255, 255],
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
