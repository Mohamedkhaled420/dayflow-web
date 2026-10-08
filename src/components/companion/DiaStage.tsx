"use client";

// ============================================================
// Dayflow — DiaStage (the visual half of the companion)
// ------------------------------------------------------------
// Dia's home is the AI chat now (user decision, Oct 2026): a
// glass terrarium inside the Coach hero where the 3D white
// tiger lives, sized by her parent. Everything the floating
// bubble could do is here, restaged for the chat:
//   - mood ring around the glass + thinking dots while the
//     coach streams + Zzz in the sleepy window
//   - poke → squash-and-stretch in the scene + haptic + quip
//   - speech-bubble quips (LLM personality) above the stage
//   - level chip with progress + LEVEL UP flash + XP floaters
//   - confetti when a ring closes (engine-driven, app-wide)
// Reduced-motion users get a static pose. The three.js chunk
// still streams lazily behind a pulsing placeholder.
// ============================================================

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCompanionStore } from "@/store/companionStore";
import { useCompanionProgress } from "@/store/companionProgress";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useDayflowData, localDateKey } from "@/lib/viewmodel";
import {
  activityStreak,
  levelFromXp,
  levelProgress,
  STAGE_META,
  stageFromLevel,
} from "@/lib/companion/progress";
import { goalsForDay } from "@/lib/compute";
import { keyForOffset } from "@/lib/seed";
import { triggerHaptic } from "@/lib/haptics";
import { springSoft } from "@/lib/motion";
import { CATEGORY_COLORS, CATEGORY_SWATCHES } from "@/styles/palette";
import { deriveMood, POKE_QUIPS, type CompanionMood } from "./moods";
import { smartSay } from "@/lib/companion/quips";

// The heavy 3D chunk streams only when the stage actually mounts.
const TigerScene = dynamic(() => import("./TigerScene"), {
  ssr: false,
  loading: () => null,
});

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

