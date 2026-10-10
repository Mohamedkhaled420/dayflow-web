"use client";

// ============================================================
// Dayflow AI — the seal system (reference mockup SIG / PER / ic)
// ------------------------------------------------------------
// The reference HTML never uses emoji characters anywhere.
// Identity, rhythms and meal types are all hand-drawn SVG
// glyphs in the pastel kit palette:
//
//   SIG  → 12 seal avatars (wave, peak, bloom, …). The profile's
//          identity.emoji JSONB field now stores the seal KEY
//          ("wave", "peak", …). Legacy emoji values are migrated
//          on read by EMOJI_TO_SEAL, so nothing breaks.
//   PER  → 6 rhythm cards, each a tiny animated scene (rising
//          sun, ticking clock, twinkling moon, diving bubbles,
//          sliding waves, buzzing bolt). Animation classes
//          (pe-*) live in globals.css next to .dfset-per and
//          only run while a card is SELECTED — idle cards are
//          paused, exactly like the reference `.per .on *`.
//   meal → 4 line-drawn meal glyphs (breakfast bowl + steam,
//          fork + bowl, dinner cloche, apple) in the same ink
//          style as the reference "Log a meal" icon.
//
// Every color resolves from the kit pastel tokens (--df-p-*,
// theme.css) — the reference hexes ARE those tokens. Ink parts
// use currentColor so they flip with the theme. SVG fills go
// through style props so var() resolves everywhere.
// ============================================================

import type { ReactNode } from "react";

/* ---------------- SIG — the 12 seals ---------------- */

export interface SealDef {
  /** seal key — what gets persisted in identity.emoji */
  key: string;
  /** display name shown under the profile */
  name: string;
  /** pastel accent (kit token) */
  color: string;
  /** 48×48 svg body */
  body: ReactNode;
}

