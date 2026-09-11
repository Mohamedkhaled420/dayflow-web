// ============================================================
// Dayflow AI — view-model adapter (Phase 5 T0)
// ------------------------------------------------------------
// The legacy mock store (src/lib/store.ts — deleted in this
// phase) fed the six views a local-only DayflowData shape.
// This module derives the SAME shapes from the Delta Sync store
// (src/store/useDayflowStore.ts), which mirrors the Supabase
// schema, so every view keeps its selectors while reading and
// writing through the server-backed store:
//
//   profile   <- profiles row (identity / occupational_context /
//                metabolism / chronobiology JSONB sections)
//   goals     <- the same sections' targets (PRD §3)
//   events    <- sleep_logs + workout_logs as timeline blocks
//   water     <- hydration_logs as timeline markers
//   categories<- the fixed system category set (palette data)
//
// Every write path goes through useDayflowStore actions
// (optimistic IndexedDB append -> Supabase insert -> cursor bump).
// ============================================================

"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDayflowStore } from "@/store/useDayflowStore";
import type {
  HydrationLogRow,
  ProfileRow,
  SleepLogRow,
  WorkoutLogRow,
} from "@/store/useDayflowStore";
import type { Category, DayflowData, Goals, Profile, TrackEvent, WaterEntry } from "./types";
import { DEFAULT_CATEGORIES } from "./seed";
import { CATEGORY_COLORS } from "@/styles/palette";

// ---------- profile JSONB section readers ----------

interface IdentitySection {
  displayName?: string;
  emoji?: string;
  role?: string;
  timezone?: string;
}

interface OccupationalSection {
  status?: string;
  dailyCareerTargetMinutes?: number;
  dailyPersonalCraftMinutes?: number;
  enforceMorningAnchor?: boolean;
}

interface MetabolismSection {
  dailyWaterBaseMl?: number;
  workoutFrequencyTargetDays?: number;
  fitnessMinutes?: number;
  mealsPerDay?: number;
  waterGlassMl?: number;
}

interface ChronobiologySection {
  targetSleepDurationMinutes?: number;
}

const asSection = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const STATUS_LABELS: Record<string, string> = {
  employed_structured: "Structured 9-to-5",
  freelance_flexible: "Freelance & flexible",
  self_directed_job_seeker: "Self-directed",
  founder_builder: "Founder / builder",
  sabbatical: "Sabbatical",
};

/** Legacy Profile view-shape from the profiles row's JSONB sections. */
export function deriveProfile(row: ProfileRow | null): Profile {
  const identity = asSection(row?.identity) as IdentitySection;
  const occupation = asSection(row?.occupational_context) as OccupationalSection;
  const metabolism = asSection(row?.metabolism) as MetabolismSection;
  return {
    name: identity.displayName?.trim() || "Friend",
    emoji: identity.emoji || "🌊",
    role:
      identity.role ??
      STATUS_LABELS[occupation.status ?? ""] ??
      "Building a resilient day",
    waterGlassMl: metabolism.waterGlassMl ?? 250,
  };
}

/** Legacy Goals view-shape — targets live in the profile sections (PRD §3). */
export function deriveGoals(row: ProfileRow | null): Goals {
  const occupation = asSection(row?.occupational_context) as OccupationalSection;
  const metabolism = asSection(row?.metabolism) as MetabolismSection;
  const chrono = asSection(row?.chronobiology) as ChronobiologySection;
  const waterBase = num(metabolism.dailyWaterBaseMl);
  return {
    workMinutes: num(occupation.dailyCareerTargetMinutes) ?? 420,
    personalMinutes: num(occupation.dailyPersonalCraftMinutes) ?? 90,
    fitnessMinutes: num(metabolism.fitnessMinutes) ?? 45,
    fitnessSessionsPerWeek: num(metabolism.workoutFrequencyTargetDays) ?? 4,
    sleepMinutes: num(chrono.targetSleepDurationMinutes) ?? 480,
    waterGlasses: waterBase ? Math.max(1, Math.round(waterBase / 250)) : 8,
    mealsPerDay: num(metabolism.mealsPerDay) ?? 3,
  };
}

