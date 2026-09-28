"use client";

// ============================================================
// Dayflow — DiaCompanion (the living assistant, Phase: Companion)
// ------------------------------------------------------------
// The floating glass bubble that houses the 3D white tiger —
// Dia's body. Mounted once in AppShell (client-only, deferred
// until the app is idle so she never competes with boot).
//
// Presence engine:
//   - mood derived from REAL data (hydration %, goal rings,
//     local hour) + live signals (coach streaming, celebrations)
//   - reacts when a goal ring CLOSES (self-subscribed — no view
//     wiring needed): celebrate + quip + confetti burst
//   - poke → squash-and-stretch in the scene + haptic + quip
//   - speech bubble quips, auto-dismissing, never spammy
// The 3D chunk (three.js ~300KB gz) streams in lazily behind a
// pulsing placeholder; reduced-motion users get a static pose.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCompanionStore } from "@/store/companionStore";
import { useDayflowData } from "@/lib/viewmodel";
import { goalsForDay } from "@/lib/compute";
import { keyForOffset } from "@/lib/seed";
import { triggerHaptic } from "@/lib/haptics";
import { springSoft } from "@/lib/motion";
import { useDockHidden } from "@/hooks/use-dock-visibility";
import { CATEGORY_COLORS, CATEGORY_SWATCHES } from "@/styles/palette";
import {
  deriveMood,
  GOAL_QUIPS,
  pick,
  POKE_QUIPS,
  QUIPS,
  type CompanionMood,
} from "./moods";

// The heavy 3D chunk streams only when the companion actually mounts.
const TigerScene = dynamic(() => import("./TigerScene"), {
  ssr: false,
  loading: () => null,
});

/** Celebration window length (ms) — spin-hop + confetti. */
const CELEBRATE_MS = 2600;
/** Quip auto-dismiss (ms). */
const QUIP_MS = 3600;
/** Minimum gap between mood-comment quips (ms) — no chatterbox. */
const MOOD_QUIP_COOLDOWN_MS = 120_000;
/** Boot deferral — let the app paint and settle first. */
const MOUNT_DELAY_MS = 2200;

const MOOD_RING: Record<CompanionMood, string | null> = {
  idle: null,
  happy: CATEGORY_COLORS.meals,
  thirsty: CATEGORY_COLORS.water,
  sleepy: CATEGORY_COLORS.sleep,
  thinking: CATEGORY_COLORS.personal,
  celebrating: CATEGORY_COLORS.fitness,
};

const MOOD_LABEL: Record<CompanionMood, string> = {
  idle: "Dia is hanging out",
  happy: "Dia is proud of you",
  thirsty: "Dia wants water",
  sleepy: "Dia is sleepy",
  thinking: "Dia is thinking",
  celebrating: "Dia is celebrating you",
};

function ScenePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center" aria-hidden>
      <motion.span
        className="block rounded-full"
        style={{
          width: "46%",
          height: "46%",
          background: "var(--df-chip-fill)",
          border: "0.5px solid var(--df-chip-border)",
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/** One confetti burst (12 palette dots, pure motion). */
function ConfettiBurst({ nonce }: { nonce: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        angle: (i / 12) * Math.PI * 2 + Math.random() * 0.5,
        dist: 42 + Math.random() * 26,
        color: CATEGORY_SWATCHES[i % CATEGORY_SWATCHES.length],
        size: 3.5 + Math.random() * 3,
        delay: Math.random() * 0.06,
      })),
    [nonce]
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {dots.map((d, i) => (
        <motion.span
          key={`${nonce}-${i}`}
          className="absolute left-1/2 top-1/2 block rounded-[2px]"
          style={{ width: d.size, height: d.size, background: d.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos(d.angle) * d.dist,
            y: Math.sin(d.angle) * d.dist - 18,
            opacity: 0,
            scale: 0.4,
            rotate: 140,
          }}
          transition={{ duration: 0.9, delay: d.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

export function DiaCompanion() {
  const reducedMotion = useReducedMotion();
  const dockHidden = useDockHidden();

  // ---- real data for the mood engine ----
  const data = useDayflowData();

  // ---- live signals ----
  const thinking = useCompanionStore((s) => s.thinking);
  const celebrating = useCompanionStore((s) => s.celebrating);
  const celebrateNonce = useCompanionStore((s) => s.celebrateNonce);
  const endCelebration = useCompanionStore((s) => s.endCelebration);
  const pokeNonce = useCompanionStore((s) => s.pokeNonce);
  const quip = useCompanionStore((s) => s.quip);
  const say = useCompanionStore((s) => s.say);
  const doPoke = useCompanionStore((s) => s.poke);
  const dismissQuip = useCompanionStore((s) => s.dismissQuip);

  const [mounted, setMounted] = useState(false);
  const [hour, setHour] = useState(() => new Date().getHours());
  const lastMoodQuip = useRef(0);
  const prevMood = useRef<CompanionMood | null>(null);

  // Defer until the app has gone idle — three.js never competes
  // with first paint, the splash, or the initial sync.
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), MOUNT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Re-check the clock every minute (sleepy window flips at 23:00).
  useEffect(() => {
    const id = window.setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const todayKey = keyForOffset(0);
  const goals = useMemo(
    () => (mounted ? goalsForDay(data, todayKey) : []),
    [mounted, data, todayKey]
  );
  const goalsMet = goals.filter((g) => g.met).length;
  const hydrationPct = useMemo(() => {
    const g = goals.find((x) => x.key === "water");
    return g && g.target > 0 ? g.done / g.target : 0;
  }, [goals]);

  const mood = useMemo(
    () =>
      deriveMood({
        thinking,
        celebrating,
        hydrationPct,
        goalsMet,
        hour,
      }),
    [thinking, celebrating, hydrationPct, goalsMet, hour]
  );

  // ---- goal-ring watcher: celebrate when a ring closes today ----
  const prevGoalsMet = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevGoalsMet.current;
    prevGoalsMet.current = goalsMet;
    if (prev !== null && goalsMet > prev) {
      useCompanionStore.getState().celebrate("goal");
      say(pick(GOAL_QUIPS));
    }
  }, [goalsMet, say]);

  // ---- celebrate window: the store flips the flag; this effect
  // only schedules when it ends (setState inside the timer
  // callback, never synchronously in the effect body). ----
  useEffect(() => {
    if (!celebrating) return;
    const t = window.setTimeout(endCelebration, CELEBRATE_MS);
    return () => window.clearTimeout(t);
  }, [celebrating, endCelebration]);

  // ---- mood-change chatter (cooldown-guarded) ----
  useEffect(() => {
    if (prevMood.current === mood) return;
    const isFirst = prevMood.current === null;
    prevMood.current = mood;
    if (isFirst || mood === "idle" || mood === "thinking") return;
    if (celebrating) return; // celebrate quips come from the caller
    const now = Date.now();
    if (now - lastMoodQuip.current < MOOD_QUIP_COOLDOWN_MS) return;
    lastMoodQuip.current = now;
    say(pick(QUIPS[mood]));
  }, [mood, celebrating, say]);

  // ---- quip auto-dismiss ----
  useEffect(() => {
    if (!quip) return;
    const t = window.setTimeout(() => dismissQuip(quip.id), QUIP_MS);
    return () => window.clearTimeout(t);
  }, [quip, dismissQuip]);

  const onPoke = useCallback(() => {
    triggerHaptic();
    doPoke();
    say(pick(POKE_QUIPS));
  }, [doPoke, say]);

  if (!mounted) return null;

  const ring = MOOD_RING[mood];

  return (
    <motion.div
      className="fixed z-40 right-4 bottom-[calc(100px+env(safe-area-inset-bottom))] lg:right-8 lg:bottom-8"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: 24 }}
      animate={
        dockHidden
          ? reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.4, y: 24 }
          : reducedMotion
            ? { opacity: 1 }
            : { opacity: 1, scale: 1, y: 0 }
      }
      transition={springSoft}
      style={{
        pointerEvents: dockHidden ? "none" : "auto",
        visibility: dockHidden ? "hidden" : "visible",
      }}
    >
      <div className="relative">
        {/* speech bubble */}
        <AnimatePresence>
          {quip && (
            <motion.div
              key={quip.id}
              role="status"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.9 }}
              transition={springSoft}
              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max max-w-[190px] rounded-2xl px-3 py-2"
              style={{
                background: "var(--df-material-bg)",
                border: "0.5px solid var(--df-chip-border)",
                color: "var(--df-text-primary)",
                boxShadow: "0 6px 24px var(--df-panel-shadow)",
                backdropFilter: "blur(14px) saturate(1.4)",
                WebkitBackdropFilter: "blur(14px) saturate(1.4)",
              }}
            >
              <span className="text-[12px] font-medium leading-snug">{quip.text}</span>
              <span
                className="absolute left-1/2 top-full -translate-x-1/2 -mt-[3px] block size-2 rotate-45"
                style={{
                  background: "var(--df-material-bg)",
                  borderRight: "0.5px solid var(--df-chip-border)",
                  borderBottom: "0.5px solid var(--df-chip-border)",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* the bubble */}
        <button
          type="button"
          onClick={onPoke}
          aria-label={`${MOOD_LABEL[mood]} — tap to play`}
          className="df-press group relative block h-[104px] w-[84px] cursor-pointer overflow-hidden rounded-[26px] lg:h-[148px] lg:w-[120px]"
          style={{
            background: "var(--df-material-bg)",
            border: ring
              ? `1.5px solid ${ring}`
              : "0.5px solid var(--df-chip-border)",
            boxShadow: ring
              ? `0 8px 28px var(--df-panel-shadow), 0 0 18px ${ring}26`
              : "0 8px 28px var(--df-panel-shadow)",
            backdropFilter: "blur(16px) saturate(1.5)",
            WebkitBackdropFilter: "blur(16px) saturate(1.5)",
          }}
        >
          <div className="h-full w-full">
            <TigerScene
              mood={mood}
              pokeNonce={pokeNonce}
              reducedMotion={reducedMotion ?? false}
            />
          </div>
          {/* thinking dots */}
          {mood === "thinking" && (
            <div className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block size-1.5 rounded-full"
                  style={{ background: "var(--df-text-secondary)" }}
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </div>
          )}
          {/* Zzz for the sleepy window */}
          {mood === "sleepy" && (
            <motion.span
              className="pointer-events-none absolute right-2 top-2 text-[10px] font-bold"
              style={{ color: "var(--df-text-secondary)" }}
              animate={{ opacity: [0.3, 0.9, 0.3], y: [0, -3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity }}
              aria-hidden
            >
              z z
            </motion.span>
          )}
        </button>

        {/* confetti rides outside the clipped bubble */}
        {celebrating && !reducedMotion && (
          <ConfettiBurst key={celebrateNonce} nonce={celebrateNonce} />
        )}
      </div>
    </motion.div>
  );
}