export const SEALS: SealDef[] = [
  {
    key: "wave",
    name: "Wave",
    color: "var(--df-p-blue)",
    body: (
      <>
        <path d="M4 33c5-8 10-8 15 0s10 8 15 0 8-6 10-3v14H4z" style={{ fill: "var(--df-p-blue)" }} />
        <path
          d="M4 25c5-8 10-8 15 0s10 8 15 0 8-6 10-3"
          fill="none"
          strokeWidth="3.2"
          strokeLinecap="round"
          style={{ stroke: "var(--df-p-frost)" }}
        />
      </>
    ),
  },
  {
    key: "peak",
    name: "Peak",
    color: "var(--df-p-mauve)",
    body: (
      <>
        <path d="M3 40L19 12l8 13 6-8 12 23z" style={{ fill: "var(--df-p-mauve)" }} />
        <path d="M12.5 26L19 12l5 8.5-5-2.5z" style={{ fill: "var(--df-p-lemon)" }} />
        <circle cx="37" cy="11" r="4.5" style={{ fill: "var(--df-p-powder)" }} />
      </>
    ),
  },
  {
    key: "bloom",
    name: "Bloom",
    color: "var(--df-p-orchid)",
    body: (
      <>
        {[0, 72, 144, 216, 288].map((rot) => (
          <ellipse
            key={rot}
            cx="24"
            cy="13"
            rx="6.2"
            ry="9.5"
            transform={`rotate(${rot} 24 24)`}
            fillOpacity=".9"
            style={{ fill: "var(--df-p-orchid)" }}
          />
        ))}
        <circle cx="24" cy="24" r="4.2" style={{ fill: "var(--df-p-powder)" }} />
      </>
    ),
  },
  {
    key: "sun",
    name: "Sun",
    color: "var(--df-p-powder)",
    body: (
      <>
        <circle cx="24" cy="24" r="9" style={{ fill: "var(--df-p-powder)" }} />
        <path
          d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ stroke: "var(--df-p-powder)" }}
        />
      </>
    ),
  },
  {
    key: "moon",
    name: "Moon",
    color: "var(--df-p-mauve)",
    body: (
      <>
        {/* A real crescent: outer arc bulges deep, the inner arc
            (bigger radius) carves shallow — the reference's equal-
            radius pair degenerated into a 3.7px sliver because the
            tips sat almost exactly 2r apart (see Night Owl below). */}
        <path d="M32 38A16 16 0 0 1 17 10a26 26 0 0 0 15 28z" style={{ fill: "var(--df-p-mauve)" }} />
        <path
          d="M36 10l1 2.6 2.6 1-2.6 1L36 17l-1-2.4-2.6-1 2.6-1z"
          style={{ fill: "var(--df-p-powder)" }}
        />
      </>
    ),
  },
  {
    key: "cloud",
    name: "Cloud",
    color: "var(--df-p-blue)",
    body: (
      <>
        <path
          d="M13 37a8 8 0 0 1-1-16 11 11 0 0 1 21-2 9 9 0 0 1 2 18z"
          style={{ fill: "var(--df-p-blue)" }}
        />
        <path
          d="M15 24a8 8 0 0 1 8-6"
          fill="none"
          strokeWidth="2.6"
          strokeLinecap="round"
          style={{ stroke: "var(--df-p-blue)" }}
        />
      </>
    ),
  },
  {
    key: "star",
    name: "Star",
    color: "var(--df-p-powder)",
    body: (
      <>
        <path
          d="M24 5l5.6 11.6 12.7 1.7-9.3 8.8 2.3 12.6L24 33.7 12.7 39.7 15 27.1 5.7 18.3l12.7-1.7z"
          strokeWidth="2"
          strokeLinejoin="round"
          style={{ fill: "var(--df-p-powder)", stroke: "var(--df-p-powder)" }}
        />
        <path d="M24 15l2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.7z" style={{ fill: "var(--df-p-lemon)" }} />
      </>
    ),
  },
  {
    key: "drop",
    name: "Drop",
    color: "var(--df-p-marine)",
    body: (
      <>
        <path
          d="M24 6c8 9 13 15 13 22a13 13 0 0 1-26 0c0-7 5-13 13-22z"
          style={{ fill: "var(--df-p-marine)" }}
        />
        <path
          d="M17 29a7 7 0 0 0 5 6"
          fill="none"
          strokeWidth="2.8"
          strokeLinecap="round"
          style={{ stroke: "var(--df-p-marine)" }}
        />
      </>
    ),
  },
  {
    key: "leaf",
    name: "Leaf",
    color: "var(--df-p-celadon)",
    body: (
      <>
        <path d="M10 38C8 20 20 8 40 8c0 20-10 32-30 30z" style={{ fill: "var(--df-p-celadon)" }} />
        <path
          d="M12 36C20 26 28 20 36 14"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          style={{ stroke: "var(--df-p-celadon)" }}
        />
      </>
    ),
  },
  {
    key: "heart",
    name: "Heart",
    color: "var(--df-p-rose)",
    body: (
      <>
        <path
          d="M24 40S6 29 6 17a9 9 0 0 1 18-3 9 9 0 0 1 18 3c0 12-18 23-18 23z"
          style={{ fill: "var(--df-p-rose)" }}
        />
        <path
          d="M13 16a4 4 0 0 1 4-4"
          fill="none"
          strokeWidth="2.8"
          strokeLinecap="round"
          style={{ stroke: "var(--df-p-rose)" }}
        />
      </>
    ),
  },
  {
    key: "orbit",
    name: "Orbit",
    color: "var(--df-p-orchid)",
    body: (
      <>
        <circle cx="24" cy="24" r="10" style={{ fill: "var(--df-p-orchid)" }} />
        <ellipse
          cx="24"
          cy="24"
          rx="19"
          ry="6.5"
          transform="rotate(-22 24 24)"
          fill="none"
          strokeWidth="3"
          style={{ stroke: "var(--df-p-mauve)" }}
        />
        <circle cx="39" cy="15" r="2.6" style={{ fill: "var(--df-p-powder)" }} />
      </>
    ),
  },
  {
    key: "spark",
    name: "Spark",
    color: "var(--df-p-mauve)",
    body: (
      <>
        <path
          d="M24 4l4.5 14.5L43 24l-14.5 5.5L24 44l-4.5-14.5L5 24l14.5-5.5z"
          style={{ fill: "var(--df-p-mauve)" }}
        />
        <path
          d="M38 6l1.2 3.3 3.3 1.2-3.3 1.2L38 15l-1.2-3.3-3.3-1.2 3.3-1.2z"
          style={{ fill: "var(--df-p-powder)" }}
        />
      </>
    ),
  },
];

export const SEAL_MAP: Record<string, SealDef> = Object.fromEntries(
  SEALS.map((s) => [s.key, s])
);

