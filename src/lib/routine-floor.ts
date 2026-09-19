// routine-floor — server-side exercise-library intelligence for the
// AI routine builder (Phase 10).
//
// Three pure, testable pieces used by /api/ai/workout-plan:
//
//   buildCatalog(brief)        the equipment-compliant, focus-shaped
//                              exercise catalog that goes into the
//                              prompt (and scopes name matching)
//   matchLibraryExercise()     lenient model-output → library-id
//                              mapping (exact → contains → token
//                              overlap), so a plan only ever
//                              references real library rows
//   buildTemplatePlan(brief)   the algorithmic floor — a classic,
//                              evidence-based template assembled
//                              deterministically from the library
//                              when every AI hop fails. Works with
//                              no keys at all, honestly labeled.
//
// This module imports the exercise library (107 KB JSON) and is
// therefore SERVER-ONLY: nothing under src/components may import
// it (it would drag the JSON into a client chunk — exercise-db.ts
// documents the same discipline for WorkoutSheet).
//
// Picker strategy: this dataset names canonical movements in many
// equipment-prefixed variants ("barbell bench press", "dumbbell
// bench press", …) plus noise variants ("… (male)", "… v. 2",
// "… (side pov)"). Templates therefore pick by keyword + an
// avoid-list of variant markers, preferring classic equipment and
// short names — verified against the bundled data by hand.

import { EXERCISES, type ExerciseRecord } from "@/lib/exercise-db";
import {
  type PlanExercise,
  type RoutineBrief,
  type RoutineEquipment,
  type RoutineFocus,
  type RoutineGoal,
  type RoutineLevel,
  type RoutinePlan,
} from "@/lib/routine";

// ---------------------------------------------------- normalizing ----

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// -------------------------------------------------------- equipment ----

const EQUIPMENT_WHITELIST: Record<RoutineEquipment, ReadonlySet<string>> = {
  gym: new Set(EXERCISES.map((e) => e.equipment)), // everything
  home: new Set([
    "dumbbell",
    "kettlebell",
    "band",
    "resistance band",
    "body weight",
    "weighted",
    "medicine ball",
    "stability ball",
    "rope",
    "roller",
    "wheel roller",
    "bosu ball",
    "ez barbell",
  ]),
  bodyweight: new Set(["body weight"]),
};

/** Classic-equipment preference order per tier (index = preference). */
const EQUIPMENT_PREF: Record<RoutineEquipment, readonly string[]> = {
  gym: [
    "barbell",
    "dumbbell",
    "cable",
    "leverage machine",
    "body weight",
    "smith machine",
    "kettlebell",
    "sled machine",
    "band",
    "ez barbell",
  ],
  home: [
    "dumbbell",
    "kettlebell",
    "body weight",
    "band",
    "resistance band",
    "weighted",
    "medicine ball",
    "stability ball",
    "ez barbell",
  ],
  bodyweight: ["body weight"],
};

// ---------------------------------------------------------- catalog ----

/** Compound-movement keywords — these sort first in the catalog. */
const COMPOUND_RE =
  /\b(bench|squat|deadlift|row|press|pull|push|lunge|dip|clean|snatch|swing|jump|burpee|climb|carry|thrust)\b/;

/** Variant noise — these sort last (kept for breadth, not featured). */
const JUNK_RE =
  /\b(one arm|one leg|single leg|bosu|stability ball|exercise ball|pov|arm blaster|female|male|assisted|isometric|v\. 2|with towel|on knees|against wall)\b/;

