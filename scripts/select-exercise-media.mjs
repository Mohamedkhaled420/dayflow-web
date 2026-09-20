#!/usr/bin/env node
// select-exercise-media — curates the exercise illustrations worth
// generating first. The 1,324-exercise library is too large to
// illustrate one-by-one up front, so this script resolves a curated
// list of canonical movements (compounds first, then the common
// isolations) against the dataset and prints the exact slugs to use
// as filenames (see docs/media-assets.md).
//
//   node scripts/select-exercise-media.mjs
//
// Every entry below is an EXACT dataset name (verified against
// src/data/exercises.json) so the slugs are stable. Misses print
// loudly so a dataset regeneration can't silently drift the list.

import { readFileSync } from "node:fs";
import path from "node:path";

const db = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "src/data/exercises.json"), "utf8")
);
const byName = new Map(db.exercises.map(([, name, bodyPart, equipment]) => [name, { name, bodyPart, equipment }]));

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Exact dataset names, grouped by body part.
const CURATED = {
  chest: [
    "barbell bench press",
    "barbell incline bench press",
    "barbell decline bench press",
    "dumbbell bench press",
    "dumbbell fly",
    "cable middle fly",
    "lever chest press",
    "deep push up",
    "chest dip",
  ],
  back: [
    "pull up (neutral grip)",
    "chin-up",
    "cable bar lateral pulldown",
    "barbell bent over row",
    "barbell pendlay row",
    "barbell one arm bent over row",
    "cable seated row",
    "barbell deadlift",
    "barbell romanian deadlift",
    "dumbbell romanian deadlift",
    "barbell sumo deadlift",
    "cable straight arm pulldown",
    "hyperextension",
    "barbell shrug",
    "dumbbell shrug",
  ],
  shoulders: [
    "barbell standing close grip military press",
    "dumbbell seated shoulder press",
    "dumbbell arnold press",
    "dumbbell lateral raise",
    "cable lateral raise",
    "dumbbell front raise",
    "dumbbell rear lateral raise",
    "barbell upright row",
    "exercise ball pike push up",
  ],
  "upper arms": [
    "barbell curl",
    "ez barbell curl",
    "dumbbell hammer curl",
    "dumbbell alternate biceps curl",
    "dumbbell concentration curl",
    "barbell preacher curl",
    "cable curl",
    "cable pushdown (with rope attachment)",
    "barbell lying triceps extension skull crusher",
    "barbell seated overhead triceps extension",
    "dumbbell kickback",
    "bench dip (knees bent)",
    "triceps dip",
    "barbell reverse curl",
  ],
  "lower arms": ["barbell wrist curl", "barbell reverse wrist curl", "farmers walk"],
  "upper legs": [
    "barbell full squat",
    "barbell front squat",
    "dumbbell goblet squat",
    "barbell hack squat",
    "sled 45\u0432\u00b0 leg press",
    "barbell lunge",
    "dumbbell lunge",
    "walking lunge",
    "barbell straight leg deadlift",
    "lever leg extension",
    "lever lying leg curl",
    "dumbbell step-up",
    "barbell glute bridge",
    "barbell glute bridge two legs on bench (male)",
    "glute-ham raise",
  ],
  "lower legs": [
    "barbell standing calf raise",
    "barbell seated calf raise",
    "bodyweight standing calf raise",
  ],
  waist: [
    "front plank with twist",
    "bodyweight incline side plank",
    "hanging leg raise",
    "cable kneeling crunch",
    "crunch (hands overhead)",
    "air bike",
    "russian twist",
    "dead bug",
    "barbell standing ab rollerout",
    "decline sit-up",
  ],
  cardio: [
    "burpee",
    "jump rope",
    "mountain climber",
    "walk elliptical cross trainer",
    "walking on stepmill",
    "stationary bike run v. 3",
    "tire flip",
  ],
};

const rows = [];
const misses = [];
const seen = new Set();

for (const [group, names] of Object.entries(CURATED)) {
  for (const name of names) {
    const hit = byName.get(name);
    if (!hit) {
      misses.push(`${group}: ${name}`);
      continue;
    }
    const slug = slugify(name);
    if (seen.has(slug)) {
      misses.push(`DUPLICATE SLUG: ${slug} (${name})`);
      continue;
    }
    seen.add(slug);
    rows.push({ group, slug, ...hit });
  }
}

console.log(`# ${rows.length} selected / ${misses.length} problems\n`);
for (const r of rows) {
  console.log(`${r.slug}\t${r.name}\t${r.bodyPart}\t${r.equipment}`);
}
if (misses.length) {
  console.log("\n# PROBLEMS:");
  for (const m of misses) console.log(`# ${m}`);
  process.exitCode = 1;
}
