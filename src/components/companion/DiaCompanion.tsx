"use client";

// ============================================================
// Dayflow — DiaCompanion (the living assistant, Phase: Progress)
// ------------------------------------------------------------
// The floating glass bubble that houses the 3D white tiger —
// Dia's body. Mounted once in AppShell (client-only, deferred
// until the app is idle so she never competes with boot).
//
// Presence engine:
//   - mood derived from REAL data (hydration %, goal rings,
//     local hour) + live signals (coach streaming, celebrations)
//   - reacts when a goal ring CLOSES (self-subscribed — no view
//     wiring needed): celebrate + quip + confetti burst + XP
//   - poke → squash-and-stretch in the scene + haptic + quip
//   - speech bubble quips, auto-dismissing, never spammy
//   - LLM personality: static line instantly, upgraded in-place
//     by /api/ai/quip when it wins a 2.4s race (see quips.ts)
//
// Progression engine (companionProgress store):
//   - XP from real actions only — first-of-day logs, ring
//     closures, PRs, streak milestones. Poking earns nothing.
//   - Levels → evolution stages (Cub → Hunter → Legend) drive a
//     stage aura in the scene and a level chip in the bubble.
//   - Event-gated cosmetics: headband (first PR), crown (30-day
//     activity streak).
//
// Drag-to-move:
//   - pointer-drag the bubble anywhere on screen (clamped, the
//     position persists across reloads); a sub-8px press is still
//     a poke. While dragging she lifts, tilts with velocity and
//     tracks your cursor.
//
// The 3D chunk (three.js ~300KB gz) streams in lazily behind a
// pulsing placeholder; reduced-motion users get a static pose.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCompanionStore } from "@/store/companionStore";
import { useCompanionProgress } from "@/store/companionProgress";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useDayflowData, localDateKey } from "@/lib/viewmodel";
import {
  activityStreak,
  CROWN_STREAK_DAYS,
  levelFromXp,
  levelProgress,
  STAGE_META,
  stageFromLevel,
} from "@/lib/companion/progress";
import { smartSay, type QuipContext } from "@/lib/companion/quips";
import { goalsForDay } from "@/lib/compute";
import { keyForOffset } from "@/lib/seed";
import { triggerHaptic } from "@/lib/haptics";
import { springSoft } from "@/lib/motion";
import { useDockHidden } from "@/hooks/use-dock-visibility";
import { CATEGORY_COLORS, CATEGORY_SWATCHES } from "@/styles/palette";
import {
  CROWN_QUIPS,
  deriveMood,
  EVOLVE_QUIPS,
  GOAL_QUIPS,
  HEADBAND_QUIPS,
  LEVEL_QUIPS,
  POKE_QUIPS,
  QUIPS,
  STREAK_QUIPS,
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
/** A press must wander this far (px) before it counts as a drag. */
const DRAG_THRESHOLD_PX = 8;
/** Viewport margin (px) the bubble may never cross while dragged. */
const DRAG_MARGIN_PX = 8;
/** Where the dragged position persists. */
const POS_STORAGE_KEY = "dayflow-companion-pos-v1";
/** Delay before re-clamping the restored position — the live rect
 *  is only trustworthy once the entrance spring has settled. */
const ENTRANCE_SETTLE_MS = 1200;
/** Delay before an unlock's dedicated quip (lets the event quip breathe). */
const UNLOCK_QUIP_DELAY_MS = 3800;

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

/** The persisted drag offset, read once before her first paint so
 *  she materialises exactly where you left her (no jump). */
function readStoredPos(): { x: number; y: number } {
  try {
    const raw = window.localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return { x: 0, y: 0 };
    const { x, y } = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
  } catch {
    // unreadable / private mode — stay anchored
  }
  return { x: 0, y: 0 };
}

export function DiaCompanion() {
  const reducedMotion = useReducedMotion();
  const dockHidden = useDockHidden();

  // ---- real data for the mood + progression engines ----
  const data = useDayflowData();
  const journalEntries = useDayflowStore((s) => s.journalEntries);

  // ---- live signals ----
  const thinking = useCompanionStore((s) => s.thinking);
  const celebrating = useCompanionStore((s) => s.celebrating);
  const celebrateNonce = useCompanionStore((s) => s.celebrateNonce);
  const celebrateReason = useCompanionStore((s) => s.celebrateReason);
  const celebrateDetail = useCompanionStore((s) => s.celebrateDetail);
  const endCelebration = useCompanionStore((s) => s.endCelebration);
  const pokeNonce = useCompanionStore((s) => s.pokeNonce);
  const quip = useCompanionStore((s) => s.quip);
  const doPoke = useCompanionStore((s) => s.poke);
  const xpToast = useCompanionStore((s) => s.xpToast);
  const levelFlash = useCompanionStore((s) => s.levelFlash);
  const chip = useCompanionStore((s) => s.chip);

  // ---- progression ----
  const xp = useCompanionProgress((s) => s.xp);
  const unlocks = useCompanionProgress((s) => s.unlocks);
  const syncDaily = useCompanionProgress((s) => s.syncDaily);
  const awardDaily = useCompanionProgress((s) => s.awardDaily);
  const awardGoal = useCompanionProgress((s) => s.awardGoal);
  const notePR = useCompanionProgress((s) => s.notePR);
  const noteStreak = useCompanionProgress((s) => s.noteStreak);

  const level = useMemo(() => levelFromXp(xp), [xp]);
  const stage = useMemo(() => stageFromLevel(level), [level]);
  const progress = useMemo(() => levelProgress(xp), [xp]);

  const [mounted, setMounted] = useState(false);
  const [hour, setHour] = useState(() => new Date().getHours());
  const lastMoodQuip = useRef(0);
  const prevMood = useRef<CompanionMood | null>(null);

  // ---- drag-to-move ----
  /** Ref on the drag layer (the element that CARRIES the translate
   *  transform). Its rect is the VISUAL position — the root's rect
   *  would forever read the anchored layout box. */
  const dragLayerRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() =>
    typeof window === "undefined" ? { x: 0, y: 0 } : readStoredPos()
  );
  const posRef = useRef(pos);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    moved: boolean;
    lastDx: number;
    /** Root rect captured at drag start — the anchor all clamping
     *  is computed against (transform-only motion keeps it valid). */
    rect: { left: number; top: number; width: number; height: number } | null;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // ---- progression UI helpers (store signals — effects may set
  //      these synchronously; React setState would cascade) ----
  const flashXp = useCallback((amount: number) => {
    useCompanionStore.getState().flashXp(amount);
    useCompanionStore.getState().showChip();
  }, []);

  const showChip = useCallback((ms?: number) => {
    useCompanionStore.getState().showChip(ms);
  }, []);

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

  const quipCtx = useMemo<QuipContext>(
    () => ({ mood, hydrationPct, goalsMet, hour, streak, level, stage }),
    [mood, hydrationPct, goalsMet, hour, streak, level, stage]
  );

  // ---- goal-ring watcher: celebrate + XP when a ring closes ----
  const prevGoalsMet = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevGoalsMet.current;
    prevGoalsMet.current = goalsMet;
    if (prev === null || goalsMet <= prev) return;
    useCompanionStore.getState().celebrate("goal");
    awardGoal();
    flashXp(8);
    smartSay("goal", quipCtx, GOAL_QUIPS);
  }, [goalsMet, quipCtx, awardGoal, flashXp]);

  // ---- celebrate window: the store flips the flag; this effect
  // only schedules when it ends (setState inside the timer
  // callback, never synchronously in the effect body). ----
  useEffect(() => {
    if (!celebrating) return;
    const t = window.setTimeout(endCelebration, CELEBRATE_MS);
    return () => window.clearTimeout(t);
  }, [celebrating, endCelebration]);

  // ---- mood-change chatter (cooldown-guarded, LLM-flavored) ----
  useEffect(() => {
    if (prevMood.current === mood) return;
    const isFirst = prevMood.current === null;
    prevMood.current = mood;
    if (isFirst || mood === "idle" || mood === "thinking") return;
    if (celebrating) return; // celebrate quips come from the caller
    const now = Date.now();
    if (now - lastMoodQuip.current < MOOD_QUIP_COOLDOWN_MS) return;
    lastMoodQuip.current = now;
    smartSay("mood", quipCtx, QUIPS[mood]);
  }, [mood, celebrating, quipCtx]);

  // ---- quip auto-dismiss ----
  const dismissQuip = useCompanionStore((s) => s.dismissQuip);
  useEffect(() => {
    if (!quip) return;
    const t = window.setTimeout(() => dismissQuip(quip.id), QUIP_MS);
    return () => window.clearTimeout(t);
  }, [quip, dismissQuip]);

  // ---- daily XP: reward the first logs of each kind today ----
  const todayCounts = useMemo(
    () => ({
      water: data.water.some((w) => w.dateKey === todayKey && w.ml > 0) ? 1 : 0,
      meal: data.events.filter((e) => e.dateKey === todayKey && e.categoryId === "meals")
        .length,
      journal: journalDates.filter((d) => d === todayKey).length,
      sleep: data.events.some((e) => e.dateKey === todayKey && e.categoryId === "sleep")
        ? 1
        : 0,
      workout: data.events.filter(
        (e) => e.dateKey === todayKey && e.categoryId === "fitness"
      ).length,
    }),
    [data, journalDates, todayKey]
  );

  useEffect(() => {
    if (!mounted) return;
    syncDaily(todayKey);
    const gained = awardDaily(todayCounts);
    if (gained > 0) flashXp(gained);
  }, [mounted, todayCounts, todayKey, syncDaily, awardDaily, flashXp]);

  // ---- PR watcher: XP, headband unlock, personality ----
  const prevCelebNonce = useRef(0);
  useEffect(() => {
    if (celebrateNonce === prevCelebNonce.current) return;
    prevCelebNonce.current = celebrateNonce;
    if (celebrateReason !== "pr") return;
    const { unlockedHeadband } = notePR();
    flashXp(25);
    // WorkoutSheet already said the specific "New PR — X!" line;
    // the LLM line replaces it only when it wins the race.
    smartSay(
      "pr",
      { ...quipCtx, detail: celebrateDetail ?? undefined },
      QUIPS.celebrating,
      { instant: false }
    );
    if (unlockedHeadband) {
      window.setTimeout(() => {
        smartSay("pr", { ...quipCtx, detail: "first PR ever — headband unlocked" }, HEADBAND_QUIPS);
      }, UNLOCK_QUIP_DELAY_MS);
    }
  }, [celebrateNonce, celebrateReason, celebrateDetail, quipCtx, notePR, flashXp]);

  // ---- streak watcher: milestone XP + the crown at 30 days ----
  useEffect(() => {
    if (!mounted) return;
    const res = noteStreak(streak);
    if (res.milestone) {
      useCompanionStore.getState().celebrate("streak");
      flashXp(res.xpGained);
      smartSay("streak", { ...quipCtx, detail: `${res.milestone}-day streak` }, STREAK_QUIPS);
    }
    if (res.unlockedCrown) {
      window.setTimeout(() => {
        smartSay(
          "streak",
          { ...quipCtx, detail: `${CROWN_STREAK_DAYS}-day streak — crown unlocked` },
          CROWN_QUIPS
        );
      }, UNLOCK_QUIP_DELAY_MS);
    }
  }, [streak, mounted, noteStreak, quipCtx, flashXp]);

  // ---- level-up / evolution fanfare ----
  const lastLevel = useCompanionProgress((s) => s.lastLevel);
  const lastStage = useCompanionProgress((s) => s.lastStage);
  useEffect(() => {
    if (!mounted) return;
    if (level <= lastLevel) return;
    const evolved = stage !== lastStage;
    useCompanionProgress.setState({ lastLevel: level, lastStage: stage });
    useCompanionStore.getState().celebrate(evolved ? "evolve" : "level");
    useCompanionStore
      .getState()
      .flashLevel(level, STAGE_META[stage].name, evolved);
    useCompanionStore.getState().showChip(5000);
    smartSay(
      evolved ? "evolve" : "level",
      { ...quipCtx, detail: evolved ? `evolved to ${STAGE_META[stage].name}` : `level ${level}` },
      evolved ? EVOLVE_QUIPS : LEVEL_QUIPS
    );
  }, [mounted, level, lastLevel, stage, lastStage, quipCtx, showChip]);

  // ---- XP toast auto-dismiss ----
  useEffect(() => {
    if (!xpToast) return;
    const t = window.setTimeout(
      () => useCompanionStore.getState().clearXpToast(xpToast.id),
      1600
    );
    return () => window.clearTimeout(t);
  }, [xpToast]);

  // ---- level flash auto-dismiss ----
  useEffect(() => {
    if (!levelFlash) return;
    const t = window.setTimeout(
      () => useCompanionStore.getState().clearLevelFlash(levelFlash.id),
      3400
    );
    return () => window.clearTimeout(t);
  }, [levelFlash]);

  // ---- level chip auto-dismiss ----
  useEffect(() => {
    if (!chip) return;
    const t = window.setTimeout(() => useCompanionStore.getState().hideChip(), chip.ms);
    return () => window.clearTimeout(t);
  }, [chip]);

  // ---- drag-to-move: clamp helpers ----
  const applyPos = useCallback((p: { x: number; y: number }) => {
    posRef.current = p;
    setPos(p);
  }, []);

  /** Clamp an offset so the bubble stays on screen, measured
   *  against a rect captured when the DOM was settled at `at`. */
  const clampAgainst = useCallback(
    (
      rect: { left: number; top: number; width: number; height: number },
      at: { x: number; y: number },
      x: number,
      y: number
    ) => {
      // Moving from `at` to (x, y) shifts the rect by exactly this.
      const dx = x - at.x;
      const dy = y - at.y;
      const left = rect.left + dx;
      const top = rect.top + dy;
      let nx = x;
      let ny = y;
      const M = DRAG_MARGIN_PX;
      if (left + rect.width > window.innerWidth - M)
        nx -= left + rect.width - (window.innerWidth - M);
      if (left < M) nx += M - left;
      if (top + rect.height > window.innerHeight - M)
        ny -= top + rect.height - (window.innerHeight - M);
      if (top < M) ny += M - top;
      return { x: Math.round(nx), y: Math.round(ny) };
    },
    []
  );

  const clampOffset = useCallback(
    (x: number, y: number) => {
      const el = dragLayerRef.current;
      if (!el || typeof window === "undefined") return { x, y };
      // Callers use this only when the DOM has settled, so the rect
      // matches posRef exactly.
      return clampAgainst(el.getBoundingClientRect(), posRef.current, x, y);
    },
    [clampAgainst]
  );

  // Re-clamp the restored position once she has finished entering
  // (mid-animation the rect is scaled/offset — useless as a basis).
  // A no-op when the stored position is still valid.
  useEffect(() => {
    if (!mounted) return;
    const t = window.setTimeout(() => {
      requestAnimationFrame(() =>
        applyPos(clampOffset(posRef.current.x, posRef.current.y))
      );
    }, ENTRANCE_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [mounted, applyPos, clampOffset]);

  // Re-clamp when the viewport changes.
  useEffect(() => {
    const onResize = () =>
      applyPos(clampOffset(posRef.current.x, posRef.current.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyPos, clampOffset]);

  const onPoke = useCallback(() => {
    triggerHaptic();
    doPoke();
    showChip();
    smartSay("poke", quipCtx, POKE_QUIPS);
  }, [doPoke, showChip, quipCtx]);

  // ---- pointer drag: a press becomes a drag past the threshold;
  //      anything shorter stays a poke (and keyboard still pokes) ----
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = dragLayerRef.current?.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: posRef.current.x,
      baseY: posRef.current.y,
      moved: false,
      lastDx: 0,
      rect: r
        ? { left: r.left, top: r.top, width: r.width, height: r.height }
        : null,
    };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        d.moved = true;
        setDragging(true);
        triggerHaptic();
      }
      // Clamp against the drag-start rect — immune to the render
      // lag between state updates and DOM transforms.
      const target = d.rect
        ? clampAgainst(d.rect, { x: d.baseX, y: d.baseY }, d.baseX + dx, d.baseY + dy)
        : { x: d.baseX + dx, y: d.baseY + dy };
      applyPos(target);
      // Velocity tilt — written imperatively so the drag never re-renders.
      if (tiltRef.current && !reducedMotion) {
        const tilt = Math.max(-10, Math.min(10, (dx - d.lastDx) * 0.9));
        d.lastDx = dx;
        tiltRef.current.style.transform = `rotate(${tilt.toFixed(1)}deg)`;
      }
    },
    [applyPos, clampAgainst, reducedMotion]
  );

  const endDrag = useCallback(
    (wasTap: boolean) => {
      setDragging(false);
      if (tiltRef.current) tiltRef.current.style.transform = "rotate(0deg)";
      if (wasTap) {
        onPoke();
        return;
      }
      try {
        window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(posRef.current));
      } catch {
        // private mode etc. — position just won't persist
      }
    },
    [onPoke]
  );

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    endDrag(Boolean(d && !d.moved));
  }, [endDrag]);

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
      {/* drag layer (persistent offset) → tilt layer (velocity juice) */}
      <div ref={dragLayerRef} style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <div
          ref={tiltRef}
          style={{
            transition: dragging ? "none" : "transform 0.35s cubic-bezier(.2,.8,.3,1.2)",
            willChange: "transform",
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
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPoke();
                }
              }}
              aria-label={`${MOOD_LABEL[mood]} — tap to play, drag to move`}
              className="df-press group relative block h-[104px] w-[84px] overflow-hidden rounded-[26px] lg:h-[148px] lg:w-[120px]"
              style={{
                background: "var(--df-material-bg)",
                border: ring
                  ? `1.5px solid ${ring}`
                  : "0.5px solid var(--df-chip-border)",
                boxShadow: dragging
                  ? "0 18px 44px var(--df-panel-shadow)"
                  : ring
                    ? `0 8px 28px var(--df-panel-shadow), 0 0 18px ${ring}26`
                    : "0 8px 28px var(--df-panel-shadow)",
                backdropFilter: "blur(16px) saturate(1.5)",
                WebkitBackdropFilter: "blur(16px) saturate(1.5)",
                touchAction: "none",
                cursor: dragging ? "grabbing" : "grab",
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
              {/* level-up flash */}
              <AnimatePresence>
                {levelFlash && (
                  <motion.div
                    key={levelFlash.level}
                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[26px]"
                    style={{
                      background: "var(--df-material-bg)",
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
                  className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                  style={{
                    background: "var(--df-material-bg)",
                    border: "0.5px solid var(--df-chip-border)",
                    color: CATEGORY_COLORS.fitness,
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
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-[3px]"
                  style={{
                    background: "var(--df-material-bg)",
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
                      className="text-[10px] font-bold whitespace-nowrap"
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

            {/* confetti rides outside the clipped bubble */}
            {celebrating && !reducedMotion && (
              <ConfettiBurst key={celebrateNonce} nonce={celebrateNonce} />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
