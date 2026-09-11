"use client";

// ============================================================
// Dayflow AI — LogoLoop (Phase 6.5 / B3)
// ------------------------------------------------------------
// Indeterminate loader built from the brand mark: a 69% arc of
// the ring rotating 360deg every 1.4s (transform-only) plus the
// sun dot blinking on the same cycle as the arc passes the gap
// (opacity-only). The inner hook sits static and faded so md/lg
// sizes still read as the brand.
//
// §5.6 compliance: compositor-only — the ONLY animations are
// transform (rotate) and opacity, both defined in globals.css
// (df-loop-rotate / df-loop-blink) with reduced-motion and
// reduced-transparency variants.
//
// Sizes: sm 24px (inline in buttons) · md 48px (panels,
// skeletons, route loading) · lg 112px (splash).
// NEVER mount inside the dock, inside scroll lists, or as a
// fullscreen wall (PRD §7 "no spinner walls").
// ============================================================

import { useId } from "react";

import { DOT_CX, DOT_CY, DOT_R, HOOK_ARC, LOGO_R, STOPS } from "./logoGeometry";

const SIZES = { sm: 24, md: 48, lg: 112 } as const;
export type LogoLoopSize = keyof typeof SIZES;

/** Ring circumference at R=167 is 2*pi*167 = 1049.24; 69% visible
 *  (the brief's 760/345 split on 2*pi*176, scaled to the measured
 *  ring radius). The path starts at 93deg so the 325-unit gap is
 *  centred on the sun dot's clock angle (~37deg). */
const CIRCUMFERENCE = 2 * Math.PI * LOGO_R;
const DASH = 724;
const GAP = CIRCUMFERENCE - DASH;
const LOOP_RING = "M 422.9 264.73 A 167 167 0 1 1 422.9 264.72";

export function LogoLoop({
  size = "md",
  label,
  className,
}: {
  size?: LogoLoopSize;
  /** When provided the loop announces itself as a loading region. */
  label?: string;
  className?: string;
}) {
  const px = SIZES[size];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ringId = `df-ll-${uid}-ring`;
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient
          id={ringId}
          gradientUnits="userSpaceOnUse"
          x1="256"
          y1="89"
          x2="110"
          y2="380"
        >
          <stop offset="0%" stopColor={STOPS.hyd} />
          <stop offset="45%" stopColor={STOPS.foc} />
          <stop offset="100%" stopColor={STOPS.rec} />
        </linearGradient>
      </defs>

      {/* static, faded hook — brand identity at md/lg */}
      <path
        d={HOOK_ARC}
        stroke={STOPS.rec}
        strokeWidth={LOGO_STROKE_W}
        strokeLinecap="round"
        opacity={0.3}
      />

      {/* rotating 69% arc — transform only */}
      <g className="df-loop-rotor">
        <path
          d={LOOP_RING}
          stroke={`url(#${ringId})`}
          strokeWidth={LOGO_STROKE_W}
          strokeLinecap="round"
          strokeDasharray={`${DASH} ${GAP.toFixed(2)}`}
        />
      </g>

      {/* sun dot — blinks as the arc passes the gap (opacity only) */}
      <circle cx={DOT_CX} cy={DOT_CY} r={DOT_R} fill={STOPS.rec} className="df-loop-dot" />
    </svg>
  );
}

const LOGO_STROKE_W = 29;
