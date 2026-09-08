// ============================================================
// Dayflow — mock data provider
//
// Generates a realistic 7-day tracking history tailored to the
// demo profile: workouts, job time, personal project time,
// sleep, water, and meals. Deterministic per dateKey so the
// dataset is stable across renders and identical after export.
//
// This module is the ONLY source of mock data. When the Supabase
// provider lands (see /supabase/schema.sql), the store swaps
// this seed for rows fetched from the database.
// ============================================================

import type { Category, DayflowData, TrackEvent, WaterEntry } from "./types";

// ---------- date helpers ----------

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const dateToKey = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const keyToDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const keyForOffset = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return dateToKey(d);
};

// ---------- deterministic RNG (mulberry32 seeded by dateKey) ----------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string) {
  let a = hashString(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, arr: T[]): T =>
  arr[Math.floor(r() * arr.length)];

// ---------- default categories ----------

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "work", name: "Work", colorHex: "#8BAAFF", icon: "briefcase", order: 0, kind: "time", isSystem: true },
  { id: "personal", name: "Personal work", colorHex: "#B984FF", icon: "laptop", order: 1, kind: "time", isSystem: true },
  { id: "fitness", name: "Fitness", colorHex: "#FF706B", icon: "dumbbell", order: 2, kind: "time", isSystem: true },
  { id: "meals", name: "Meals", colorHex: "#F6BE74", icon: "utensils", order: 3, kind: "time", isSystem: true },
  { id: "sleep", name: "Sleep", colorHex: "#6E66D4", icon: "moon", order: 4, kind: "time", isSystem: true },
  { id: "water", name: "Water", colorHex: "#56CFEE", icon: "glass-water", order: 5, kind: "counter", isSystem: true },
  { id: "leisure", name: "Leisure", colorHex: "#88E5DF", icon: "coffee", order: 6, kind: "time" },
];

// ---------- pools ----------

const WORK_BLOCKS = [
  "Deep work — Q3 roadmap spec",
  "Client sync & demo prep",
  "Deep work — payments API refactor",
  "Team standup & sprint board",
  "Code review & mentoring",
  "Deep work — dashboard metrics",
  "Design review with the team",
  "Bug triage & hotfix",
  "Deep work — onboarding flow",
  "1:1s & roadmap notes",
];

const PERSONAL_BLOCKS = [
  "Side project — portfolio site",
  "Course — systems design",
  "Side project — budgeting app",
  "Blog writing",
  "Course — advanced TypeScript",
  "Freelance — cafe landing page",
  "Side project — CLI tool",
];

const WORKOUTS = [
  { title: "Gym — upper body push", note: "Bench 5×5, rows, shoulder press. Felt strong." },
  { title: "Gym — lower body strength", note: "Squats 5×5, RDLs, lunges. Heavy but clean." },
  { title: "Run — 5k easy pace", note: "Easy zone-2 loop around the park. 28:40." },
  { title: "HIIT class", note: "45-minute circuits — soaked." },
  { title: "Swim — 1 km freestyle", note: "Smooth laps, focused on breathing." },
  { title: "Gym — pull day", note: "Pull-ups, lat pulldown, curls." },
  { title: "Cycling — 20 km loop", note: "Evening ride along the river." },
  { title: "Yoga & mobility", note: "Full-body flow, hips focus." },
];

const MEALS = {
  breakfast: [
    "Breakfast — oats, berries & espresso",
    "Breakfast — eggs, sourdough & fruit",
    "Breakfast — yogurt, granola & honey",
  ],
  lunch: [
    "Lunch — chicken grain bowl",
    "Lunch — shawarma wrap & salad",
    "Lunch — lentil soup & bread",
  ],
  dinner: [
    "Dinner — salmon, greens & rice",
    "Dinner — pasta with roasted veg",
    "Dinner — stir-fry & noodles",
    "Dinner — grilled chicken & potatoes",
  ],
  snack: ["Snack — yogurt & walnuts", "Snack — banana & peanut butter"],
};

