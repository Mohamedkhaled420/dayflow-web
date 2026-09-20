// exercise-db — typed access to Dayflow's bundled exercise library.
//
// Source: hasaneyldrm/exercises-dataset (MIT — data only, no media).
// Regenerate with `node scripts/build-exercise-db.mjs`.
//
// The compact tuples live in src/data/exercises.json (~107 KB raw /
// ~16 KB gzip) and are only ever pulled into the WorkoutSheet chunk.
// Full English instructions live in a SEPARATE chunk
// (exercise-instructions.json, ~610 KB) that is dynamically imported
// the first time a user expands an exercise's "how-to" — they never
// weigh down the app shell.

import db from "@/data/exercises.json";

export interface ExerciseRecord {
  /** zero-padded 4-digit id, e.g. "0294" */
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  muscleGroup: string;
}

interface DbShape {
  v: 1;
  exercises: [string, string, string, string, string, string][];
  bodyParts: string[];
  equipment: string[];
  targets: string[];
}

const shape = db as unknown as DbShape;

export const EXERCISES: ExerciseRecord[] = shape.exercises.map(
  ([id, name, bodyPart, equipment, target, muscleGroup]) => ({
    id,
    name,
    bodyPart,
    equipment,
    target,
    muscleGroup,
  })
);

export const BODY_PARTS: readonly string[] = shape.bodyParts;
export const EQUIPMENT: readonly string[] = shape.equipment;

const byId = new Map(EXERCISES.map((e) => [e.id, e]));
export const exerciseById = (id: string): ExerciseRecord | undefined =>
  byId.get(id);

/** Case/diacritic-insensitive contains match on name + target. */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export interface ExerciseFilter {
  q?: string;
  bodyPart?: string | null;
  equipment?: string | null;
}

/** Search + filter with a render cap — the caller decides how many
 *  rows to show; we cap the candidate list so sort+slice stays cheap. */
export function searchExercises(
  { q = "", bodyPart = null, equipment = null }: ExerciseFilter,
  limit = 400
): ExerciseRecord[] {
  const needle = norm(q.trim());
  const out: ExerciseRecord[] = [];
  for (const e of EXERCISES) {
    if (bodyPart && e.bodyPart !== bodyPart) continue;
    if (equipment && e.equipment !== equipment) continue;
    if (needle) {
      const hay = norm(e.name);
      if (!hay.includes(needle) && !norm(e.target).includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  // exact-prefix matches first, then alphabetical — feels instant.
  if (needle) {
    out.sort((a, b) => {
      const pa = norm(a.name).startsWith(needle) ? 0 : 1;
      const pb = norm(b.name).startsWith(needle) ? 0 : 1;
      return pa - pb || a.name.localeCompare(b.name);
    });
  }
  return out;
}

let instructionsPromise: Promise<Record<string, string>> | null = null;

/** Lazily import the instructions chunk (one shared promise). */
export function loadInstructions(): Promise<Record<string, string>> {
  instructionsPromise ??= import("@/data/exercise-instructions.json").then(
    (m) => m.default as Record<string, string>
  );
  return instructionsPromise;
}