// ---------- log rows -> timeline shapes ----------

const pad2 = (n: number) => String(n).padStart(2, "0");

const localDateKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const localClock = (iso: string): string => {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const minutesToClock = (mins: number): string => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
};

const clockToMinutes = (hm: string): number => {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Real timestamp for a dateKey + "HH:MM" local clock pair. */
export const localDateTime = (dateKey: string, clock: string): string => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [h, min] = clock.split(":").map(Number);
  return new Date(y, m - 1, d, h || 0, min || 0).toISOString();
};

/** sleep_logs -> overnight timeline blocks (wake time = logged_at). */
export function sleepToEvent(row: SleepLogRow): TrackEvent {
  const wakeClock = localClock(row.logged_at);
  const wakeMin = clockToMinutes(wakeClock);
  const startMin = wakeMin - row.sleep_minutes; // may cross midnight
  return {
    id: row.id,
    dateKey: localDateKey(row.logged_at),
    categoryId: "sleep",
    title: "Sleep",
    start: minutesToClock(startMin),
    end: wakeClock,
    notes:
      row.resting_heart_rate != null ? `Resting HR ${row.resting_heart_rate} bpm` : undefined,
  };
}

/** workout_logs -> timeline fitness blocks (start = logged_at). */
export function workoutToEvent(row: WorkoutLogRow): TrackEvent {
  const startClock = localClock(row.logged_at);
  const startMin = clockToMinutes(startClock);
  const dur = row.duration_minutes ?? 45;
  return {
    id: row.id,
    dateKey: localDateKey(row.logged_at),
    categoryId: "fitness",
    title: row.type,
    start: startClock,
    end: minutesToClock(startMin + dur),
    notes:
      row.active_calories != null ? `${row.active_calories} kcal active` : undefined,
  };
}

/** hydration_logs -> timeline water markers. */
export function hydrationToWater(row: HydrationLogRow): WaterEntry {
  return {
    id: row.id,
    dateKey: localDateKey(row.logged_at),
    time: localClock(row.logged_at),
    ml: row.amount_ml,
  };
}

// ---------- hooks (drop-in replacements for the legacy store's) ----------

/**
 * The full derived data slice, in the exact legacy DayflowData
 * shape every view + compute.ts already consume. Recomputed only
 * when one of the mirrored row arrays changes (useShallow).
 */
export function useDayflowData(): DayflowData {
  const profileRow = useDayflowStore((s) => s.profile);
  const sleepLogs = useDayflowStore((s) => s.sleepLogs);
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const hydrationLogs = useDayflowStore((s) => s.hydrationLogs);

  return useMemo(() => {
    const events = [...sleepLogs.map(sleepToEvent), ...workoutLogs.map(workoutToEvent)];
    return {
      profile: deriveProfile(profileRow),
      goals: deriveGoals(profileRow),
      categories: DEFAULT_CATEGORIES,
      events,
      water: hydrationLogs.map(hydrationToWater),
    };
  }, [profileRow, sleepLogs, workoutLogs, hydrationLogs]);
}

/** Categories sorted by order — fixed system set (stable reference). */
export function useSortedCategories(): Category[] {
  return useMemo(
    () => [...DEFAULT_CATEGORIES].sort((a, b) => a.order - b.order),
    []
  );
}

// ---------- write-path adapters ----------

/** Server-backed timeline categories (what the Log sheet can create). */
export const LOGGABLE_CATEGORIES: Category[] = DEFAULT_CATEGORIES.filter((c) =>
  ["sleep", "fitness"].includes(c.id)
);

/** The water data color — palette single-source (palette.ts). */
export const WATER_COLOR = CATEGORY_COLORS.water;