/** Focus → body-part mix for the catalog (cap = max rows per part). */
const FOCUS_PARTS: Record<RoutineFocus, { part: string; cap: number }[]> = {
  push: [
    { part: "chest", cap: 42 },
    { part: "shoulders", cap: 36 },
    { part: "upper arms", cap: 30 },
    { part: "waist", cap: 14 },
    { part: "cardio", cap: 10 },
  ],
  pull: [
    { part: "back", cap: 46 },
    { part: "upper arms", cap: 26 },
    { part: "shoulders", cap: 22 },
    { part: "waist", cap: 14 },
    { part: "cardio", cap: 10 },
  ],
  legs: [
    { part: "upper legs", cap: 46 },
    { part: "lower legs", cap: 20 },
    { part: "waist", cap: 20 },
    { part: "cardio", cap: 12 },
    { part: "back", cap: 10 },
  ],
  upper: [
    { part: "chest", cap: 32 },
    { part: "back", cap: 34 },
    { part: "shoulders", cap: 26 },
    { part: "upper arms", cap: 24 },
    { part: "waist", cap: 12 },
  ],
  lower: [
    { part: "upper legs", cap: 44 },
    { part: "lower legs", cap: 20 },
    { part: "waist", cap: 18 },
  ],
  full: [
    { part: "chest", cap: 26 },
    { part: "back", cap: 26 },
    { part: "upper legs", cap: 30 },
    { part: "shoulders", cap: 20 },
    { part: "upper arms", cap: 18 },
    { part: "waist", cap: 16 },
    { part: "lower legs", cap: 10 },
  ],
  auto: [
    { part: "chest", cap: 26 },
    { part: "back", cap: 26 },
    { part: "upper legs", cap: 30 },
    { part: "shoulders", cap: 20 },
    { part: "upper arms", cap: 18 },
    { part: "waist", cap: 16 },
    { part: "lower legs", cap: 10 },
  ],
  cardio: [
    { part: "cardio", cap: 34 },
    { part: "waist", cap: 16 },
    { part: "upper legs", cap: 16 },
    { part: "back", cap: 10 },
    { part: "chest", cap: 10 },
  ],
};

/**
 * The prompt catalog: exercises matching the brief's equipment,
 * shaped around the focus, canonical movements first. Sized to
 * stay comfortable inside free-tier context/TPM budgets (~230
 * rows ≈ ~3K tokens) while covering every slot a good plan needs.
 */
export function buildCatalog(brief: Pick<RoutineBrief, "equipment" | "focus">): ExerciseRecord[] {
  const allowed = EQUIPMENT_WHITELIST[brief.equipment];
  const parts = FOCUS_PARTS[brief.focus];
  const out: ExerciseRecord[] = [];
  for (const { part, cap } of parts) {
    const pool = EXERCISES.filter(
      (e) => e.bodyPart === part && allowed.has(e.equipment)
    );
    // canonical first: no junk, compound, short name, then A-Z
    pool.sort((a, b) => {
      const ja = JUNK_RE.test(norm(a.name)) ? 1 : 0;
      const jb = JUNK_RE.test(norm(b.name)) ? 1 : 0;
      if (ja !== jb) return ja - jb;
      const ca = COMPOUND_RE.test(norm(a.name)) ? 0 : 1;
      const cb = COMPOUND_RE.test(norm(b.name)) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return a.name.length - b.name.length || a.name.localeCompare(b.name);
    });
    out.push(...pool.slice(0, cap));
  }
  return out;
}

/** Render the catalog as compact prompt lines: "CHEST: a · b · c". */
export function catalogPrompt(catalog: ExerciseRecord[]): string {
  const byPart = new Map<string, ExerciseRecord[]>();
  for (const e of catalog) {
    const list = byPart.get(e.bodyPart) ?? [];
    list.push(e);
    byPart.set(e.bodyPart, list);
  }
  return [...byPart.entries()]
    .map(
      ([part, list]) =>
        `${part.toUpperCase()}: ${list.map((e) => e.name).join(" · ")}`
    )
    .join("\n");
}

// ----------------------------------------------------- name matching ----

/**
 * Map a model-produced exercise name onto a real catalog row.
 * Exact (normalized) → containment either way → token-overlap
 * with a minimum evidence bar. Always scoped to the catalog so
 * equipment compliance survives even fuzzy matches.
 */
