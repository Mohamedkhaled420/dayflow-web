// routine — shared contract for the AI routine builder (Phase 10).
//
// Pure types + pure helpers ONLY: this module is imported by both
// the /api/ai/workout-plan route and the client RoutineSheet, so it
// must never pull the exercise library (107 KB JSON) or any server
// client into a client chunk. The library mapping happens entirely
// server-side — the plan arrives with library ids attached and flows
// straight into the WorkoutSheet.

import type { WorkoutExercise } from "@/lib/workout";

// ------------------------------------------------------ brief ----

export const ROUTINE_GOALS = ["muscle", "strength", "fatloss", "endurance", "health"] as const;
export type RoutineGoal = (typeof ROUTINE_GOALS)[number];

export const ROUTINE_GOAL_LABELS: Record<RoutineGoal, string> = {
  muscle: "Build muscle",
  strength: "Strength",
  fatloss: "Fat loss",
  endurance: "Endurance",
  health: "General health",
};

export const ROUTINE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type RoutineLevel = (typeof ROUTINE_LEVELS)[number];

export const ROUTINE_LEVEL_LABELS: Record<RoutineLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const ROUTINE_EQUIPMENT = ["gym", "home", "bodyweight"] as const;
export type RoutineEquipment = (typeof ROUTINE_EQUIPMENT)[number];

export const ROUTINE_EQUIPMENT_LABELS: Record<RoutineEquipment, string> = {
  gym: "Full gym",
  home: "Dumbbells at home",
  bodyweight: "Bodyweight",
};

export const ROUTINE_FOCUS = [
  "auto",
  "push",
  "pull",
  "legs",
  "upper",
  "lower",
  "full",
  "cardio",
] as const;
export type RoutineFocus = (typeof ROUTINE_FOCUS)[number];

export const ROUTINE_FOCUS_LABELS: Record<RoutineFocus, string> = {
  auto: "Auto",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  upper: "Upper body",
  lower: "Lower body",
  full: "Full body",
  cardio: "Cardio",
};

/** Compact training-history context the client ships with the brief. */
export interface RoutineHistory {
  /** display names of the most-logged exercises (≤ 16) */
  recentExercises: string[];
  /** sessions with exercises, trailing 7 days */
  weekSessions: number;
  /** completed-set volume kg, trailing 7 days */
  weekVolumeKg: number;
}

export interface RoutineBrief {
  goal: RoutineGoal;
  level: RoutineLevel;
  daysPerWeek: number;
  equipment: RoutineEquipment;
  focus: RoutineFocus;
  /** free-text constraints — injuries, dislikes, equipment quirks */
  notes?: string;
  history?: RoutineHistory;
}

// ------------------------------------------------------- plan ----

/** One prescribed exercise — library id attached server-side. */
export interface PlanExercise {
  /** bundled exercise-library id (validated server-side) */
  id: string;
  /** display name */
  n: string;
  /** target muscle (from the library record — authoritative) */
  t: string;
  /** equipment (from the library record) */
  e: string;
  /** prescribed sets */
  sets: number;
  /** rep range (lo ≤ hi; null for timed work) */
  lo: number | null;
  hi: number | null;
  /** duration seconds — alternative to reps (planks, holds) */
  durationSec: number | null;
  /** prescribed rest between sets */
  restSec: number;
  /** target effort 4-10, null = unspecified */
  rpe: number | null;
  /** one-line why / technique cue */
  note: string | null;
}

export interface RoutinePlan {
  title: string;
  focusSummary: string;
  /** 2-3 sentences on the programming science */
  science: string;
  /** short principle chips — "10-20 sets/muscle/week" etc. */
  principles: string[];
  warmup: string[];
  cooldown: string[];
  exercises: PlanExercise[];
  estMinutes: number;
  /** echo of the brief (labels resolved client-side) */
  goal: RoutineGoal;
  level: RoutineLevel;
  equipment: RoutineEquipment;
  focus: RoutineFocus;
  daysPerWeek: number;
}

export interface RoutinePlanReply {
  plan: RoutinePlan;
  source: "ai" | "fallback";
  model?: string;
}

// ---------------------------------------------------- helpers ----

/** "4 × 6-8" / "3 × 45s" — the big scheme line on plan cards. */
export function planSchemeLabel(ex: PlanExercise): string {
  if (ex.durationSec != null && ex.lo == null) {
    return `${ex.sets} × ${ex.durationSec}s`;
  }
  if (ex.lo != null && ex.hi != null && ex.lo !== ex.hi) {
    return `${ex.sets} × ${ex.lo}–${ex.hi} reps`;
  }
  return `${ex.sets} × ${ex.lo ?? ex.hi ?? 10} reps`;
}

/** "2m 30s" / "90s" / "3 min" — rest label. */
export function planRestLabel(restSec: number): string {
  if (restSec < 90) return `${restSec}s`;
  const m = Math.floor(restSec / 60);
  const s = restSec % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

/** Midpoint of the rep range — what a prefilled set suggests. */
function midReps(ex: PlanExercise): number | null {
  if (ex.lo != null && ex.hi != null) return Math.round((ex.lo + ex.hi) / 2);
  return ex.lo ?? ex.hi ?? null;
}

/**
 * Plan → WorkoutSheet session. Reps are prefilled at the range
 * midpoint (the "leave 1-2 in the tank" end), weights stay empty
 * for the sheet's history-based smart prefill, nothing is checked.
 */
export function planToSession(plan: RoutinePlan): WorkoutExercise[] {
  return plan.exercises.map((ex) => {
    const reps = midReps(ex);
    const set =
      ex.durationSec != null && reps == null
        ? { d: ex.durationSec, c: false }
        : { r: reps ?? 10, c: false };
    return {
      id: ex.id,
      n: ex.n,
      t: ex.t,
      e: ex.e,
      s: Array.from({ length: ex.sets }, () => ({ ...set })),
    };
  });
}
