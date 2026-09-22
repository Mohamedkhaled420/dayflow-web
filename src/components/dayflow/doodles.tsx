"use client";

// ============================================================
// Dayflow — doodle art library ("hand-made" pass)
// ------------------------------------------------------------
// The hand-drawn layer that keeps the Lively Pastel system from
// reading machine-perfect. Everything here is a self-contained
// inline SVG drawn the way a person doodles in a notebook:
//   - wobbly paths (deliberate off-curve control points)
//   - round caps + joins, never pointed butts
//   - slightly wrong proportions, sticker-tilt rotations
//   - a restrained palette: --df-doodle-* tokens only
//     (ink rides currentColor where the parent sets a text color)
//
// Usage: sprinkle into heroes, empty states, and auth/onboarding
// surfaces. Doodles are decorative — ALWAYS aria-hidden.
// ============================================================

import type { CSSProperties, ReactNode } from "react";

interface DoodleProps {
  className?: string;
  style?: CSSProperties;
}

const INK = "var(--df-doodle-ink)";
const PINK = "var(--df-doodle-accent)";
const AMBER = "var(--df-doodle-accent-2)";
const MINT = "var(--df-doodle-accent-3)";

/** Four-point sparkle — the bread-and-butter doodle. */
export function DoodleSparkle({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M12 2.5c.6 4.4 2.6 7.2 7 8.4-4.5 1-6.9 3.5-7.7 8.1-.7-4.5-3-7-7.3-8 4.4-1.2 6.9-4 8-8.5Z"
        fill={AMBER}
        fillOpacity="0.55"
        stroke={AMBER}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wobbly five-point star. */
export function DoodleStar({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M12 3.2l2.6 5.4 5.9.7-4.3 4 1.2 5.8L12 16.3l-5.3 2.9 1.1-5.9-4.2-4.1 5.9-.6L12 3.2Z"
        fill={PINK}
        fillOpacity="0.4"
        stroke={PINK}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A loose cluster: big sparkle + tiny star + dot. Sits nicely in a
 *  hero corner. Pre-tilted like a sticker. */
export function DoodleCluster({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M22 8c.9 6.6 3.9 10.8 10.5 12.6-6.8 1.5-10.4 5.2-11.6 12.1-1-6.7-4.5-10.4-10.9-12 6.6-1.8 10.4-6 12-12.7Z"
        fill={AMBER}
        fillOpacity="0.5"
        stroke={AMBER}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M48 34l1.7 3.6 3.9.5-2.9 2.7.8 3.9-3.5-1.9-3.5 2 .7-4-2.8-2.7 3.9-.4L48 34Z"
        fill={PINK}
        fillOpacity="0.45"
        stroke={PINK}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="52" cy="14" r="2.4" fill={MINT} fillOpacity="0.7" />
      <circle cx="10" cy="44" r="1.7" fill={PINK} fillOpacity="0.6" />
    </svg>
  );
}

/** Hand-drawn squiggle — underline greetings and key words.
 *  Stretches to the parent's width via preserveAspectRatio="none". */
export function SquiggleUnderline({
  className,
  style,
  color = PINK,
}: DoodleProps & { color?: string }) {
  return (
    <svg
      viewBox="0 0 120 12"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M2 8c9-4.5 16 3.5 25-1s15 3.5 24-1 16 3.5 25-1 15 2.5 22-1.5"
        stroke={color}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Curved hand-drawn arrow — points at things, playfully. */
export function DoodleArrow({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 48 36" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M4 4c8 14 20 22 36 24"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />
      <path
        d="M32 20.5c3.5 4 6.5 6 9 7.5-3.5.4-6.8 1.7-9.5 3.5"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.75"
      />
    </svg>
  );
}

/** Doodle heart — one continuous wobbly loop. */
export function DoodleHeart({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M12 20.5C7.5 17 3.5 13.6 3.5 9.4 3.5 6.6 5.6 4.5 8.2 4.5c1.6 0 3 .8 3.8 2.1.8-1.3 2.2-2.1 3.8-2.1 2.6 0 4.7 2.1 4.7 4.9 0 4.2-4 7.6-8.5 11.1Z"
        fill={PINK}
        fillOpacity="0.3"
        stroke={PINK}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Sun with wonky rays — morning greetings. */
export function DoodleSun({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className} style={style}>
      <circle cx="16" cy="16" r="6.5" fill={AMBER} fillOpacity="0.55" stroke={AMBER} strokeWidth="1.8" />
      <g stroke={AMBER} strokeWidth="1.9" strokeLinecap="round">
        <path d="M16 2.8v3.4" />
        <path d="M16 25.8v3.4" />
        <path d="M2.8 16h3.4" />
        <path d="M25.8 16h3.4" />
        <path d="M6.4 6.6l2.4 2.4" />
        <path d="M23.2 23l2.4 2.4" />
        <path d="M25.6 6.6L23.2 9" />
        <path d="M8.8 23l-2.4 2.4" />
      </g>
    </svg>
  );
}

/** Crescent moon with a tiny star companion — evening greetings. */
export function DoodleMoon({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M24.5 20.8A11 11 0 0 1 11 5.6a11.2 11.2 0 1 0 13.5 15.2Z"
        fill="var(--df-doodle-accent-2)"
        fillOpacity="0.4"
        stroke="var(--df-doodle-accent-2)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M23 6.4c.3 1.9 1.1 3 3 3.4-1.9.5-2.8 1.5-3.2 3.4-.4-1.9-1.3-2.9-3.2-3.3 1.9-.5 2.9-1.6 3.4-3.5Z"
        fill={PINK}
        fillOpacity="0.6"
      />
    </svg>
  );
}

/** Little cloud, two lumpy bumps. */
export function DoodleCloud({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 40 24" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M10 19.5a6.5 6.5 0 0 1-.8-12.9 8 8 0 0 1 15.4-1.6 6.8 6.8 0 0 1 6.6 5.9 5.6 5.6 0 0 1-1.3 11.1L10 19.5Z"
        fill="var(--df-quick-art-accent)"
        fillOpacity="0.55"
        stroke={INK}
        strokeOpacity="0.35"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Sprouting plant — habits empty state ("grow something"). */
export function DoodleSprout({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M24 44V26"
        stroke={MINT}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M24 32c-6-.5-9.5-3.8-10-10 6.5.3 9.8 3.5 10 10Z"
        fill={MINT}
        fillOpacity="0.35"
        stroke={MINT}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M24 27c.4-6.8 4-10.4 10.6-11-.4 6.8-3.9 10.4-10.6 11Z"
        fill={MINT}
        fillOpacity="0.55"
        stroke={MINT}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M16 44h16"
        stroke={INK}
        strokeOpacity="0.5"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M37 8c.4 2.4 1.5 3.8 3.9 4.3-2.4.6-3.6 2-4.1 4.4-.5-2.4-1.6-3.8-4-4.3 2.4-.6 3.6-2 4.2-4.4Z"
        fill={AMBER}
        fillOpacity="0.6"
      />
    </svg>
  );
}

/** Doodle crown — streak flexes. */
export function DoodleCrown({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 32 26" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M4 20.5 2.5 7.5l7 5L16 4l6.5 8.5 7-5-1.5 13H4Z"
        fill={AMBER}
        fillOpacity="0.45"
        stroke={AMBER}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="17.5" r="1.8" fill={PINK} />
    </svg>
  );
}

/** Notebook-checklist doodle — "log anything" empty timeline state. */
export function DoodleNotebook({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 56 48" fill="none" aria-hidden="true" className={className} style={style}>
      <rect
        x="10"
        y="4"
        width="36"
        height="40"
        rx="6"
        fill="var(--df-quick-art-accent)"
        fillOpacity="0.6"
        stroke={INK}
        strokeOpacity="0.55"
        strokeWidth="2"
      />
      <path d="M10 14h36" stroke={INK} strokeOpacity="0.3" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M17 8.5v11"
        stroke={PINK}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <g stroke={MINT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 24.5l2.6 2.6 4.8-5" />
        <path d="M17 33l2.6 2.6 4.8-5" />
      </g>
      <path
        d="M29 26.5h10"
        stroke={INK}
        strokeOpacity="0.45"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M29 35h7"
        stroke={INK}
        strokeOpacity="0.45"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Rising chart with a doodle arrow — weekly momentum. */
export function DoodleChart({ className, style }: DoodleProps) {
  return (
    <svg viewBox="0 0 48 44" fill="none" aria-hidden="true" className={className} style={style}>
      <path
        d="M8 4v32h34"
        stroke={INK}
        strokeOpacity="0.5"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M13 32.5l8.5-9 6.5 5L38 16"
        stroke={PINK}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M31.5 15.5H38v6.5"
        stroke={PINK}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M42 8c.4 2.4 1.5 3.8 3.9 4.3-2.4.6-3.6 2-4.1 4.4-.5-2.4-1.6-3.8-4-4.3 2.4-.6 3.6-2 4.2-4.4Z"
        fill={AMBER}
        fillOpacity="0.7"
      />
    </svg>
  );
}

/** Yellow marker highlight behind a key word — the reference app's
 *  orange highlight box, softened into a highlighter swipe for
 *  in-app copy. Pure CSS, works on any inline text. */
export function Marker({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{
        background: "var(--df-doodle-marker)",
        color: "var(--df-doodle-marker-ink)",
        borderRadius: "0.35em 0.5em 0.45em 0.4em",
        padding: "0 0.22em",
        boxShadow: "0.5px 1.5px 0 var(--df-doodle-marker)",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Sticker tilt — wrap any doodle to lean it a couple of degrees,
 *  the way a sticker lands on a notebook page. */
export function StickerTilt({
  children,
  degrees = -8,
  className,
  style,
}: {
  children: ReactNode;
  degrees?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{ display: "inline-block", transform: `rotate(${degrees}deg)`, ...style }}
    >
      {children}
    </span>
  );
}
