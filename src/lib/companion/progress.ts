// ============================================================
// Focus Triad — companion progression (Dia's XP & evolution math)
// ------------------------------------------------------------
// Pure functions for the companion's growth system. No React, no
// three.js, no store — the persisted state lives in
// src/store/companionProgress.ts and the watchers live in
// DiaCompanion. Keeping the math here means it is trivially
// testable and shared by any future surface (settings panel,
// share cards, …).
//
// Design (v1, deliberately simple):
//   - XP comes from REAL actions only: first-of-day logs of each
//     kind, every goal ring closed, every PR, streak milestones.
//     Poking gives nothing — no farming your tiger.
//   - Levels use a quadratic curve (fast early wins, steadier
//     later): xpForLevel(n) = 20*(n-1) + 10*(n-1)^2, then a flat
//     +300/level past 10. A solid day earns ~40-70 XP, so level 2
//     lands on day one, "Hunter" around day four and "Legend"
//     after roughly two honest weeks.
//   - Evolution stages are cosmetic tiers (aura under her):
//     Cub (1-3) -> Hunter (4-7) -> Legend (8+).
//   - Cosmetic unlocks are event-gated, not level-gated, so they
//     feel EARNED: headband on the first ever PR, crown on a
//     30-day activity streak.
// ============================================================

import type { TrackEvent, WaterEntry } from "@/lib/types";

// ---------- XP awards ----------

/** XP awarded the first time each kind of log lands on a given day. */
export const XP_AWARDS = {
  /** Any water logged today (once). */
  water: 3,
  /** Each meal logged today. */
  meal: 4,
  /** Each journal entry written today. */
  journal: 6,
  /** Sleep logged today (once). */
  sleep: 6,
  /** Each workout logged today. */
  workout: 12,
  /** Each goal ring that closes today (ring-close watcher). */
  goal: 8,
  /** Each personal record detected in the gym logger. */
  pr: 25,
} as const;

/** Streak milestone bonuses (activity streak, consecutive days). */
export const STREAK_MILESTONES: Record<number, number> = {
  7: 40,
  30: 150,
};

/** The crown's streak threshold (kept here so the copy and the
 *  unlock can never drift apart). */
export const CROWN_STREAK_DAYS = 30;

// ---------- levels & stages ----------

/** Cumulative XP required to REACH level n (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > 10) {
    // xpForLevel(10) + 300 per extra level
    return 990 + 300 * (level - 10);
  }
  const n = level - 1;
  return 20 * n + 10 * n * n;
}

/** The level a given total XP amount has reached. */
export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < 99 && xp >= xpForLevel(level + 1)) level++;
  return level;
}

export type CompanionStage = "cub" | "hunter" | "legend";

export const STAGE_META: Record<
  CompanionStage,
  { name: string; title: string; minLevel: number }
> = {
  cub: { name: "Cub", title: "just getting started", minLevel: 1 },
  hunter: { name: "Hunter", title: "finding her prowl", minLevel: 4 },
  legend: { name: "Legend", title: "guardian of the streak", minLevel: 8 },
};

export function stageFromLevel(level: number): CompanionStage {
  if (level >= STAGE_META.legend.minLevel) return "legend";
  if (level >= STAGE_META.hunter.minLevel) return "hunter";
  return "cub";
}

/** Progress toward the next level: { into, needed, pct } (pct 0..1). */
export function levelProgress(xp: number): {
  into: number;
  needed: number;
  pct: number;
} {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const into = xp - base;
  const needed = next - base;
  return { into, needed, pct: needed > 0 ? Math.min(1, into / needed) : 1 };
}

// ---------- activity streak (the crown's metric) ----------
//
// "Showing up" = ANY real signal on a day: water, a workout, sleep,
// a journal entry, a meal, or any other tracked activity. Rest days
// don't break it — only disappearing entirely does. Today counts if
// anything landed; if today is still empty the streak reads
// yesterday backwards (mirroring goalStreak's grace window).

export interface StreakSources {
  events: TrackEvent[];
  water: WaterEntry[];
  journalDates: string[];
}

/** Set of dateKeys that have at least one real log. */
export function activeDaySet({ events, water, journalDates }: StreakSources): Set<string> {
  const days = new Set<string>();
  for (const e of events) days.add(e.dateKey);
  for (const w of water) if (w.ml > 0) days.add(w.dateKey);
  for (const d of journalDates) days.add(d);
  return days;
}

/** Consecutive active days ending at endDateKey (today's grace: an
 *  empty today does not break the streak — it just isn't counted). */
export function activityStreak(sources: StreakSources, endDateKey: string): number {
  const days = activeDaySet(sources);
  let streak = 0;
  const [y, m, d] = endDateKey.split("-").map(Number);
  for (let back = 0; back < 730; back++) {
    const day = new Date(y, m - 1, d - back);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
      day.getDate()
    ).padStart(2, "0")}`;
    if (days.has(key)) streak++;
    else if (back === 0) continue; // today still empty — grace
    else break;
  }
  return streak;
}
