// build-exercise-db — one-shot generator for Dayflow's bundled exercise
// library, derived from hasaneyldrm/exercises-dataset (MIT, data only).
//
//   node scripts/build-exercise-db.mjs [path-to-exercises.json]
//
// Why two files:
//   src/data/exercises.json           ~1300 compact tuples (id, name,
//                                     body part, equipment, target,
//                                     muscle group). Loaded eagerly the
//                                     first time the gym logger opens —
//                                     small enough to be a lazy webpack
//                                     chunk, kept offline-first.
//   src/data/exercise-instructions.json
//                                     { id -> English instructions }.
//                                     ~600 KB of prose — dynamically
//                                     imported ONLY when a user expands
//                                     an exercise's "how to" row, so it
//                                     never touches the critical path.
//
// Media (images / GIFs) from the source repo are intentionally NOT
// bundled: the dataset data is MIT, but the media is © Gym visual under
// separate terms (180px-only, attribution, no sub-license). Dayflow
// ships the text data only.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_SRC =
  "/home/z/my-project/research-repos/exercises.json";
const src = resolve(process.argv[2] ?? DEFAULT_SRC);

const raw = JSON.parse(readFileSync(src, "utf8"));
if (!Array.isArray(raw) || raw.length < 100) {
  throw new Error(`unexpected dataset shape at ${src} (${raw.length} rows)`);
}

const clean = (s) => String(s ?? "").trim().toLowerCase();
const exercises = [];
const instructions = {};
const bodyParts = new Set();
const equipment = new Set();
const targets = new Set();

for (const row of raw) {
  const id = String(row.id).padStart(4, "0");
  const name = String(row.name).trim();
  const bodyPart = clean(row.body_part);
  const eq = clean(row.equipment);
  const target = clean(row.target);
  const muscleGroup = clean(row.muscle_group);
  if (!id || !name || !bodyPart || !eq) continue;

  exercises.push([id, name, bodyPart, eq, target, muscleGroup]);
  bodyParts.add(bodyPart);
  equipment.add(eq);
  if (target) targets.add(target);

  const en = row.instructions?.en ?? row.instruction_steps?.en?.join(" ");
  if (en && en.length > 10) instructions[id] = en;
}

const byName = (a, b) => a[1].localeCompare(b[1]);
exercises.sort(byName);

const ORDER = (xs) => [...xs].sort((a, b) => a.localeCompare(b));

const out = {
  v: 1,
  // tuples keep the bundle ~40% smaller than objects:
  // [id, name, bodyPart, equipment, target, muscleGroup]
  exercises,
  bodyParts: ORDER(bodyParts),
  equipment: ORDER(equipment),
  targets: ORDER(targets),
};

mkdirSync(dirname(resolve("src/data/exercises.json")), { recursive: true });
writeFileSync(resolve("src/data/exercises.json"), JSON.stringify(out));
writeFileSync(
  resolve("src/data/exercise-instructions.json"),
  JSON.stringify(instructions)
);

const kb = (p) => (readFileSync(resolve(p), "utf8").length / 1024).toFixed(0);
console.log(
  `exercises: ${exercises.length} · body parts: ${out.bodyParts.length} · ` +
    `equipment: ${out.equipment.length} · instructions: ${Object.keys(instructions).length}\n` +
    `  src/data/exercises.json            ${kb("src/data/exercises.json")} KB\n` +
    `  src/data/exercise-instructions.json ${kb("src/data/exercise-instructions.json")} KB`
);