export function DiaStage() {
  const reducedMotion = useReducedMotion();

  // ---- real data for the mood (same derivation as the engine) ----
  const data = useDayflowData();
  const journalEntries = useDayflowStore((s) => s.journalEntries);

  // ---- live signals ----
  const thinking = useCompanionStore((s) => s.thinking);
  const celebrating = useCompanionStore((s) => s.celebrating);
  const celebrateNonce = useCompanionStore((s) => s.celebrateNonce);
  const pokeNonce = useCompanionStore((s) => s.pokeNonce);
  const quip = useCompanionStore((s) => s.quip);
  const doPoke = useCompanionStore((s) => s.poke);
  const xpToast = useCompanionStore((s) => s.xpToast);
  const levelFlash = useCompanionStore((s) => s.levelFlash);
  const chip = useCompanionStore((s) => s.chip);

  // ---- progression ----
  const xp = useCompanionProgress((s) => s.xp);
  const unlocks = useCompanionProgress((s) => s.unlocks);

  const level = useMemo(() => levelFromXp(xp), [xp]);
  const stage = useMemo(() => stageFromLevel(level), [level]);
  const progress = useMemo(() => levelProgress(xp), [xp]);

  const [hour] = useState(() => new Date().getHours());

  const todayKey = keyForOffset(0);
  const goals = useMemo(() => goalsForDay(data, todayKey), [data, todayKey]);
  const goalsMet = goals.filter((g) => g.met).length;
  const hydrationPct = useMemo(() => {
    const g = goals.find((x) => x.key === "water");
    return g && g.target > 0 ? g.done / g.target : 0;
  }, [goals]);

  const journalDates = useMemo(
    () => journalEntries.map((j) => localDateKey(j.created_at)),
    [journalEntries]
  );

  const streak = useMemo(
    () => activityStreak({ events: data.events, water: data.water, journalDates }, todayKey),
    [data.events, data.water, journalDates, todayKey]
  );

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

  const onPoke = () => {
    triggerHaptic();
    doPoke();
    smartSay("poke", { mood, hydrationPct, goalsMet, hour, streak, level, stage }, POKE_QUIPS);
  };

  const ring = MOOD_RING[mood];

  return (
    <div className="relative flex h-full w-full flex-col items-center">
      {/* speech bubble — quips float above the stage */}
      <AnimatePresence>
        {quip && (
          <motion.div
            key={quip.id}
            role="status"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.9 }}
            transition={springSoft}
            className="absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-[210px] -translate-x-1/2 rounded-2xl px-3.5 py-2"
            style={{
              background: "var(--df-card-fill)",
              border: "0.5px solid var(--df-chip-border)",
              color: "var(--df-text-primary)",
              boxShadow: "0 6px 24px var(--df-panel-shadow)",
              backdropFilter: "blur(14px) saturate(1.4)",
              WebkitBackdropFilter: "blur(14px) saturate(1.4)",
            }}
          >
            <span className="text-[12px] font-medium leading-snug">{quip.text}</span>
            <span
              className="absolute left-1/2 top-full -mt-[3px] block size-2 -translate-x-1/2 rotate-45"
              style={{
                background: "var(--df-card-fill)",
                borderRight: "0.5px solid var(--df-chip-border)",
                borderBottom: "0.5px solid var(--df-chip-border)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* the terrarium */}
      <button
        type="button"
        onClick={onPoke}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPoke();
          }
        }}
        aria-label={`${MOOD_LABEL[mood]} — tap to play with Dia`}
        className="df-press group relative block aspect-square w-full flex-1 overflow-hidden rounded-full"
        style={{
          background: "var(--df-card-fill)",
          border: ring ? `1.5px solid ${ring}` : "0.5px solid var(--df-chip-border)",
          boxShadow: ring
            ? `0 8px 28px var(--df-panel-shadow), 0 0 18px ${ring}26`
            : "0 8px 28px var(--df-panel-shadow)",
          backdropFilter: "blur(16px) saturate(1.5)",
          WebkitBackdropFilter: "blur(16px) saturate(1.5)",
          cursor: "pointer",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <div className="h-full w-full">
          <TigerScene
            mood={mood}
            pokeNonce={pokeNonce}
            reducedMotion={reducedMotion ?? false}
            cosmetics={unlocks}
            stage={stage}
          />
        </div>

        {/* thinking dots */}
        {mood === "thinking" && (
          <div className="pointer-events-none absolute left-1/2 top-[12%] flex -translate-x-1/2 gap-1" aria-hidden>
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
            className="pointer-events-none absolute right-[14%] top-[10%] text-[10px] font-bold"
            style={{ color: "var(--df-text-secondary)" }}
            animate={{ opacity: [0.3, 0.9, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 2.4, repeat: Infinity }}
            aria-hidden
          >
            z z
          </motion.span>
        )}

        {/* level-up flash */}
        <AnimatePresence>
          {levelFlash && (
            <motion.div
              key={levelFlash.level}
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full"
              style={{
                background: "var(--df-card-fill)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={springSoft}
            >
              <span
                className="text-[13px] font-extrabold tracking-wide"
                style={{ color: "var(--df-text-primary)" }}
              >
                {levelFlash.evolved ? "EVOLVED" : "LEVEL UP"}
              </span>
              <span
                className="text-[11px] font-semibold"
                style={{ color: "var(--df-text-secondary)" }}
              >
                Lv {levelFlash.level} · {levelFlash.stage}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* XP floater */}
      <AnimatePresence>
        {xpToast && (
          <motion.span
            key={xpToast.id}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
            style={{
              background: "var(--df-card-fill)",
              border: "0.5px solid var(--df-chip-border)",
              color: "var(--df-on-pastel-ink)",
              boxShadow: "0 4px 14px var(--df-panel-shadow)",
            }}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: -18, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -34, scale: 0.9 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            +{xpToast.amount} XP
          </motion.span>
        )}
      </AnimatePresence>

      {/* level chip — stage, level, progress to next */}
      <AnimatePresence>
        {chip && (
          <motion.div
            key="level-chip"
            className="absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-[3px]"
            style={{
              background: "var(--df-card-fill)",
              border: "0.5px solid var(--df-chip-border)",
              boxShadow: "0 4px 14px var(--df-panel-shadow)",
              backdropFilter: "blur(12px) saturate(1.4)",
              WebkitBackdropFilter: "blur(12px) saturate(1.4)",
            }}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.9 }}
            transition={springSoft}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="whitespace-nowrap text-[10px] font-bold"
                style={{ color: "var(--df-text-primary)" }}
              >
                {STAGE_META[stage].name} · Lv {level}
              </span>
              <span
                className="block h-[4px] w-9 overflow-hidden rounded-full"
                style={{ background: "var(--df-chip-fill)" }}
                aria-hidden
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.round(progress.pct * 100)}%`,
                    background: CATEGORY_COLORS.fitness,
                  }}
                />
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* confetti rides outside the clipped stage */}
      {celebrating && !reducedMotion && (
        <ConfettiBurst key={celebrateNonce} nonce={celebrateNonce} />
      )}
    </div>
  );
}
