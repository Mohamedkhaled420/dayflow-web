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
 *  Editorial Cream family (Phase 13, reference "Dayflow (1).html"):
 *  the reference CAT palette — saturated editorial hues that read
 *  as timeline EVENT fills on the cream window (#fbf7f0) and keep
 *  AA against white cards. */
export const CATEGORY_COLORS = {
  work: "#5B6CFF", // cobalt (reference: Work)
  personal: "#14B8A6", // teal (reference: Personal)
  fitness: "#FF6B57", // coral (reference: Fitness)
  meals: "#FF9F0A", // amber (reference: Meals)
  sleep: "#8E6BFF", // violet (reference: Sleep)
  water: "#0A84FF", // system blue (reference: Water orb)
  leisure: "#30C48D", // mint (reference: Leisure)
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
  light: "linear-gradient(135deg, #FBF7F0, #FFD9E8)",
  dark: "linear-gradient(135deg, #101012, #2B3170)",
  system: "linear-gradient(135deg, #FBF7F0 50%, #101012 50%)",
} as const;

/** Browser chrome theme-color metadata (app/layout.tsx viewport +
 *  ChromeThemeSync). Values mirror --df-window-bg 1:1 (#FBF7F0 light /
 *  #101012 dark in theme.css) so the address-bar band on phones blends
 *  EXACTLY into the app surface — any tint difference reads as a
 *  "browser band" and kills the native feel. */
export const THEME_META_COLORS = {
  light: "#FBF7F0",
  dark: "#101012",
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
  theme: "#FBF7F0",
  background: "#FBF7F0",
} as const;

/**
 * Open Graph text colors (Phase 6.5 / B4) — satori cannot resolve
 * CSS custom properties (next/og renders standalone), so the ink
 * tokens are materialized here. Values mirror the Editorial Cream
 * --df-text-primary / --df-text-muted 1:1 (#1D1D1F / #6E6E73);
 * both clear WCAG AA on the cream OG canvas.
 */
export const OG_TEXT_COLORS = {
  ink: "#1D1D1F",
  inkMuted: "#6E6E73",
} as const;

/**
 * Circadian zone colors (Phase 5 T1c) — DATA colors for the Timeline
 * overlay bands: green Peaks, orange Dip. Same data-color rules as
 * CATEGORY_COLORS above (raw hex allowed only in this file).
 */
export const CIRCADIAN_COLORS = {
  peak: "#F0518F",
  dip: "#FF9500",
} as const;

/**
 * Phase 13 — the four-tab shell accents (reference nav). Each tab
 * tints the sliding pill highlight, the plus FAB, and the pane's
 * interactive accents: Today cobalt, Nutrition amber, Training
 * pink, Habits green.
 */
export const TAB_ACCENTS = {
  today: "#0A84FF",
  nutrition: "#FF9500",
  training: "#F0518F",
  habits: "#34C759",
} as const;

/**
 * Phase 13 — Today living-sky circadian zones (reference ZN table).
 * DATA colors for the zone label dot, the next-up card tint, and
 * the sky overlay copy. Ordered by hour offset from wake.
 */
export const ZONE_COLORS = {
  rest: "#8E6BFF",
  warmup: "#FF9500",
  peak: "#F0518F",
  steady: "#0A84FF",
  dip: "#8E8E93",
  secondWind: "#8E6BFF",
  windDown: "#34C759",
} as const;

/**
 * Phase 13 — habit row accent palette (reference PAL). Habits cycle
 * through these in order when created without an explicit color.
 */
export const HABIT_COLORS = [
  "#F0518F",
  "#0A84FF",
  "#FF9500",
  "#AF52DE",
  "#34C759",
  "#32ADE6",
] as const;

/**
 * Phase 13 — habit streak SEALS (reference TR tiers). Six scalloped
 * badge tiers, earned by keeping any single habit alive for N days.
 * `a`/`b` are the gradient stops; glyphs live in the Habits view.
 */
export const SEAL_TIERS = [
  { key: "spark", name: "Spark", days: 3, a: "#FFC27A", b: "#FF7A45" },
  { key: "kindle", name: "Kindle", days: 7, a: "#FF9BBD", b: "#F0518F" },
  { key: "ember", name: "Ember", days: 14, a: "#FF7D5C", b: "#D93A2B" },
  { key: "hearth", name: "Hearth", days: 30, a: "#CFA0FF", b: "#7F5AF0" },
  { key: "beacon", name: "Beacon", days: 60, a: "#7FD4FF", b: "#2A7DE1" },
  { key: "sun", name: "Sun", days: 100, a: "#FFE27A", b: "#FF9F0A" },
] as const;

/**
 * Phase 13 — quick-log workout activities (reference ACT). Each
 * carries its accent + a sensible default duration; the sliding
 * highlight in the manual logger tints to the active activity.
 */
export const WORKOUT_ACTIVITIES = [
  { key: "Strength", color: "#F0518F", defaultMin: 45 },
  { key: "Run", color: "#FF7A45", defaultMin: 30 },
  { key: "Walk", color: "#34C759", defaultMin: 40 },
  { key: "Cycle", color: "#0A84FF", defaultMin: 45 },
  { key: "Swim", color: "#32ADE6", defaultMin: 30 },
  { key: "Yoga", color: "#AF52DE", defaultMin: 40 },
  { key: "HIIT", color: "#FF3B30", defaultMin: 20 },
  { key: "Other", color: "#8E8E93", defaultMin: 30 },
] as const;

/**
 * Nutrition macro colors (Phase 9 → Phase 13 retint) — DATA colors
 * for the Nutrition pane bars. Reference: protein = system blue,
 * carbs = sun amber, fat = violet (the --acc/--sun/--ft family).
 */
export const MACRO_COLORS = {
  protein: "#2383E2",
  carbs: "#D9730D",
  fat: "#8A63D2",
} as const;

/**
 * Phase 13 — the Today living-sky scene ART (numeric RGB so no raw
 * color literals enter component code; the ESLint drift guard only
 * exempts this file). Keyframes: [hour, topStop, bottomStop]. The
 * scene interpolates between neighbors as the day (or the user's
 * drag) sweeps through.
 */
export const SKY_KEYFRAMES: [number, [number, number, number], [number, number, number]][] = [
  [0, [11, 16, 48], [38, 42, 104]],
  [5, [11, 16, 48], [38, 42, 104]],
  [6.5, [106, 98, 201], [255, 176, 156]],
  [8.5, [105, 180, 255], [255, 230, 191]],
  [12, [74, 163, 255], [196, 230, 255]],
  [16.5, [90, 167, 240], [255, 225, 180]],
  [19, [90, 79, 176], [255, 143, 110]],
  [21, [11, 16, 48], [38, 42, 104]],
  [24, [11, 16, 48], [38, 42, 104]],
];

/** Hill pairs [dayColor, nightColor] — the three parallax ridges. */
export const HILL_COLORS: [number, number, number][][] = [
  [
    [143, 214, 162],
    [29, 42, 99],
  ],
  [
    [92, 186, 133],
    [22, 31, 77],
  ],
  [
    [58, 154, 114],
    [15, 22, 56],
  ],
];

/** Sun / moon / star / cloud tints (fixed art). */
export const SCENE_ART = {
  sunGlow: [255, 217, 107],
  sunCore: [255, 211, 107],
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