const LEISURE = [
  "Walk + podcast",
  "Reading — sci-fi novel",
  "Gaming with friends",
  "Family video call",
  "Meal prep & music",
  "Stretching & music",
];

const SLEEP_NOTES = [
  "Lights out around 11. Solid night.",
  "Fell asleep fast, woke once briefly.",
  "Read before bed — deep sleep.",
  "Slightly late night, still rested.",
];

const WATER_TIMES = ["08:05", "09:40", "11:10", "12:35", "14:05", "15:40", "17:05", "19:10", "20:45"];

// ---------- day template ----------

interface EvSpec {
  categoryId: string;
  title: string;
  start: string;
  end: string;
  notes?: string;
}

/** Build the full event list for one dateKey. */
function eventsForKey(dateKey: string): TrackEvent[] {
  const r = rng(dateKey);
  const dow = keyToDate(dateKey).getDay(); // 0 Sun .. 6 Sat
  const isWeekend = dow === 0 || dow === 6;
  const isWorkoutDay = [1, 3, 5, 6].includes(dow); // Mon / Wed / Fri / Sat
  const spec: EvSpec[] = [];

  // ---- sleep: attributed to the wake-up day, start > end means overnight
  const sleepStart = isWeekend ? "23:45" : `23:${pad2(Math.floor(r() * 60))}`;
  const wakeMin = (isWeekend ? 8 : 6) * 60 + 30 + Math.floor(r() * 26);
  const sleepEnd = `${pad2(Math.floor(wakeMin / 60))}:${pad2(wakeMin % 60)}`;
  spec.push({
    categoryId: "sleep",
    title: "Sleep",
    start: sleepStart,
    end: sleepEnd,
    notes: pick(r, SLEEP_NOTES),
  });

  // ---- breakfast
  const bkfMin = wakeMin + 55 + Math.floor(r() * 20);
  spec.push({
    categoryId: "meals",
    title: pick(r, MEALS.breakfast),
    start: `${pad2(Math.floor(bkfMin / 60))}:${pad2(bkfMin % 60)}`,
    end: `${pad2(Math.floor((bkfMin + 25) / 60))}:${pad2((bkfMin + 25) % 60)}`,
  });

  if (isWeekend) {
    // ---- weekend: brunch, errands, longer personal time
    if (isWorkoutDay) {
      const w = pick(r, WORKOUTS);
      spec.push({ categoryId: "fitness", title: w.title, start: "10:30", end: "11:30", notes: w.note });
    }
    spec.push({ categoryId: "leisure", title: pick(r, LEISURE), start: "12:00", end: "13:00" });
    spec.push({ categoryId: "meals", title: "Brunch — eggs & pancakes", start: "13:10", end: "13:45" });
    spec.push({ categoryId: "personal", title: pick(r, PERSONAL_BLOCKS), start: "15:00", end: "17:00", notes: "Weekend deep-dive on the side project." });
    spec.push({ categoryId: "leisure", title: pick(r, LEISURE), start: "17:10", end: "18:10" });
    spec.push({ categoryId: "meals", title: pick(r, MEALS.dinner), start: "19:30", end: "20:10" });
    if (r() > 0.5) {
      spec.push({ categoryId: "personal", title: "Weekly review & planning", start: "20:30", end: "21:00", notes: "Skimmed the week's stats and set next week's targets." });
    }
  } else {
    // ---- weekdays: work blocks with breaks, evening workout on gym days
    spec.push({ categoryId: "work", title: pick(r, WORK_BLOCKS), start: "09:00", end: "10:45" });
    spec.push({ categoryId: "leisure", title: pick(r, LEISURE), start: "10:45", end: "11:05" });
    spec.push({ categoryId: "work", title: pick(r, WORK_BLOCKS), start: "11:05", end: "12:25" });
    spec.push({ categoryId: "meals", title: pick(r, MEALS.lunch), start: "12:35", end: "13:10" });
    spec.push({ categoryId: "work", title: pick(r, WORK_BLOCKS), start: "13:30", end: "15:20" });
    spec.push({ categoryId: "leisure", title: pick(r, LEISURE), start: "15:20", end: "15:40" });
    if (r() > 0.6) {
      spec.push({ categoryId: "meals", title: pick(r, MEALS.snack), start: "15:40", end: "15:55" });
      spec.push({ categoryId: "work", title: pick(r, WORK_BLOCKS), start: "15:55", end: "17:25" });
    } else {
      spec.push({ categoryId: "work", title: pick(r, WORK_BLOCKS), start: "15:40", end: "17:25" });
    }

    if (isWorkoutDay) {
      const w = pick(r, WORKOUTS);
      spec.push({ categoryId: "fitness", title: w.title, start: "18:00", end: "19:00", notes: w.note });
    } else if (r() > 0.55) {
      spec.push({ categoryId: "fitness", title: "Walk — 40 min", start: "18:15", end: "18:55", notes: "Recovery walk, easy pace." });
    }

    spec.push({ categoryId: "meals", title: pick(r, MEALS.dinner), start: "19:30", end: "20:05" });

    // personal project time most evenings, 45–75 min
    const personal = r() > 0.25;
    if (personal) {
      const dur = 45 + Math.floor(r() * 3) * 15; // 45–75
      const s = 20 * 60 + 30;
      spec.push({
        categoryId: "personal",
        title: pick(r, PERSONAL_BLOCKS),
        start: `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`,
        end: `${pad2(Math.floor((s + dur) / 60))}:${pad2((s + dur) % 60)}`,
      });
    }
  }

  // evening leisure
  spec.push({ categoryId: "leisure", title: pick(r, LEISURE), start: "21:45", end: "22:35" });

  return spec.map((e, i) => ({
    id: `${dateKey}-e${i}`,
    dateKey,
    categoryId: e.categoryId,
    title: e.title,
    start: e.start,
    end: e.end,
    notes: e.notes,
  }));
}

