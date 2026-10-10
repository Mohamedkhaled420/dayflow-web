"use client";

// ============================================================
// Dayflow AI — the welcome-flow logo (reference mockup LOGO)
// ------------------------------------------------------------
// The animated brand mark used across the landing / auth /
// onboarding suite. Three gradient arcs + the recovery hook +
// the focus dot, drawn with pathLength=100 so every state is a
// stroke-dashoffset play:
//
//   live  → breathe (lgb) + dot pop & wiggle (lgp/lgf), the
//           resting identity after the draw-in
//   spin  → the ring rotates (loading state)
//   jump  → the dot jumps (form error shake companion)
//   prg   → p1..p4 progressive arcs (onboarding step header)
//   sta   → static, scroll-driven draw vars (--d1..--dh,--dt)
//           set by the landing story engine
//
// Colors resolve from the app token system — the reference
// hexes ARE the accent tokens (hydration / focus / recovery /
// brand-deep); the two transition shades are color-mix() so no
// raw hex lives in this file.
// ============================================================

import { useId } from "react";

export function DayflowLogo({
  live = false,
  spin = false,
  jump = false,
  /** onboarding progress 1..4 (0 = no progress state) */
  progress = 0,
  /** scroll-drawn story mode (landing) */
  sta = false,
  className,
  style,
}: {
  live?: boolean;
  spin?: boolean;
  jump?: boolean;
  progress?: number;
  sta?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ga = `dfl-lg-${uid}-a`;
  const gb = `dfl-lg-${uid}-b`;
  const gc = `dfl-lg-${uid}-c`;

  const cls = [
    "dfl-lg",
    live ? "live" : "",
    spin ? "spin" : "",
    jump ? "jump" : "",
    progress > 0 ? `prg p${Math.min(4, progress)}` : "",
    sta ? "sta" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  /* the reference's six stops, bridged to app tokens */
  const sky = "var(--color-accent-hydration)";
  const blue = "var(--color-accent-focus)";
  const deep = "var(--df-brand-deep)";
  const muted = "color-mix(in srgb, var(--color-accent-hydration) 60%, var(--df-p-slate))";
  const orange = "var(--color-accent-recovery)";
  const amber = "color-mix(in srgb, var(--color-accent-recovery) 72%, var(--df-p-powder))";

  return (
    <svg
      className={cls}
      style={style}
      viewBox="60 60 480 480"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={ga} gradientUnits="userSpaceOnUse" x1="300" y1="100" x2="100" y2="300">
          <stop offset="0" stopColor={sky} />
          <stop offset=".55" stopColor={sky} />
          <stop offset=".8" stopColor={muted} />
          <stop offset="1" stopColor={orange} />
        </linearGradient>
        <linearGradient id={gb} gradientUnits="userSpaceOnUse" x1="458" y1="178" x2="300" y2="500">
          <stop offset="0" stopColor={blue} />
          <stop offset=".55" stopColor={deep} />
          <stop offset="1" stopColor={sky} />
        </linearGradient>
        <linearGradient id={gc} gradientUnits="userSpaceOnUse" x1="300" y1="500" x2="110" y2="360">
          <stop offset="0" stopColor={sky} />
          <stop offset=".3" stopColor={amber} />
          <stop offset=".55" stopColor={orange} />
          <stop offset="1" stopColor={orange} />
        </linearGradient>
      </defs>
      <g className="rg">
        <path className="a a1" pathLength={100} stroke={`url(#${ga})`} d="M100 300A200 200 0 0 1 381 117" />
        <path className="a a2" pathLength={100} stroke={`url(#${gb})`} d="M458 178A200 200 0 0 1 300 500" />
        <path className="a a3" pathLength={100} stroke={`url(#${gc})`} d="M300 500A200 200 0 0 1 100 300" />
      </g>
      <path className="a hk" pathLength={100} stroke={orange} d="M100 300C100 345 120 358 146 358C170 358 178 336 178 300" />
      <circle className="dt" cx="415" cy="148" r="19" fill={orange} />
    </svg>
  );
}
