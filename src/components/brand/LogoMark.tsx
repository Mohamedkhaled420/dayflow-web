"use client";

// ============================================================
// Dayflow AI — LogoMark (Phase 6.5 / B1)
// ------------------------------------------------------------
// The formed brand mark, static. Colors are token-only: the three
// §9.1 accent tokens as principal gradient stops, color-mix()
// derivations for the reference render's transition shading, and
// the --df-brand-deep token for the tubular shading dip. No raw
// hex lives in this file.
//
// Gradient ids are suffixed with React's useId(): several marks
// can mount at once (sidebar + splash + auth), and Chromium will
// not paint a gradient whose def sits inside a display:none SVG
// (the hidden mobile-header instance) — unique ids keep every
// instance self-contained.
// ============================================================

import { useId } from "react";

import {
  BOT_ARC_1,
  BOT_ARC_2,
  BOT_ARC_3,
  BOT_ARC_4,
  DOT_CX,
  DOT_CY,
  DOT_R,
  HOOK_ARC,
  JUNCTION_LENS,
  SPECULAR_ARC,
  STOPS,
  TOP_ARC_1,
  TOP_ARC_2,
} from "./logoGeometry";

export function LogoMark({
  size,
  className,
  decorative = true,
}: {
  /** Fixed pixel size; omit for a responsive fill of the parent. */
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `df-lm-${uid}-${name}`;
  return (
    <svg
      {...(size ? { width: size, height: size } : { width: "100%", height: "100%" })}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Dayflow AI mark"}
      aria-hidden={decorative ? true : undefined}
    >
      <defs>
        {/* top arc, leg 1: hydration plateau (gap edge -> 300 deg) */}
        <linearGradient
          id={id("top1")}
          gradientUnits="userSpaceOnUse"
          x1="315.03"
          y1="99.78"
          x2="111.37"
          y2="172.5"
        >
          <stop offset="0%" stopColor={STOPS.hyd} />
          <stop offset="83.1%" stopColor={STOPS.hyd} />
          <stop offset="100%" stopColor={STOPS.m300} />
        </linearGradient>
        {/* top arc, leg 2: hydration -> recovery transition (300 -> 250 deg) */}
        <linearGradient
          id={id("top2")}
          gradientUnits="userSpaceOnUse"
          x1="111.37"
          y1="172.5"
          x2="99.07"
          y2="313.12"
        >
          <stop offset="0%" stopColor={STOPS.m300} />
          <stop offset="29.5%" stopColor={STOPS.m285} />
          <stop offset="60.1%" stopColor={STOPS.m270} />
          <stop offset="90.2%" stopColor={STOPS.rec} />
          <stop offset="100%" stopColor={STOPS.rec} />
        </linearGradient>
        {/* bottom arc: focus -> shading dip -> recovery (gap edge -> 250 deg) */}
        <linearGradient
          id={id("bot1")}
          gradientUnits="userSpaceOnUse"
          x1="378.73"
          y1="142.75"
          x2="374.09"
          y2="374.09"
        >
          <stop offset="0%" stopColor={STOPS.foc} />
          <stop offset="48.7%" stopColor={STOPS.m90} />
          <stop offset="100%" stopColor={STOPS.m135} />
        </linearGradient>
        <linearGradient
          id={id("bot2")}
          gradientUnits="userSpaceOnUse"
          x1="374.09"
          y1="374.09"
          x2="256"
          y2="423"
        >
          <stop offset="0%" stopColor={STOPS.m135} />
          <stop offset="100%" stopColor={STOPS.m180} />
        </linearGradient>
        <linearGradient
          id={id("bot3")}
          gradientUnits="userSpaceOnUse"
          x1="256"
          y1="423"
          x2="160.21"
          y2="392.8"
        >
          <stop offset="0%" stopColor={STOPS.m180} />
          <stop offset="42.9%" stopColor={STOPS.m195} />
          <stop offset="62.9%" stopColor={STOPS.m202} />
          <stop offset="100%" stopColor={STOPS.rec} />
        </linearGradient>
        <linearGradient
          id={id("bot4")}
          gradientUnits="userSpaceOnUse"
          x1="160.21"
          y1="392.8"
          x2="99.07"
          y2="313.12"
        >
          <stop offset="0%" stopColor={STOPS.rec} />
          <stop offset="100%" stopColor={STOPS.rec} />
        </linearGradient>
        {/* specular hairline: ink-white bloom along the outer edge */}
        <linearGradient
          id={id("spec")}
          gradientUnits="userSpaceOnUse"
          x1="85.51"
          y1="210.32"
          x2="316.37"
          y2="90.14"
        >
          <stop offset="0%" stopColor={STOPS.ink} stopOpacity={0} />
          <stop offset="30.3%" stopColor={STOPS.ink} stopOpacity={0.62} />
          <stop offset="55.2%" stopColor={STOPS.ink} stopOpacity={0.9} />
          <stop offset="70.1%" stopColor={STOPS.ink} stopOpacity={0.88} />
          <stop offset="84.9%" stopColor={STOPS.ink} stopOpacity={0.5} />
          <stop offset="100%" stopColor={STOPS.ink} stopOpacity={0} />
        </linearGradient>
        {/* junction flare: the ribbon blending into the ring */}
        <linearGradient
          id={id("lens")}
          gradientUnits="userSpaceOnUse"
          x1="119.32"
          y1="304.4"
          x2="112.41"
          y2="276.18"
        >
          <stop offset="0%" stopColor={STOPS.rec} stopOpacity={0} />
          <stop offset="30.4%" stopColor={STOPS.rec} stopOpacity={0.95} />
          <stop offset="65.2%" stopColor={STOPS.rec} stopOpacity={0.95} />
          <stop offset="100%" stopColor={STOPS.rec} stopOpacity={0} />
        </linearGradient>
        <filter id={id("blur")} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      {/* draw order: hook under ring; junction flare; ring; dot; specular */}
      <path
        d={HOOK_ARC}
        stroke={STOPS.rec}
        strokeWidth={29}
        strokeLinecap="round"
      />
      <path d={JUNCTION_LENS} fill={"url(#" + id("lens") + ")"} />
      <path
        d={TOP_ARC_1}
        stroke={"url(#" + id("top1") + ")"}
        strokeWidth={29}
        strokeLinecap="round"
      />
      <path
        d={TOP_ARC_2}
        stroke={"url(#" + id("top2") + ")"}
        strokeWidth={29}
        strokeLinecap="round"
      />
      <path
        d={BOT_ARC_1}
        stroke={"url(#" + id("bot1") + ")"}
        strokeWidth={29}
        strokeLinecap="round"
      />
      <path
        d={BOT_ARC_2}
        stroke={"url(#" + id("bot2") + ")"}
        strokeWidth={29}
        strokeLinecap="round"
      />
      <path
        d={BOT_ARC_3}
        stroke={"url(#" + id("bot3") + ")"}
        strokeWidth={29}
        strokeLinecap="round"
      />
      <path
        d={BOT_ARC_4}
        stroke={"url(#" + id("bot4") + ")"}
        strokeWidth={29}
        strokeLinecap="round"
      />
      <circle cx={DOT_CX} cy={DOT_CY} r={DOT_R} fill={STOPS.rec} />
      <path
        d={SPECULAR_ARC}
        stroke={"url(#" + id("spec") + ")"}
        strokeWidth={3}
        strokeLinecap="round"
        filter={"url(#" + id("blur") + ")"}
      />
    </svg>
  );
}