/** Legacy emoji → seal key (the pre-SVG avatar set, collapsed 16→12). */
const EMOJI_TO_SEAL: Record<string, string> = {
  "🌊": "wave",
  "💪": "peak",
  "🔥": "spark",
  "🏃": "star",
  "🧘": "bloom",
  "🥗": "leaf",
  "🛏️": "moon",
  "💧": "drop",
  "🧠": "orbit",
  "🚴": "orbit",
  "⚡": "spark",
  "🌱": "leaf",
  "☕": "cloud",
  "🌙": "moon",
  "💻": "wave",
  "🪐": "orbit",
};

/** identity.emoji (seal key OR legacy emoji) → seal definition. */
export function sealFromValue(value: unknown): SealDef {
  const key =
    typeof value === "string" && value
      ? EMOJI_TO_SEAL[value] ?? (SEAL_MAP[value] ? value : null)
      : null;
  return SEAL_MAP[key ?? "wave"];
}

/** Render one of the 12 seals at whatever size the parent CSS gives. */
export function SealGlyph({ seal }: { seal: SealDef }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {seal.body}
    </svg>
  );
}

/* ---------------- PER — the 6 animated rhythms ---------------- */

export interface RhythmDef {
  /** persisted as identity.role */
  label: string;
  desc: string;
  /** target wake time in minutes from midnight */
  wake: number;
  color: string;
  body: ReactNode;
}

export const RHYTHMS: RhythmDef[] = [
  {
    label: "Dawn Chaser",
    desc: "Up before the sun, sharpest before noon",
    wake: 330,
    color: "var(--df-p-powder)",
    body: (
      <>
        <defs>
          <clipPath id="df-rhythm-clip-dawn">
            <rect width="48" height="34" />
          </clipPath>
        </defs>
        <g clipPath="url(#df-rhythm-clip-dawn)">
          <g className="pe-rise">
            <circle cx="24" cy="30" r="11" fill="currentColor" />
            <g
              className="pe-sp"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            >
              <path d="M24 12V7M11 17l-3-3M37 17l3-3M6 30H2M46 30h-4" />
            </g>
          </g>
        </g>
        <path
          d="M4 35h40"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M12 42h24"
          stroke="currentColor"
          strokeOpacity=".4"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    label: "Clockwork",
    desc: "Structured 9 to 5. Steady, predictable, reliable",
    wake: 420,
    color: "var(--df-p-blue)",
    body: (
      <>
        <circle
          cx="24"
          cy="24"
          r="17"
          fill="currentColor"
          fillOpacity=".16"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="M24 8v3M24 37v3M8 24h3M37 24h3"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M24 24l8 4"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          className="pe-hand"
          d="M24 24V12"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="24" cy="24" r="2.6" fill="currentColor" />
      </>
    ),
  },
  {
    label: "Night Owl",
    desc: "Ideas arrive after dark. Slow mornings, strong evenings",
    wake: 570,
    color: "var(--df-p-mauve)",
    body: (
      <>
        {/* The reference's path was degenerate — its two arcs had
            the same radius with tips 31.3px apart (2r = 30), so both
            scaled into the SAME semicircle traced twice: zero area,
            nothing painted. Recreated as a true crescent: a deep
            outer arc + a shallow wide inner arc, horns opening
            toward the twinkles. Browser-verified: ~185px² of fill. */}
        <path d="M31 37A16 16 0 0 1 17 9a26 26 0 0 0 14 28z" fill="currentColor" />
        <path
          className="pe-tw"
          d="M36 8l1.2 3.2 3.2 1.2-3.2 1.2L36 17l-1.2-3.4-3.2-1.2 3.2-1.2z"
          style={{ fill: "var(--df-p-powder)" }}
        />
        <circle className="pe-tw pe-d2" cx="41" cy="27" r="2.2" style={{ fill: "var(--df-p-powder)" }} />
        <circle className="pe-tw pe-d3" cx="29" cy="6" r="1.8" style={{ fill: "var(--df-p-powder)" }} />
      </>
    ),
  },
  {
    label: "Deep Diver",
    desc: "Long uninterrupted focus. Hates context switching",
    wake: 450,
    color: "var(--df-p-marine)",
    body: (
      <>
        <path
          d="M5 11c4-4 7 4 11 0s7 4 11 0 7 4 11 0"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <circle
          className="pe-bb"
          cx="17"
          cy="38"
          r="6"
          fill="currentColor"
          fillOpacity=".25"
          stroke="currentColor"
          strokeWidth="2.6"
        />
        <circle
          className="pe-bb pe-d2"
          cx="31"
          cy="34"
          r="4"
          fill="currentColor"
          fillOpacity=".25"
          stroke="currentColor"
          strokeWidth="2.4"
        />
        <circle className="pe-bb pe-d3" cx="25" cy="42" r="2.6" fill="currentColor" />
      </>
    ),
  },
  {
    label: "Flow Rider",
    desc: "Flexible days. Follows energy, not the clock",
    wake: 480,
    color: "var(--df-p-orchid)",
    body: (
      <>
        <defs>
          <clipPath id="df-rhythm-clip-flow">
            <circle cx="24" cy="24" r="20" />
          </clipPath>
        </defs>
        <g clipPath="url(#df-rhythm-clip-flow)">
          <g className="pe-wv">
            <path
              d="M-12 26c6-8 12-8 18 0s12 8 18 0 12-8 18 0 12 8 18 0 12-8 18 0V52h-90z"
              fill="currentColor"
              fillOpacity=".35"
            />
            <path
              d="M-12 31c6-8 12-8 18 0s12 8 18 0 12-8 18 0 12 8 18 0 12-8 18 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
          </g>
        </g>
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      </>
    ),
  },
  {
    label: "Sprinter",
    desc: "Short, intense bursts, then real breaks",
    wake: 420,
    color: "var(--df-p-rose)",
    body: (
      <>
        <path
          className="pe-ln"
          d="M4 19h8M2 28h9M6 37h8"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path className="pe-bz" d="M29 4L12 27h11l-3 17 20-26H29z" fill="currentColor" />
      </>
    ),
  },
];

/** Legacy pre-SVG rhythm labels → the closest reference rhythm. */
const ROLE_TO_RHYTHM: Record<string, string> = {
  "Early riser": "Dawn Chaser",
  Steady: "Clockwork",
  Balancer: "Flow Rider",
  "Late start": "Night Owl",
  "Night owl": "Night Owl",
};

/** identity.role (any era) → the rhythm card that should look selected. */
export function rhythmFromRole(role: unknown): RhythmDef | null {
  if (typeof role !== "string" || !role) return null;
  const label = ROLE_TO_RHYTHM[role] ?? role;
  return RHYTHMS.find((r) => r.label === label) ?? null;
}

/** Render a rhythm's animated scene (pe-* classes; CSS pauses them
 *  unless the card is selected). */
export function RhythmGlyph({ rhythm }: { rhythm: RhythmDef }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {rhythm.body}
    </svg>
  );
}

