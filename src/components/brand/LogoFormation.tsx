"use client";

// ============================================================
// Dayflow AI — LogoFormation (Phase 6.5 / B2 — 2026-09 fix)
// ------------------------------------------------------------
// The mark draws itself ONCE on mount over ~1.8s and the hero
// copy is always visible (entrance tied to the same timeline):
//
//   0%  – 55% : top arc + inner hook draw
//   35% – 90% : bottom arc draws (overlaps the top)
//   85% –100% : sun dot pops in (scale 0 -> 1)
//   90% –100% : specular hairline fades in (opacity 0 -> 0.9)
//   15% – 55% : hero copy fades in and rises
//
// WHY NOT SCROLL-DRIVEN (the Phase 6.5 design): the formation
// used useScroll({ container: document.body }), which silently
// died when Phase 8 (F-2) switched html/body overflow-x from
// hidden to clip — clip deliberately does NOT create a scroll
// container, so body.scrollTop stayed 0 forever and the landing
// rendered as an empty screen of dots, before AND after
// scrolling. Even with correct tracking, a 220vh runway meant
// the first viewport showed no product copy at all. A one-time
// mount animation keeps the brand moment, works without any
// scroll, and has zero idle cost once complete.
//
// prefers-reduced-motion: the fully formed mark + copy render
// statically with no animation at all.
// ============================================================

import { useEffect, useMemo } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { LogoMark } from "./LogoMark";
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

/** Total draw time for the formation (seconds). */
const FORMATION_DURATION = 1.8;
const FORMATION_EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];

export function LogoFormation({
  children,
}: {
  /** Hero content (headline, CTA) rendered beside the mark. */
  children?: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  // One shared timeline: 0 -> 1 over FORMATION_DURATION on mount.
  // (No scroll binding — see the header comment for the history.)
  const progress = useMotionValue(0);

  useEffect(() => {
    if (reduced) return;
    const controls = animate(progress, 1, {
      duration: FORMATION_DURATION,
      ease: FORMATION_EASE,
    });
    return () => controls.stop();
  }, [progress, reduced]);

  const topPath = useTransform(progress, [0, 0.55], [0, 1]);
  const bottomPath = useTransform(progress, [0.35, 0.9], [0, 1]);
  const dotScale = useTransform(progress, [0.85, 1], [0, 1]);
  const specular = useTransform(progress, [0.9, 1], [0, 0.9]);
  const lens = useTransform(progress, [0.5, 0.62], [0, 1]);
  // Copy leads the ring: readable within ~0.5s of load.
  const copyOpacity = useTransform(progress, [0.15, 0.5], [0, 1]);
  const copyY = useTransform(progress, [0.15, 0.5], [24, 0]);

  if (reduced) {
    return (
      <div className="relative">
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-10 px-6 py-16">
          <div style={{ width: "min(64vw, 44vh)" }} aria-label="Dayflow AI mark" role="img">
            <LogoMark />
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-10 px-6 py-16">
        <svg
          viewBox="0 0 512 512"
          fill="none"
          style={{ width: "min(64vw, 44vh)", height: "auto" }}
          role="img"
          aria-label="Dayflow AI mark drawing itself"
        >
          <defs>
            <linearGradient
              id="df-lf-top1"
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
            <linearGradient
              id="df-lf-top2"
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
            <linearGradient
              id="df-lf-bot1"
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
              id="df-lf-bot2"
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
              id="df-lf-bot3"
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
              id="df-lf-bot4"
              gradientUnits="userSpaceOnUse"
              x1="160.21"
              y1="392.8"
              x2="99.07"
              y2="313.12"
            >
              <stop offset="0%" stopColor={STOPS.rec} />
              <stop offset="100%" stopColor={STOPS.rec} />
            </linearGradient>
            <linearGradient
              id="df-lf-spec"
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
            <linearGradient
              id="df-lf-lens"
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
            <filter id="df-lf-blur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.2" />
            </filter>
          </defs>

          {/* 0-55%: top arc + inner hook */}
          <DrawPath d={HOOK_ARC} stroke={STOPS.rec} p={topPath} />
          <motion.path
            d={JUNCTION_LENS}
            fill="url(#df-lf-lens)"
            style={{ opacity: lens }}
          />
          <DrawPath d={TOP_ARC_1} stroke="url(#df-lf-top1)" p={topPath} />
          <DrawPath d={TOP_ARC_2} stroke="url(#df-lf-top2)" p={topPath} />

          {/* 35-90%: bottom arc */}
          <DrawPath d={BOT_ARC_1} stroke="url(#df-lf-bot1)" p={bottomPath} />
          <DrawPath d={BOT_ARC_2} stroke="url(#df-lf-bot2)" p={bottomPath} />
          <DrawPath d={BOT_ARC_3} stroke="url(#df-lf-bot3)" p={bottomPath} />
          <DrawPath d={BOT_ARC_4} stroke="url(#df-lf-bot4)" p={bottomPath} />

          {/* 85-100%: sun dot pops */}
          <motion.circle
            cx={DOT_CX}
            cy={DOT_CY}
            r={DOT_R}
            fill={STOPS.rec}
            style={{ scale: dotScale, transformBox: "fill-box", transformOrigin: "center" }}
          />

          {/* 90-100%: specular hairline */}
          <motion.path
            d={SPECULAR_ARC}
            stroke="url(#df-lf-spec)"
            strokeWidth={3}
            strokeLinecap="round"
            filter="url(#df-lf-blur)"
            style={{ opacity: specular }}
          />
        </svg>

        <motion.div style={{ opacity: copyOpacity, y: copyY }}>{children}</motion.div>
      </div>
    </div>
  );
}

function DrawPath({
  d,
  stroke,
  p,
}: {
  d: string;
  stroke: string;
  p: MotionValue<number>;
}) {
  return (
    <motion.path
      d={d}
      stroke={stroke}
      strokeWidth={29}
      strokeLinecap="round"
      fill="none"
      style={{ pathLength: p }}
    />
  );
}
