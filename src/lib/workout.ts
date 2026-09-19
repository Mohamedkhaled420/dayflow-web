// workout — domain contract for gym-mode workout_logs.exercises.
//
// The jsonb column shape (see supabase/migrations/0010) is compact on
// purpose — ids are 4 chars, keys are single letters — because rows
// sync over the wire on every save:
//
//   [{ "id": "0294",     bundled exercise-library id
//      "n": "pull-up",   display name (denormalized: library is versioned
//      "t": "upper arms" target muscle     data, log rows must outlive it)
//      "e": "body weight" equipment
//      "s": [ { "w": 0,   weight kg — null/omitted for bodyweight-only
//               "r": 10,  reps — null/omitted for timed sets
//               "d": 45,  OR duration seconds (plank, cardio)
//               "c": true completed
//             } ] } ]
//
// Everything here is pure + defensive: historical rows may predate the
// column (null), or carry shapes from older app versions.

import type { Json } from "@/types/supabase";

export interface WorkoutSet {
  /** weight in kg (null = bodyweight / timed) */
  w?: number | null;
  /** reps (null for timed sets) */
  r?: number | null;
  /** duration seconds — alternative to reps */
  d?: number | null;
  /** completed */
  c?: boolean;
}

export interface WorkoutExercise {
  id: string;
  /** display name */
  n: string;
  /** target muscle */
  t?: string;
  /** equipment */
  e?: string;
  s: WorkoutSet[];
}

export type WorkoutExercisesJson = WorkoutExercise[];

/** Minimal row shape the analytics helpers need — WorkoutLogRow fits. */
export interface WorkoutHistoryRow {
  id: string;
  logged_at: string;
  exercises: unknown;
}

/** Parse the jsonb column defensively — never throws on legacy rows. */
export function parseExercises(
  json: unknown
): WorkoutExercise[] {
  if (!Array.isArray(json)) return [];
  const out: WorkoutExercise[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.n !== "string") continue;
    if (!Array.isArray(r.s)) continue;
    out.push({
      id: r.id,
      n: r.n,
      t: typeof r.t === "string" ? r.t : undefined,
      e: typeof r.e === "string" ? r.e : undefined,
      s: r.s.filter((s): s is WorkoutSet => !!s && typeof s === "object"),
    });
  }
  return out;
}

/** Serialize for the jsonb column (drops undefined keys). */
export function serializeExercises(
  exs: WorkoutExercise[]
): Json {
  return exs.map((ex) => ({
    id: ex.id,
    n: ex.n,
    ...(ex.t ? { t: ex.t } : {}),
    ...(ex.e ? { e: ex.e } : {}),
    s: ex.s.map((s) => ({
      ...(s.w != null ? { w: s.w } : {}),
      ...(s.r != null ? { r: s.r } : {}),
      ...(s.d != null ? { d: s.d } : {}),
      ...(s.c ? { c: true } : {}),
    })),
  })) as Json;
}

// ------------------------------------------------------ stats ----

export interface WorkoutStats {
  exercises: number;
  sets: number;
  doneSets: number;
  /** sum(weight × reps) over completed sets, kg */
  volumeKg: number;
  /** sum of timed durations, seconds */
  timedSeconds: number;
  /** completed sets per target muscle — for the muscle split chips */
  byTarget: Record<string, number>;
}

export function workoutStats(exs: WorkoutExercise[]): WorkoutStats {
  const stats: WorkoutStats = {
    exercises: exs.length,
    sets: 0,
    doneSets: 0,
    volumeKg: 0,
    timedSeconds: 0,
    byTarget: {},
  };
  for (const ex of exs) {
    const target = ex.t || "other";
    for (const s of ex.s) {
      stats.sets++;
      if (!s.c) continue;
      stats.doneSets++;
      stats.byTarget[target] = (stats.byTarget[target] ?? 0) + 1;
      if (s.w != null && s.r != null) stats.volumeKg += s.w * s.r;
      if (s.d != null) stats.timedSeconds += s.d;
    }
  }
  return stats;
}