/* ---------------- meal glyphs (reference "Log a meal" icon) ---------------- */

/** 24×24 ink line icons — index matches the sheet's meal type. */
const MEAL_BODIES: ReactNode[] = [
  // breakfast — bowl + steam (verbatim from the reference)
  <path
    key="b"
    d="M3.5 12h17a8.5 8.5 0 0 1-17 0zM8 20.5h8M9 8c-1.5-1.6 1.5-2.4 0-4M15 8c-1.5-1.6 1.5-2.4 0-4"
  />,
  // lunch — fork + bowl
  <path
    key="l"
    d="M10 4v5M12.5 4v5M15 4v5M10 4h5M12.5 9v3M3.5 13.5h17a8.5 8.5 0 0 1-17 0zM8 21.5h8"
  />,
  // dinner — cloche
  <path
    key="d"
    d="M12 5a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8zM12 5V3M3 16.5h18M9 20h6"
  />,
  // snack — apple + leaf
  <path
    key="s"
    d="M12 8.5c-3.8-1.4-6.6 1-6.1 4.6.4 3.2 2.8 5.7 4.3 5.7.9 0 1.2-.6 1.8-.6s.9.6 1.8.6c1.5 0 3.9-2.5 4.3-5.7.5-3.6-2.3-6-6.1-4.6zM12 8.5c0-1.8 1-2.9 2.4-3.4M14.4 5.1c1.7-.5 2.9.2 3.5 1.4-1.4.8-2.9.5-3.5-1.4z"
  />,
];

/** Pastel tint per meal type (container bg + icon accent). */
export const MEAL_TINTS = [
  "var(--df-p-powder)",
  "var(--df-p-celadon)",
  "var(--df-p-blue)",
  "var(--df-p-rose)",
];

export function MealGlyph({ type }: { type: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {MEAL_BODIES[type] ?? MEAL_BODIES[0]}
    </svg>
  );
}
