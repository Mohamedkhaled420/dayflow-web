"use client";

// ============================================================
// Dayflow AI — Background Paths (Phase 8 — 2026-09 perf fix)
// ------------------------------------------------------------
// Decorative flowing-path backdrop for the auth surface,
// layered behind the GlassPanel (absolute inset-0,
// pointer-events-none, aria-hidden). Strokes ride currentColor
// at LOW opacity: --color-ink (near-white) on the §9.1 dark
// surface, so the lines read as faint light filaments.
//
// PERF: the original port animated 72 paths with infinite
// pathLength/pathOffset loops — stroke-geometry animations
// recalc on the main thread every frame and made the auth
// page jank badly (the same failure family as the historical
// screenshot-capture stall). The paths now draw in ONCE
// (staggered, ~2.5s total, no repeat) and settle statically:
// the visual is preserved, the idle cost is zero.
// prefers-reduced-motion renders the paths fully drawn, static.
// ============================================================

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

interface FloatingPathsProps {
  position: number;
  reduced: boolean;
}

function FloatingPaths({ position, reduced }: FloatingPathsProps) {
  const paths = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
          380 - i * 5 * position
        } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
          152 - i * 5 * position
        } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
          684 - i * 5 * position
        } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
        width: 0.5 + i * 0.03,
      })),
    [position]
  );

  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 696 316"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {reduced ? (
        paths.map((path) => (
          <path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.22}
          />
        ))
      ) : (
        <motion.g
          initial={{ opacity: 0, transform: "translateY(10px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          {paths.map((path) => (
            <path
              key={path.id}
              d={path.d}
              stroke="currentColor"
              strokeWidth={path.width}
              strokeOpacity={0.1 + path.id * 0.03}
            />
          ))}
        </motion.g>
      )}
    </svg>
  );
}

/**
 * Auth-surface backdrop: the two path families draw in once on
 * mount, then rest. No infinite animations (auth perf budget).
 */
export function BackgroundPaths() {
  const reduced = useReducedMotion() ?? false;
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ color: "var(--color-ink)" }}
      aria-hidden="true"
    >
      <FloatingPaths position={1} reduced={reduced} />
      <FloatingPaths position={-1} reduced={reduced} />
    </div>
  );
}