const fmtTons = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)} t` : `${Math.round(kg)} kg`;

/** One-line session summary for timeline notes & toasts. */
export function summarizeWorkout(exs: WorkoutExercise[]): string | null {
  const st = workoutStats(exs);
  if (st.exercises === 0) return null;
  const bits = [`${st.exercises} exercise${st.exercises > 1 ? "s" : ""}`];
  if (st.sets > 0) bits.push(`${st.sets} set${st.sets > 1 ? "s" : ""}`);
  if (st.volumeKg > 0) bits.push(fmtTons(st.volumeKg));
  else if (st.timedSeconds >= 60)
    bits.push(`${Math.round(st.timedSeconds / 60)} min work`);
  return bits.join(" · ");
}

/** Body-part aware auto title: "Chest + triceps", "Upper legs", … */
const PART_LABELS: Record<string, string> = {
  back: "Back",
  cardio: "Cardio",
  chest: "Chest",
  "lower arms": "Forearms",
  "lower legs": "Calves",
  neck: "Neck",
  shoulders: "Shoulders",
  "upper arms": "Arms",
  "upper legs": "Legs",
  waist: "Core",
};

/** Derive a workout title from its exercises' targets. */
export function autoTitle(
  exs: WorkoutExercise[],
  libraryBodyPart?: (id: string) => string | undefined
): string | null {
  if (exs.length === 0) return null;
  const counts = new Map<string, number>();
  for (const ex of exs) {
    const part = libraryBodyPart?.(ex.id) ?? ex.t ?? "other";
    counts.set(part, (counts.get(part) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => PART_LABELS[p] ?? p);
  if (top.length === 0) return null;
  if (top.length === 1) return `Gym — ${top[0]}`;
  return `Gym — ${top[0]} + ${top[1]}`;
}

// ------------------------------------------------------- PRs ----

/** Epley estimated 1RM — the standard "did I beat my best" heuristic. */
export function e1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

export interface PersonalRecord {
  exerciseName: string;
  weightKg: number;
  reps: number;
  /** estimated 1RM this session */
  e1rm: number;
}

/** Compare a draft session against history; returns the new PRs. */
export function findNewPRs(
  history: { exercises: WorkoutExercise[] }[],
  session: WorkoutExercise[]
): PersonalRecord[] {
  const best = new Map<string, number>();
  for (const h of history) {
    for (const ex of h.exercises) {
      for (const s of ex.s) {
        if (s.w == null || s.r == null) continue;
        const est = e1rm(s.w, s.r);
        if (est > (best.get(ex.n) ?? 0)) best.set(ex.n, est);
      }
    }
  }
  const prs: PersonalRecord[] = [];
  for (const ex of session) {
    let sessionBest = 0;
    let bestSet: { w: number; r: number } | null = null;
    for (const s of ex.s) {
      if (s.w == null || s.r == null) continue;
      const est = e1rm(s.w, s.r);
      if (est > sessionBest) {
        sessionBest = est;
        bestSet = { w: s.w, r: s.r };
      }
    }
    if (bestSet && sessionBest > (best.get(ex.n) ?? 0)) {
      prs.push({
        exerciseName: ex.n,
        weightKg: bestSet.w,
        reps: bestSet.r,
        e1rm: Math.round(sessionBest),
      });
    }
  }
  return prs;
}

// ------------------------------------------------- history / analytics ----

/** "Last: 60 kg × 8" / "Last: 45 s" — one line per exercise in the picker. */
export function fmtSetLine(w?: number | null, r?: number | null, d?: number | null): string {
  if (w != null && r != null) return `${w} kg × ${r}`;
  if (d != null) return `${d}s`;
  if (r != null) return `${r} reps`;
  return "—";
}

/** Relative day label — "today", "3 d ago", "2 mo ago". */
export function fmtDaysAgo(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} d ago`;
  const months = Math.round(days / 30);
  return `${months} mo ago`;
}

export interface ExerciseSummary {
  /** ISO of the most recent session containing this exercise */
  lastDate: string;
  /** best (heaviest) set from that most recent session */
  lastLine: string;
  /** structured form of lastLine — prefills new exercise cards */
  lastSet: { w?: number; r?: number; d?: number };
  /** all-time best Epley e1RM, kg */
  bestE1rm: number;
  /** the set that produced bestE1rm */
  bestLine: string;
  /** how many sessions included this exercise */
  sessions: number;
}

/**
 * Per-exercise training history, keyed by display name (names are
 * denormalized into log rows, so they survive library re-generation).
 * Powers "Last: 60 kg × 8 · 12 d ago" in the picker and PR analytics.
 */
