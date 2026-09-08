// ============================================================
// Dayflow — domain types for the personal life tracker
// (fitness · work · personal work · sleep · water · food)
//
// Everything here is storage-agnostic on purpose: the app
// currently persists these shapes to localStorage through the
// mock provider in store.ts, and the exact same shapes map 1:1
// onto the Supabase tables in /supabase/schema.sql for the
// future hosted version.
// ============================================================

export type CategoryKind = "time" | "counter";

export interface Category {
  id: string;
  name: string;
  colorHex: string;
  /** lucide-react icon key used by the sidebar cards / chips */
  icon: string;
  order: number;
  kind: CategoryKind;
  /** system categories power goal tracking and can't be deleted */
  isSystem?: boolean;
}

export interface TrackEvent {
  id: string;
  /** "YYYY-MM-DD" — the day this event belongs to (sleep = wake-up day) */
  dateKey: string;
  categoryId: string;
  title: string;
  /** "HH:MM" 24h */
  start: string;
  /** "HH:MM" 24h — when end <= start the block crosses midnight (sleep) */
  end: string;
  notes?: string;
}

export interface WaterEntry {
  id: string;
  /** "YYYY-MM-DD" */
  dateKey: string;
  /** "HH:MM" 24h */
  time: string;
  ml: number;
}

export interface Goals {
  /** focused job time per day */
  workMinutes: number;
  /** side-project / personal-work time per day */
  personalMinutes: number;
  /** active workout minutes per day */
  fitnessMinutes: number;
  /** workout sessions per week */
  fitnessSessionsPerWeek: number;
  /** sleep per night */
  sleepMinutes: number;
  /** glasses per day (glass size lives on the profile) */
  waterGlasses: number;
  /** logged meals per day */
  mealsPerDay: number;
}

export interface Profile {
  name: string;
  emoji: string;
  role: string;
  /** ml per glass used by the quick-add hydration tracker */
  waterGlassMl: number;
}

/** Day-level progress for every goal, computed in compute.ts */
export interface GoalProgress {
  key: "work" | "personal" | "fitness" | "sleep" | "water" | "meals";
  label: string;
  done: number;
  target: number;
  unit: "min" | "count";
  colorHex: string;
  met: boolean;
}

export interface DayflowData {
  profile: Profile;
  goals: Goals;
  categories: Category[];
  events: TrackEvent[];
  water: WaterEntry[];
}
