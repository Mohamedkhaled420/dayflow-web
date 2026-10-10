// ============================================================
// Focus Triad — companion progress store (Dia's XP, unlocks, memory)
// ------------------------------------------------------------
// Persisted to localStorage (zustand persist) — companion
// progression is a PRESENCE-layer concern, not health data, so it
// deliberately stays out of Supabase: no schema, no sync, no
// privacy surface. Everything here derives from real actions the
// app already records; the store only remembers what has been
// REWARDED so logs are never double-counted (edits/deletes refund
// nothing — decreasing counters simply stop earning).
//
// The one nuance is the daily counters snapshot: it stores how
// many of each log kind were already rewarded TODAY. On date
// rollover the snapshot resets (no awards), so every new day can
// earn its first-of-day XP again.
// ============================================================

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  levelFromXp,
  stageFromLevel,
  STREAK_MILESTONES,
  type CompanionStage,
} from "@/lib/companion/progress";

/** What has already been rewarded today (per log kind). */
export interface DailyCounters {
  dateKey: string;
  water: number;
  meal: number;
  journal: number;
  sleep: number;
  workout: number;
}

export interface CompanionUnlockFlags {
  headband: boolean;
  crown: boolean;
}

interface CompanionProgressState {
  /** Lifetime XP. */
  xp: number;
  /** Highest level already celebrated (avoids re-fanfare on reload). */
  lastLevel: number;
  /** Highest stage already celebrated. */
  lastStage: CompanionStage;
  /** Total PRs ever detected. */
  prCount: number;
  /** Highest streak milestone already rewarded (0 = none). */
  streakMilestoneClaimed: number;
  unlocks: CompanionUnlockFlags;
  daily: DailyCounters;

  /** Reset the daily snapshot when the date rolls over. */
  syncDaily: (dateKey: string) => void;
  /**
   * Reward any NEW logs vs today's snapshot. Returns the XP gained
   * (0 when nothing new). Decreases are recorded but pay nothing.
   */
  awardDaily: (today: Omit<DailyCounters, "dateKey">) => number;
  /** Reward a goal ring closing. Returns XP gained. */
  awardGoal: () => number;
  /**
   * Record a PR (called once per PR). Returns XP gained and whether
   * the headband was unlocked BY THIS CALL.
   */
  notePR: () => { xpGained: number; unlockedHeadband: boolean };
  /**
   * Record the current activity streak. Returns XP gained for a
   * newly-hit milestone and whether the crown was unlocked BY THIS
   * CALL (crown = the 30-day milestone).
   */
  noteStreak: (streak: number) => {
    xpGained: number;
    milestone: number | null;
    unlockedCrown: boolean;
  };
  /** Raw XP bump (level/stage celebrations are derived downstream). */
  addXp: (amount: number) => void;
  /** Development escape hatch. */
  reset: () => void;
}

const EMPTY_DAILY: DailyCounters = {
  dateKey: "",
  water: 0,
  meal: 0,
  journal: 0,
  sleep: 0,
  workout: 0,
};

export const useCompanionProgress = create<CompanionProgressState>()(
  persist(
    (set, get) => ({
      xp: 0,
      lastLevel: 1,
      lastStage: "cub",
      prCount: 0,
      streakMilestoneClaimed: 0,
      unlocks: { headband: false, crown: false },
      daily: { ...EMPTY_DAILY },

      syncDaily: (dateKey) => {
        if (get().daily.dateKey === dateKey) return;
        set({ daily: { ...EMPTY_DAILY, dateKey } });
      },

      awardDaily: (today) => {
        const { daily, xp } = get();
        const d = daily.dateKey ? daily : { ...EMPTY_DAILY, dateKey: "" };
        let gained = 0;
        const next: DailyCounters = { ...d };

        if (today.water > 0 && d.water === 0) {
          gained += 3;
          next.water = 1;
        }
        // count-based kinds: reward each NEW log beyond the snapshot
        if (today.meal > d.meal) {
          gained += 4 * (today.meal - d.meal);
          next.meal = today.meal;
        }
        if (today.journal > d.journal) {
          gained += 6 * (today.journal - d.journal);
          next.journal = today.journal;
        }
        if (today.sleep > 0 && d.sleep === 0) {
          gained += 6;
          next.sleep = 1;
        }
        if (today.workout > d.workout) {
          gained += 12 * (today.workout - d.workout);
          next.workout = today.workout;
        }

        if (gained > 0) set({ xp: xp + gained, daily: next });
        else if (daily.dateKey !== d.dateKey) set({ daily: d });
        return gained;
      },

      awardGoal: () => {
        const { xp } = get();
        set({ xp: xp + 8 });
        return 8;
      },

      notePR: () => {
        const { xp, prCount, unlocks } = get();
        const unlockedHeadband = !unlocks.headband;
        set({
          xp: xp + 25,
          prCount: prCount + 1,
          unlocks: unlockedHeadband ? { ...unlocks, headband: true } : unlocks,
        });
        return { xpGained: 25, unlockedHeadband };
      },

      noteStreak: (streak) => {
        const { xp, streakMilestoneClaimed, unlocks } = get();
        let gained = 0;
        let milestone: number | null = null;
        for (const [daysStr, bonus] of Object.entries(STREAK_MILESTONES)) {
          const days = Number(daysStr);
          if (streak >= days && streakMilestoneClaimed < days) {
            gained += bonus;
            milestone = Math.max(milestone ?? 0, days);
          }
        }
        const unlockedCrown =
          milestone !== null && milestone >= 30 && !unlocks.crown;
        if (gained === 0 && !unlockedCrown) {
          return { xpGained: 0, milestone: null, unlockedCrown: false };
        }
        set({
          xp: xp + gained,
          streakMilestoneClaimed: Math.max(streakMilestoneClaimed, milestone ?? 0),
          unlocks: unlockedCrown ? { ...unlocks, crown: true } : unlocks,
        });
        return { xpGained: gained, milestone, unlockedCrown };
      },

      addXp: (amount) => set((s) => ({ xp: Math.max(0, s.xp + amount) })),

      reset: () =>
        set({
          xp: 0,
          lastLevel: 1,
          lastStage: "cub",
          prCount: 0,
          streakMilestoneClaimed: 0,
          unlocks: { headband: false, crown: false },
          daily: { ...EMPTY_DAILY },
        }),
    }),
    {
      name: "ft-companion-progress-v1",
      version: 1,
    }
  )
);

/** Imperative helpers for non-hook call sites. */
export const companionProgress = {
  current: () => useCompanionProgress.getState(),
  level: () => levelFromXp(useCompanionProgress.getState().xp),
  stage: () => stageFromLevel(levelFromXp(useCompanionProgress.getState().xp)),
};