export function exerciseSummaries(
  rows: WorkoutHistoryRow[],
  excludeId?: string | null
): Map<string, ExerciseSummary> {
  const byName = new Map<string, ExerciseSummary>();
  // ascending order — the LAST write per exercise is its most recent session
  const ordered = [...rows]
    .filter((r) => r.id !== excludeId)
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  for (const row of ordered) {
    const seen = new Set<string>();
    for (const ex of parseExercises(row.exercises)) {
      if (seen.has(ex.n)) continue; // once per session
      seen.add(ex.n);
      const cur = byName.get(ex.n);
      // best set of THIS session — heaviest e1rm (or longest hold)
      let sessionLine = "—";
      let sessionScore = -1;
      let sessionSet: { w?: number; r?: number; d?: number } = {};
      for (const s of ex.s) {
        const score =
          s.w != null && s.r != null ? e1rm(s.w, s.r) : s.d ?? 0;
        if (score > sessionScore) {
          sessionScore = score;
          sessionLine = fmtSetLine(s.w, s.r, s.d);
          sessionSet = { w: s.w ?? undefined, r: s.r ?? undefined, d: s.d ?? undefined };
        }
      }
      let bestE1rm = cur?.bestE1rm ?? 0;
      let bestLine = cur?.bestLine ?? "—";
      for (const s of ex.s) {
        if (s.w == null || s.r == null) continue;
        const est = e1rm(s.w, s.r);
        if (est > bestE1rm) {
          bestE1rm = est;
          bestLine = fmtSetLine(s.w, s.r);
        }
      }
      byName.set(ex.n, {
        lastDate: row.logged_at,
        lastLine: sessionLine,
        lastSet: sessionSet,
        bestE1rm,
        bestLine,
        sessions: (cur?.sessions ?? 0) + 1,
      });
    }
  }
  return byName;
}

/** All-time personal record per exercise (best Epley e1RM). */
export interface PRRecord {
  name: string;
  weightKg: number;
  reps: number;
  e1rm: number;
  date: string;
}

export function personalRecords(rows: WorkoutHistoryRow[]): PRRecord[] {
  const best = new Map<string, PRRecord>();
  for (const row of rows) {
    for (const ex of parseExercises(row.exercises)) {
      for (const s of ex.s) {
        if (s.w == null || s.r == null) continue;
        const est = e1rm(s.w, s.r);
        const cur = best.get(ex.n);
        if (!cur || est > cur.e1rm) {
          best.set(ex.n, {
            name: ex.n,
            weightKg: s.w,
            reps: s.r,
            e1rm: est,
            date: row.logged_at,
          });
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => b.e1rm - a.e1rm);
}

export interface WeekBucket {
  /** monday of the week, epoch ms */
  weekStart: number;
  /** short label — "8/25" (monday date) */
  label: string;
  volumeKg: number;
  sets: number;
  sessions: number;
}

/** Volume per ISO week for the trailing `weeks` weeks (incl. current). */
export function weeklyVolume(rows: WorkoutHistoryRow[], weeks = 8): WeekBucket[] {
  const now = new Date();
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7)
  );
  monday.setHours(0, 0, 0, 0);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const ws = monday.getTime() - (weeks - 1 - i) * 604_800_000;
    const d = new Date(ws);
    return {
      weekStart: ws,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      volumeKg: 0,
      sets: 0,
      sessions: 0,
    };
  });
  const firstStart = buckets[0].weekStart;
  for (const row of rows) {
    const t = new Date(row.logged_at).getTime();
    if (t < firstStart) continue;
    const idx = Math.min(
      weeks - 1,
      Math.floor((t - firstStart) / 604_800_000)
    );
    if (idx < 0) continue;
    const exs = parseExercises(row.exercises);
    const st = workoutStats(exs);
    buckets[idx].sets += st.doneSets;
    buckets[idx].volumeKg += st.volumeKg;
    if (exs.length > 0) buckets[idx].sessions++;
  }
  return buckets;
}

/** Muscle distribution over the trailing N days — [target, doneSets]. */
export function muscleSplit(rows: WorkoutHistoryRow[], days = 30): [string, number][] {
  const cutoff = Date.now() - days * 86_400_000;
  const byTarget = new Map<string, number>();
  for (const row of rows) {
    if (new Date(row.logged_at).getTime() < cutoff) continue;
    const st = workoutStats(parseExercises(row.exercises));
    for (const [t, n] of Object.entries(st.byTarget)) {
      byTarget.set(t, (byTarget.get(t) ?? 0) + n);
    }
  }
  return [...byTarget.entries()].sort((a, b) => b[1] - a[1]);
}

/** The N most-logged exercises (by session count), newest first. */
export function recentExerciseNames(
  rows: WorkoutHistoryRow[],
  limit = 6
): { name: string; id: string }[] {
  const byName = new Map<string, { name: string; id: string; sessions: number; last: string }>();
  const ordered = [...rows].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
  for (const row of ordered) {
    const seen = new Set<string>();
    for (const ex of parseExercises(row.exercises)) {
      if (seen.has(ex.n)) continue;
      seen.add(ex.n);
      const cur = byName.get(ex.n);
      byName.set(ex.n, {
        name: ex.n,
        id: ex.id,
        sessions: (cur?.sessions ?? 0) + 1,
        last: cur?.last ?? row.logged_at,
      });
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.sessions - a.sessions || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(({ name, id }) => ({ name, id }));
}
