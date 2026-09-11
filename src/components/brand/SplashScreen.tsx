"use client";

// ============================================================
// Dayflow AI — SplashScreen (Phase 6.5 / B3)
// ------------------------------------------------------------
// App-boot surface: the static formed mark paints immediately;
// only if hydration is STILL running after 1.2s does it
// crossfade to the LogoLoop (lg). Mounted by AppShell while the
// local store rehydrates — never a fullscreen wall beyond the
// app panel itself.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { LogoLoop } from "./LogoLoop";
import { LogoMark } from "./LogoMark";

export function SplashScreen() {
  const [phase, setPhase] = useState<"static" | "loop">("static");

  useEffect(() => {
    const t = setTimeout(() => setPhase("loop"), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-6 p-8"
      role="status"
      aria-label="Loading Dayflow"
    >
      <div className="relative grid place-items-center">
        <AnimatePresence mode="wait" initial={false}>
          {phase === "static" ? (
            <motion.div
              key="mark"
              className="grid place-items-center"
              exit={{ opacity: 0, transition: { duration: 0.45 } }}
            >
              <LogoMark size={112} />
            </motion.div>
          ) : (
            <motion.div
              key="loop"
              className="grid place-items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.45 } }}
            >
              <LogoLoop size="lg" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="text-center">
        <p
          className="text-[15px] font-semibold leading-none"
          style={{ color: "var(--df-text-primary)" }}
        >
          Dayflow
        </p>
        <p
          className="mt-1.5 text-[11px] leading-none"
          style={{ color: "var(--df-text-muted)" }}
        >
          {phase === "static" ? "Preparing your day…" : "Still loading your local data…"}
        </p>
      </div>
    </div>
  );
}