/** Water entries for one day: 5–9 glasses spread through the day. */
function waterForKey(dateKey: string, glassMl: number): WaterEntry[] {
  const r = rng(`${dateKey}-water`);
  const count = 5 + Math.floor(r() * 5); // 5–9
  const times = [...WATER_TIMES].sort(() => r() - 0.5).slice(0, count).sort();
  return times.map((time, i) => ({
    id: `${dateKey}-w${i}`,
    dateKey,
    time,
    ml: glassMl,
  }));
}

// ---------- public seed factory ----------

/** The demo profile shown before the user customizes anything. */
export const DEFAULT_PROFILE = {
  name: "Alex Rivera",
  emoji: "🌊",
  role: "Product engineer & fitness enthusiast",
  waterGlassMl: 250,
};

export const DEFAULT_GOALS = {
  workMinutes: 420, // 7h focused job time
  personalMinutes: 90, // 1.5h side-project time
  fitnessMinutes: 45,
  fitnessSessionsPerWeek: 4,
  sleepMinutes: 480, // 8h
  waterGlasses: 8,
  mealsPerDay: 3,
};

export function makeSeed(): Pick<DayflowData, "profile" | "goals" | "categories" | "events" | "water"> {
  const events: TrackEvent[] = [];
  const water: WaterEntry[] = [];
  for (let offset = -6; offset <= 0; offset++) {
    const key = keyForOffset(offset);
    events.push(...eventsForKey(key));
    water.push(...waterForKey(key, DEFAULT_PROFILE.waterGlassMl));
  }
  return {
    profile: { ...DEFAULT_PROFILE },
    goals: { ...DEFAULT_GOALS },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    events,
    water,
  };
}
