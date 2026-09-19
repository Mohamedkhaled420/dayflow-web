"use client";

// StringWaves — the sleep card's flowing "string" backdrop.
//
// Five layered sine strings drift horizontally and a handful of
// stars twinkle above them. PERFORMANCE CONTRACT (Phase 8 audit):
// every loop animates TRANSFORM or OPACITY only — compositor-friendly,
// zero main-thread stroke-geometry work (the failure family the
// BackgroundPaths rewrite eliminated). prefers-reduced-motion renders
// the strings fully drawn and static.

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CATEGORY_COLORS } from "@/styles/palette";

const SLEEP = CATEGORY_COLORS.sleep;
const WATER = CATEGORY_COLORS.water;
const PERSONAL = CATEGORY_COLORS.personal;

const VB_W = 640;
const VB_H = 160;

/** Smooth alternating sine-ish path: `periods` full periods across `width`. */
function wavePath(width: number, periods: number, amp: number, mid: number): string {
  const p = width / periods;
  let d = `M0 ${mid.toFixed(1)}`;
  for (let i = 0; i < periods; i++) {
    const dir = i % 2 === 0 ? -1 : 1;
    const x0 = i * p;
    d += ` C ${(x0 + p * 0.36).toFixed(1)} ${(mid + dir * amp).toFixed(1)} ${
      (x0 + p * 0.64).toFixed(1)
    } ${(mid + dir * amp).toFixed(1)} ${((i + 1) * p).toFixed(1)} ${mid.toFixed(1)}`;
  }
  return d;
}

interface Wave {
  d: string;
  /** one full period — shifting by exactly this is a seamless loop */
  period: number;
  dur: number;
  reverse: boolean;
  width: number;
  opacity: number;
  stroke: string;
}

interface Star {
  x: number;
  y: number;
  r: number;
  dur: number;
  delay: number;
  o: number;
}

/** Absolute inset-0 backdrop — the parent card provides overflow-hidden. */
export function StringWaves() {
  const reduced = useReducedMotion() ?? false;

  const waves = useMemo<Wave[]>(() => {
    const build = (
      periods: number,
      amp: number,
      mid: number,
      dur: number,
      reverse: boolean,
      width: number,
      opacity: number,
      stroke: string
    ): Wave => {
      const period = VB_W / periods;
      return {
        // one extra period of runway so the -period loop is seamless
        d: wavePath(VB_W + period, periods + 1, amp, mid),
        period,
        dur,
        reverse,
        width,
        opacity,
        stroke,
      };
    };
    return [
      build(5, 15, 58, 26, false, 1.5, 0.5, SLEEP),
      build(4, 19, 84, 36, true, 1.2, 0.32, PERSONAL),
      build(7, 12, 106, 19, false, 1, 0.4, WATER),
      build(3, 21, 128, 44, true, 1.1, 0.26, SLEEP),
      build(6, 9, 40, 15, false, 0.9, 0.22, PERSONAL),
    ];
  }, []);

  const stars = useMemo<Star[]>(
    () => [
      { x: 86, y: 26, r: 1.6, dur: 4.2, delay: 0, o: 0.55 },
      { x: 210, y: 16, r: 1.1, dur: 5.6, delay: 1.1, o: 0.45 },
      { x: 338, y: 32, r: 1.4, dur: 3.8, delay: 0.6, o: 0.5 },
      { x: 470, y: 20, r: 1, dur: 6.1, delay: 2, o: 0.4 },
      { x: 560, y: 38, r: 1.3, dur: 4.9, delay: 1.5, o: 0.5 },
      { x: 150, y: 46, r: 0.9, dur: 7.2, delay: 0.3, o: 0.35 },
    ],
    []
  );

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {waves.map((w, i) =>
        reduced ? (
          <path
            key={i}
            d={w.d}
            stroke={w.stroke}
            strokeWidth={w.width}
            strokeOpacity={w.opacity}
            strokeLinecap="round"
          />
        ) : (
          <motion.path
            key={i}
            d={w.d}
            stroke={w.stroke}
            strokeWidth={w.width}
            strokeOpacity={w.opacity}
            strokeLinecap="round"
            initial={{ x: w.reverse ? -w.period : 0 }}
            animate={{ x: w.reverse ? 0 : -w.period }}
            transition={{ duration: w.dur, repeat: Infinity, ease: "linear" }}
          />
        )
      )}
      {stars.map((s, i) =>
        reduced ? (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={SLEEP} fillOpacity={s.o} />
        ) : (
          <motion.circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={SLEEP}
            initial={{ opacity: s.o * 0.3 }}
            animate={{ opacity: [s.o * 0.3, s.o, s.o * 0.3] }}
            transition={{ duration: s.dur, repeat: Infinity, ease: "easeInOut", delay: s.delay }}
          />
        )
      )}
    </svg>
  );
}