export function matchLibraryExercise(
  name: string,
  scope: ExerciseRecord[]
): ExerciseRecord | null {
  const q = norm(name);
  if (!q) return null;

  // 1. exact normalized name
  const exact = scope.find((e) => norm(e.name) === q);
  if (exact) return exact;

  // 2. containment (either direction) — "dumbbell curl" →
  //    "dumbbell biceps curl", "the barbell bench press" → …
  const contains = scope.find((e) => {
    const n = norm(e.name);
    return n.includes(q) || q.includes(n);
  });
  if (contains) return contains;

  // 3. token overlap — "wide grip lat pulldown on cable" keeps
  //    enough shared tokens with "cable lat pulldown full range
  //    of motion" to resolve
  const qTokens = q.split(" ").filter((t) => t.length > 2);
  if (qTokens.length === 0) return null;
  let best: ExerciseRecord | null = null;
  let bestScore = 0;
  for (const e of scope) {
    const eTokens = new Set(norm(e.name).split(" "));
    let score = 0;
    for (const t of qTokens) if (eTokens.has(t)) score += t.length;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  // needs real evidence: ≥ 2 tokens or ≥ 7 chars of overlap
  return bestScore >= 7 ? best : null;
}

// ------------------------------------------------------ est minutes ----

/** Σ sets × (40 s work + rest) + 8 min warm-up/cooldown, clamped. */
export function estimatePlanMinutes(
  exercises: Pick<PlanExercise, "sets" | "restSec">[]
): number {
  let seconds = 8 * 60;
  for (const ex of exercises) seconds += ex.sets * (40 + ex.restSec);
  return Math.min(150, Math.max(20, Math.round(seconds / 60 / 5) * 5));
}

// --------------------------------------------------------- templates ----

interface FloorSlot {
  /** name keyword — first match wins */
  kw: string;
  part: string;
  /** per-tier body-part override (chin-up lives under back, not arms) */
  partByTier?: Partial<Record<RoutineEquipment, string>>;
  /** variant markers to skip ("one arm", "pov", …) */
  avoid?: string[];
  /** tier-specific keyword override (e.g. dumbbell variant at home) */
  kwByTier?: Partial<Record<RoutineEquipment, string>>;
  /** only include this slot for these tiers */
  tiers?: RoutineEquipment[];
  sets: number;
  /** rep range; null = timed */
  reps: [number, number] | null;
  /** timed duration (used when reps is null) */
  durationSec?: number;
  restSec: number;
  rpe?: number;
  note: string;
}

/** Shared core-finisher slot — declared before the templates that spread it. */
const CORE_SLOT_TEMPLATE: FloorSlot = {
  kw: "russian twist",
  part: "waist",
  avoid: ["assisted", "band", "cable", "medicine", "weighted"],
  sets: 3, reps: [15, 20], restSec: 45, rpe: 8,
  note: "Rotational core — controlled, no flailing.",
};

const PUSH_SLOTS: FloorSlot[] = [
  {
    kw: "bench press",
    kwByTier: { home: "dumbbell bench press", bodyweight: "push-up" },
    part: "chest",
    avoid: ["decline", "incline", "one arm", "band", "close grip", "reverse", "smith", "alternative", "plyo"],
    sets: 4, reps: [6, 8], restSec: 180, rpe: 8,
    note: "Main compound — when you hit the top of the range on every set, add weight.",
  },
  {
    kw: "incline",
    kwByTier: { bodyweight: "decline push-up" },
    part: "chest",
    avoid: ["one arm", "band", "cable", "lever", "smith", "close grip", "reverse", "fly", "dumbbell"],
    tiers: ["gym", "bodyweight"],
    sets: 3, reps: [8, 10], restSec: 120, rpe: 8,
    note: "Upper-chest focus — control the lowering, 2-3 s down.",
  },
  {
    kw: "fly",
    part: "chest",
    avoid: ["one arm", "exercise ball", "crossover", "cable", "band", "reverse", "decline", "twist", "incline", "stability", "wheel"],
    tiers: ["home"],
    sets: 3, reps: [10, 12], restSec: 90, rpe: 8,
    note: "Fly for a deep chest stretch — lighten up, feel the muscle.",
  },
  {
    kw: "shoulder press",
    kwByTier: { bodyweight: "decline push-up" },
    part: "shoulders",
    partByTier: { bodyweight: "chest" },
    avoid: ["one arm", "band", "parallel", "v. 2", "alternate", "kettlebell"],
    sets: 3, reps: [8, 10], restSec: 120, rpe: 8,
    note: "Press tall, ribs down — no leaning back.",
  },
  {
    kw: "lateral raise",
    part: "shoulders",
    avoid: ["one arm", "front", "incline", "rear", "full can", "cable", "band", "landmine"],
    tiers: ["gym", "home"],
    sets: 3, reps: [12, 15], restSec: 60, rpe: 9,
    note: "Isolation volume for side delts — light, strict, no swinging.",
  },
  {
    kw: "pushdown",
    kwByTier: { home: "triceps extension", bodyweight: "dip" },
    part: "upper arms",
    avoid: ["one arm", "rope", "reverse", "v-bar", "arm blaster", "assisted", "band", "towel", "kettlebell", "bench", "exercise", "impossible", "lever", "ring", "knees", "floor", "parallel"],
    sets: 3, reps: [10, 12], restSec: 75, rpe: 8,
    note: "Triceps pushdown — elbows pinned to your sides.",
  },
  {
    kw: "triceps extension",
    part: "upper arms",
    avoid: ["one arm", "assisted", "band", "towel", "rope", "kneeling", "side", "lying", "decline", "incline", "pronate", "supinate", "forward lunge", "on bench", "v. 2", "alternate", "bent over", "seated", "dumbbells"],
    tiers: ["gym", "home"],
    sets: 2, reps: [12, 15], restSec: 60, rpe: 9,
    note: "Overhead position stretches the long head — full range.",
  },
  {
    ...CORE_SLOT_TEMPLATE,
    tiers: ["bodyweight"],
  },
];

const PULL_SLOTS: FloorSlot[] = [
  {
    kw: "deadlift",
    kwByTier: { home: "romanian deadlift" },
    part: "upper legs",
    avoid: ["romanian", "stiff", "straight", "one arm", "sumo", "band", "dumbbell", "kettlebell", "deficit", "snatch"],
    tiers: ["gym", "home"],
    sets: 4, reps: [4, 6], restSec: 240, rpe: 8,
    note: "Heavy hinge — brace, push the floor away, bar close to your legs.",
  },
  {
    kw: "pulldown",
    kwByTier: { bodyweight: "pull-up" },
    part: "back",
    avoid: ["band", "one arm", "rope", "cross", "alternate", "close grip", "underhand", "twin", "reverse", "rocky"],
    tiers: ["gym", "bodyweight"],
    sets: 3, reps: [8, 10], restSec: 120, rpe: 8,
    note: "Vertical pull — drive elbows toward your hips.",
  },
  {
    kw: "seated row",
    part: "back",
    avoid: ["one arm", "twisting", "band", "v-bar"],
    tiers: ["gym"],
    sets: 3, reps: [10, 12], restSec: 105, rpe: 8,
    note: "Horizontal pull for mid-back thickness — squeeze 1 s.",
  },
  {
    kw: "bent-over row",
    part: "back",
    avoid: ["lever", "v-bar"],
    tiers: ["gym", "home"],
    sets: 3, reps: [8, 10], restSec: 120, rpe: 8,
    note: "Row to the lower ribs, flat back.",
  },
  {
    kw: "curl",
    kwByTier: { bodyweight: "chin-up" },
    part: "upper arms",
    partByTier: { bodyweight: "back" },
    avoid: ["one arm", "band", "alternate", "concentration", "overhead", "preacher", "incline", "lying", "prone", "arm blaster", "close grip", "seated", "drag", "v. 2", "hammer", "wide grip", "inner", "lateral", "low pulley", "high pulley", "high curl", "low curl", "cross", " EZ ", "stability"],
    sets: 3, reps: [10, 12], restSec: 60, rpe: 9,
    note: "No body english — control the negative.",
  },
  {
    kw: "rear lateral raise",
    part: "shoulders",
    avoid: ["one arm", "incline"],
    tiers: ["gym", "home"],
    sets: 2, reps: [12, 15], restSec: 60, rpe: 9,
    note: "Rear delts — the mirror muscles everyone forgets.",
  },
  {
    kw: "leg raise",
    part: "waist",
    avoid: ["assisted", "lying", "band", "barbell", "sitted", "captains", "throw", "hip", "seated"],
    tiers: ["bodyweight"],
    sets: 3, reps: [10, 12], restSec: 75, rpe: 8,
    note: "Hanging work grip and core together.",
  },
  { ...CORE_SLOT_TEMPLATE },
];

const LEG_SLOTS: FloorSlot[] = [
  {
    kw: "squat",
    kwByTier: { home: "dumbbell squat", bodyweight: "squat to overhead" },
    part: "upper legs",
    avoid: ["band", "split", "bosu", "one arm", "front", "zercher", "hack", "bench", "sumo", "sissy", "pov", "jump", "wall", "smith", "landmine", "bodyweight", "kettlebell", "leg press", "pistol", "curtsey", "drop", "potty", "twist", "suspended", "jerk", "snatch"],
    sets: 4, reps: [6, 8], restSec: 210, rpe: 8,
    note: "The king — depth to at least parallel, drive through mid-foot.",
  },
  {
    kw: "romanian deadlift",
    kwByTier: { bodyweight: "glute bridge" },
    part: "upper legs",
    avoid: ["one arm", "band", "stiff", "march", "bench", "male", "female", "two legs", "ham", "kettlebell"],
    sets: 3, reps: [8, 10], restSec: 150, rpe: 8,
    note: "Hamstring hinge — hips back, soft knees, feel the stretch.",
  },
  {
    kw: "lunge",
    part: "upper legs",
    avoid: ["band", "one arm", "weighted", "swing", "barbell", "reverse", "side", "front", "step", "kettlebell", "bosu", "dumbbell squat", "jump", "male", "female", "curtsey", "twisting"],
    sets: 3, reps: [10, 12], restSec: 120, rpe: 8,
    note: "One leg at a time — fixes imbalances, builds glutes.",
  },
  {
    kw: "leg extension",
    part: "upper legs",
    avoid: ["one leg", "resistance band", "assisted", "kettlebell"],
    tiers: ["gym"],
    sets: 3, reps: [12, 15], restSec: 75, rpe: 9,
    note: "Knee-extension isolation — 1 s squeeze at the top.",
  },
  {
    kw: "leg curl",
    part: "upper legs",
    avoid: ["assisted", "inverse", "one leg", "stability", "bosu", "kneeling", "lying", "two-one", "cable", "band", "self"],
    tiers: ["gym"],
    sets: 3, reps: [10, 12], restSec: 75, rpe: 9,
    note: "Hamstring curl — balanced against the extensions.",
  },
  {
    kw: "calf raise",
    part: "lower legs",
    avoid: ["one leg", "donkey", "weighted", "band", "seated", "smith", "reverse", "floor"],
    sets: 4, reps: [12, 15], restSec: 60, rpe: 9,
    note: "Pause 1 s stretched at the bottom — calves need time under tension.",
  },
];

const FOCUS_TEMPLATES: Record<RoutineFocus, FloorSlot[]> = {
  push: PUSH_SLOTS,
  pull: PULL_SLOTS,
  legs: [...LEG_SLOTS, { ...CORE_SLOT_TEMPLATE }],
  upper: [
    PUSH_SLOTS[0], // bench
    PULL_SLOTS[1], // pulldown
    PUSH_SLOTS[3], // shoulder press
    PULL_SLOTS[4], // curl
    PUSH_SLOTS[5], // pushdown
  ],
  lower: [LEG_SLOTS[0], LEG_SLOTS[1], LEG_SLOTS[2], LEG_SLOTS[5], { ...CORE_SLOT_TEMPLATE }],
  full: [
    LEG_SLOTS[0], // squat
    PUSH_SLOTS[0], // bench / push-up
    PULL_SLOTS[1], // pulldown / pull-up
    PUSH_SLOTS[3], // shoulder press
    { ...CORE_SLOT_TEMPLATE },
  ],
  auto: [
    LEG_SLOTS[0],
    PUSH_SLOTS[0],
    PULL_SLOTS[1],
    PUSH_SLOTS[3],
    { ...CORE_SLOT_TEMPLATE },
  ],
  cardio: [
    {
      kw: "burpee",
      part: "cardio",
      avoid: ["dumbbell", "bosu"],
      sets: 4, reps: null, durationSec: 60, restSec: 60, rpe: 8,
      note: "Full-body conditioning burst — steady pacing.",
    },
    {
      kw: "high knee",
      part: "cardio",
      avoid: [],
      sets: 3, reps: null, durationSec: 45, restSec: 45, rpe: 7,
      note: "Quick feet, tall posture.",
    },
    {
      kw: "bear crawl",
      part: "cardio",
      avoid: [],
      sets: 3, reps: null, durationSec: 40, restSec: 60, rpe: 7,
      note: "Shoulder and core endurance — stay low.",
    },
    { ...CORE_SLOT_TEMPLATE },
  ],
};

const FOCUS_META: Record<RoutineFocus, { title: string; summary: string }> = {
  push: {
    title: "Push Power — Chest & Delts",
    summary: "Chest, shoulders and triceps, compounds first.",
  },
  pull: {
    title: "Pull Day — Back & Biceps",
    summary: "Heavy hinge plus vertical and horizontal pulling.",
  },
  legs: {
    title: "Leg Day — Quads, Hams & Glutes",
    summary: "Squat, hinge, lunge — then isolation and calves.",
  },
  upper: {
    title: "Upper Body Strength",
    summary: "Balanced push/pull upper session, compounds first.",
  },
  lower: {
    title: "Lower Body Strength",
    summary: "Squat and hinge patterns with unilateral work.",
  },
  full: {
    title: "Full-Body Session",
    summary: "One big movement per pattern, high carry-over.",
  },
  auto: {
    title: "Full-Body Session",
    summary: "One big movement per pattern, high carry-over.",
  },
  cardio: {
    title: "Conditioning & Core",
    summary: "Interval conditioning circuit with core finisher.",
  },
};

const GOAL_SCIENCE: Record<RoutineGoal, { science: string; principles: string[] }> = {
  muscle: {
    science:
      "Compound lifts first, when you are fresh, deliver the heavy mechanical tension that drives growth; the 6-12 rep range on compounds and 10-15 on isolation keeps every set within a few reps of failure — the proven hypertrophy zone. Across the week this lands most muscles at 10-20 hard sets, the volume range where growth reliably outpaces junk volume. Progress with double progression: reach the top of the rep range on every set, then add load.",
    principles: [
      "10-20 sets / muscle / week",
      "0-3 reps in reserve",
      "2× frequency / week",
      "Double progression",
    ],
  },
  strength: {
    science:
      "The main lift runs at 3-6 reps — heavy enough to train the nervous system's force output — with 3-4 minute rests so every set is quality. Accessory work in the 8-10 range builds the muscle mass that supports bigger numbers. Add a small amount of weight whenever you complete all sets at the top of the rep range.",
    principles: [
      "3-6 reps @ RPE 7-9",
      "3-4 min compound rest",
      "Progressive overload",
      "Compounds before isolation",
    ],
  },
  fatloss: {
    science:
      "Resistance training while in a calorie deficit is what preserves muscle — the training sends the 'keep this tissue' signal while the deficit removes fat. Loads stay at 6-15 reps with shorter rests to keep density high, and the conditioning finisher adds calorie burn without eating into recovery.",
    principles: [
      "Deficit + lifting = fat loss",
      "Muscle-sparing loads",
      "Density: short rests",
      "Protein 1.6-2.2 g/kg",
    ],
  },
  endurance: {
    science:
      "Moderate-load, higher-rep sets build the muscular endurance that delays fatigue, and the conditioning blocks train the heart and work capacity together. Staying 2 reps from failure keeps quality high across the whole session.",
    principles: [
      "10-20 rep sets",
      "1-2 reps in reserve",
      "Steady conditioning blocks",
    ],
  },
  health: {
    science:
      "A mix of the big movement patterns — squat, hinge, push, pull, carry — trains every major muscle group twice a week, which is all the stimulus a healthy, capable body needs. Moderate loads and reps keep joints happy and technique clean.",
    principles: [
      "All movement patterns",
      "2× frequency / week",
      "Moderate loads",
      "Consistency > intensity",
    ],
  },
};

const GOAL_REP_ADJUST: Record<RoutineGoal, (reps: [number, number], isMain: boolean) => [number, number]> = {
  muscle: (r) => r,
  strength: (r, isMain) => (isMain ? [3, 5] : [8, 10]),
  fatloss: (r) => [Math.max(10, r[0]), Math.max(15, r[1])],
  endurance: () => [12, 20],
  health: (r) => [Math.max(10, r[0]), Math.max(12, r[1])],
};

/** Resolve one template slot to a real library row for this brief. */
function pickSlot(
  slot: FloorSlot,
  brief: Pick<RoutineBrief, "equipment" | "level" | "goal">,
  isMain: boolean
): PlanExercise | null {
  const tier = brief.equipment;
  if (slot.tiers && !slot.tiers.includes(tier)) return null;
  const kw = slot.kwByTier?.[tier] ?? slot.kw;
  const part = slot.partByTier?.[tier] ?? slot.part;
  const allowed = EQUIPMENT_WHITELIST[tier];
  const pref = EQUIPMENT_PREF[tier];
  const avoid = slot.avoid ?? [];

  const candidates = EXERCISES.filter(
    (e) =>
      e.bodyPart === part &&
      allowed.has(e.equipment) &&
      norm(e.name).includes(norm(kw)) &&
      !avoid.some((a) => norm(e.name).includes(norm(a)))
  );
  // classic equipment first, then short (canonical) names.
  // Unknown equipment sorts LAST, not first (indexOf -1 trap).
  const prefIdx = (eq: string) => {
    const i = pref.indexOf(eq);
    return i === -1 ? 999 : i;
  };
  candidates.sort(
    (a, b) => prefIdx(a.equipment) - prefIdx(b.equipment) || a.name.length - b.name.length
  );
  const chosen = candidates[0];
  if (!chosen) return null;

  // level: beginners do one set fewer; advanced keep the plan
  const sets =
    brief.level === "beginner" ? Math.max(2, slot.sets - 1) : slot.sets;
  const reps =
    slot.reps == null ? null : GOAL_REP_ADJUST[brief.goal](slot.reps, isMain);

  return {
    id: chosen.id,
    n: chosen.name,
    t: chosen.target,
    e: chosen.equipment,
    sets,
    lo: reps?.[0] ?? null,
    hi: reps?.[1] ?? null,
    durationSec: slot.durationSec ?? null,
    restSec: slot.restSec,
    rpe: slot.rpe ?? null,
    note: slot.note,
  };
}

/**
 * The algorithmic floor — a classic, science-based template from
 * the bundled library, adjusted for goal / level / equipment.
 * Deterministic (same brief → same plan) and works offline.
 */
export function buildTemplatePlan(brief: RoutineBrief): RoutinePlan {
  const focus: RoutineFocus = brief.focus === "auto" ? autoFocus(brief) : brief.focus;
  const slots = FOCUS_TEMPLATES[focus];
  const exercises: PlanExercise[] = [];
  slots.forEach((slot, i) => {
    const picked = pickSlot(slot, brief, i === 0);
    if (picked && !exercises.some((e) => e.id === picked.id)) exercises.push(picked);
  });

  const meta = FOCUS_META[focus];
  const goalSci = GOAL_SCIENCE[brief.goal];
  return {
    title: meta.title,
    focusSummary: meta.summary,
    science: goalSci.science,
    principles: goalSci.principles,
    warmup: [
      "5 min easy cardio — bike, row or brisk walk",
      "Dynamic mobility: arm circles, leg swings, hip openers",
      "First exercise: 2 light ramp-up sets",
    ],
    cooldown: [
      "5 min easy walk to bring the heart rate down",
      "Stretch today's main muscle groups 30 s each",
    ],
    exercises,
    estMinutes: estimatePlanMinutes(exercises),
    goal: brief.goal,
    level: brief.level,
    equipment: brief.equipment,
    focus,
    daysPerWeek: brief.daysPerWeek,
  };
}

/** Auto-pick a focus from days/week: 2-3 → full body, 4 → upper/lower, 5-6 → PPL. */
function autoFocus(brief: Pick<RoutineBrief, "daysPerWeek">): RoutineFocus {
  if (brief.daysPerWeek <= 3) return "full";
  if (brief.daysPerWeek === 4) return "upper";
  return "push";
}
