"use client";

// ============================================================
// Dayflow AI — Background Paths (Phase 8)
// ------------------------------------------------------------
// Ported from the BackgroundPaths reference component to
// motion/react + Dayflow token discipline (dayflow/no-raw-colors:
// stroke color rides currentColor, the wrapper color comes from
// the PRD §9.1 token layer). Mounted ONLY on /auth — the
// unauthenticated doorway. The authenticated app keeps its
// performance budget: no infinite path/blur animations anywhere
// past login (the historical screenshot-capture stall).
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
      {paths.map((path) =>
        reduced ? (
          <path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.22}
          />
        ) : (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        )
      )}
    </svg>
  );
}

/**
 * Decorative flowing-path backdrop for the auth surface. Layer
 * it behind the GlassPanel (absolute inset-0, pointer-events
 * none, aria-hidden) — it carries no content. Strokes ride
 * currentColor at LOW opacity: --color-ink (near-white) on the
 * §9.1 dark surface, so the lines read as faint light filaments
 * (a dark stroke color would vanish against #0e1117).
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
