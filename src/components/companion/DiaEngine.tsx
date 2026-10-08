"use client";

// ============================================================
// Dayflow — DiaEngine (the headless half of the companion)
// ------------------------------------------------------------
// Dia now lives in the AI chat only (user decision, Oct 2026):
// her 3D body moved into the Coach hero (see DiaStage.tsx).
// But her BRAIN — the mood + progression engines — must keep
// running app-wide: XP accrues from real actions wherever you
// are (logging water on Today, closing rings on Habits, PRs in
// the workout sheet), celebrations fire the moment a ring
// closes, quips get scheduled with cooldowns. This component
// is that brain: mounted once in the AppShell, renders null,
// owns every store-watching effect the floating bubble used to
// own. No three.js, no visuals — cheap to keep alive.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompanionStore } from "@/store/companionStore";
import { useCompanionProgress } from "@/store/companionProgress";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useDayflowData, localDateKey } from "@/lib/viewmodel";
import {
  activityStreak,
  CROWN_STREAK_DAYS,
  levelFromXp,
  STAGE_META,
  stageFromLevel,
} from "@/lib/companion/progress";
import { smartSay, type QuipContext } from "@/lib/companion/quips";
import { goalsForDay } from "@/lib/compute";
import { keyForOffset } from "@/lib/seed";
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

/** Quip auto-dismiss (ms). */
const QUIP_MS = 3600;
/** Minimum gap between mood-comment quips (ms) — no chatterbox. */
const MOOD_QUIP_COOLDOWN_MS = 120_000;
/** Delay before an unlock's dedicated quip (lets the event quip breathe). */
const UNLOCK_QUIP_DELAY_MS = 3800;
/** Celebrate window length (ms). */
const CELEBRATE_MS = 2600;

void POKE_QUIPS; // poke quips are spoken by DiaStage now; kept imported for future use

export function DiaEngine() {
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
  const quip = useCompanionStore((s) => s.quip);
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

  const [mounted, setMounted] = useState(false);
  const [hour, setHour] = useState(() => new Date().getHours());
  const lastMoodQuip = useRef(0);
  const prevMood = useRef<CompanionMood | null>(null);

  // Mount after first paint — the engine needs no heavy chunk, but
  // hydration's first paint stays deterministic this way.
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 300);
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

  // ---- progression UI helpers (store signals — effects may set
  //      these synchronously; React setState would cascade) ----
  const flashXp = useCallback((amount: number) => {
    useCompanionStore.getState().flashXp(amount);
    useCompanionStore.getState().showChip();
  }, []);

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
  //      only schedules when it ends. ----
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
  }, [mounted, level, lastLevel, stage, lastStage, quipCtx]);

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

  // The engine keeps the cosmetics in the progress store fresh for
  // DiaStage to read (unlocks drive the headband/crown in the scene).
  void unlocks;

  return null;
}
