// ============================================================
// Dayflow — pure computation layer
//
// All analytics (day totals, goal progress, weekly aggregates,
// streaks, recaps, exports) are derived here from the store
// state. Keeping this pure makes the future Supabase provider
// a drop-in swap: same shapes in, same analytics out.
// ============================================================

import type { Category, DayflowData, GoalProgress, TrackEvent, WaterEntry } from "./types";
import { keyForOffset, keyToDate, pad2 } from "./seed";

export const toMinutes = (hm: string): number => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/** Duration in minutes; end <= start means the block crosses midnight. */
export const eventDuration = (e: TrackEvent): number => {
  const s = toMinutes(e.start);
  const t = toMinutes(e.end);
  return t > s ? t - s : 24 * 60 - s + t;
};

export const isOvernight = (e: TrackEvent): boolean =>
  toMinutes(e.end) <= toMinutes(e.start);

export const fmtTime = (hm: string): string => {
  const [h, m] = hm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ampm}`;
};

export const fmtRange = (e: TrackEvent): string =>
  `${fmtTime(e.start)} – ${fmtTime(e.end)}`;

export const fmtDuration = (mins: number): string => {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
};

export const fmtHours = (mins: number): string =>
  `${(mins / 60).toFixed(1)}h`;

// ---------- selectors ----------

export const eventsForDay = (events: TrackEvent[], dateKey: string) =>
  events
    .filter((e) => e.dateKey === dateKey)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

export const waterForDay = (water: WaterEntry[], dateKey: string) =>
  water
    .filter((w) => w.dateKey === dateKey)
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

export const waterTotal = (water: WaterEntry[], dateKey: string) =>
  waterForDay(water, dateKey).reduce((s, w) => s + w.ml, 0);

export const categoryById = (categories: Category[], id: string): Category => {
  const found = categories.find((c) => c.id === id);
  if (found) return found;
  return {
    id,
    name: "Uncategorized",
    colorHex: "#A0AEC0",
    icon: "circle",
    order: 99,
    kind: "time",
  };
};

export interface CategoryTotal {
  categoryId: string;
  minutes: number;
}

export const categoryTotals = (events: TrackEvent[], dateKey: string): CategoryTotal[] => {
  const totals = new Map<string, number>();
  for (const e of eventsForDay(events, dateKey)) {
    totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + eventDuration(e));
  }
  return [...totals.entries()]
    .map(([categoryId, minutes]) => ({ categoryId, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
};

export const minutesForCategory = (events: TrackEvent[], dateKey: string, categoryId: string) =>
  categoryTotals(events, dateKey).find((t) => t.categoryId === categoryId)?.minutes ?? 0;

export const totalTracked = (events: TrackEvent[], dateKey: string) =>
  eventsForDay(events, dateKey).reduce((s, e) => s + eventDuration(e), 0);

/** Sleep is stored on the wake-up day and always crosses midnight. */
export const sleepForDay = (events: TrackEvent[], dateKey: string): TrackEvent | null => {
  const sleeps = eventsForDay(events, dateKey).filter((e) => e.categoryId === "sleep");
  return sleeps.length > 0 ? sleeps[0] : null;
};

export const sleepMinutes = (events: TrackEvent[], dateKey: string): number => {
  const s = sleepForDay(events, dateKey);
  return s ? eventDuration(s) : 0;
};

export const workoutsForDay = (events: TrackEvent[], dateKey: string) =>
  eventsForDay(events, dateKey).filter((e) => e.categoryId === "fitness");

export const mealsForDay = (events: TrackEvent[], dateKey: string) =>
  eventsForDay(events, dateKey).filter((e) => e.categoryId === "meals");

// ---------- goals ----------

export const GOAL_META: Record<GoalProgress["key"], { label: string; fallbackHex: string }> = {
  work: { label: "Work time", fallbackHex: "#8BAAFF" },
  personal: { label: "Personal work", fallbackHex: "#B984FF" },
  fitness: { label: "Fitness", fallbackHex: "#FF706B" },
  sleep: { label: "Sleep", fallbackHex: "#6E66D4" },
  water: { label: "Water", fallbackHex: "#56CFEE" },
  meals: { label: "Meals", fallbackHex: "#F6BE74" },
};

export const goalColor = (data: DayflowData, key: GoalProgress["key"]): string =>
  categoryById(data.categories, key).colorHex || GOAL_META[key].fallbackHex;

export function goalsForDay(data: DayflowData, dateKey: string): GoalProgress[] {
  const { events, water, goals, profile } = data;
  const glasses = profile.waterGlassMl > 0 ? waterTotal(water, dateKey) / profile.waterGlassMl : 0;
  const build = (
    key: GoalProgress["key"],
    done: number,
    target: number,
    unit: "min" | "count"
  ): GoalProgress => ({
    key,
    label: GOAL_META[key].label,
    done,
    target,
    unit,
    colorHex: goalColor(data, key),
    met: done >= target - (unit === "count" ? 0.25 : 1),
  });
  return [
    build("work", minutesForCategory(events, dateKey, "work"), goals.workMinutes, "min"),
    build("personal", minutesForCategory(events, dateKey, "personal"), goals.personalMinutes, "min"),
    build("fitness", minutesForCategory(events, dateKey, "fitness"), goals.fitnessMinutes, "min"),
    build("sleep", sleepMinutes(events, dateKey), goals.sleepMinutes, "min"),
    build("water", glasses, goals.waterGlasses, "count"),
    build("meals", mealsForDay(events, dateKey).length, goals.mealsPerDay, "count"),
  ];
}

// ---------- weeks ----------

export interface WeekDay {
  dateKey: string;
  label: string; // "Mon"
  dateLabel: string; // "Sep 8"
  isToday: boolean;
  isFuture: boolean;
}

/** Monday-first calendar week containing the given dateKey. */
export function weekOf(dateKey: string): WeekDay[] {
  const base = keyToDate(dateKey);
  const dow = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - dow);
  const todayKey = keyForOffset(0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    return {
      dateKey: key,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      dateLabel: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });
}

export const shiftWeek = (dateKey: string, deltaWeeks: number): string => {
  const d = keyToDate(dateKey);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const weekRangeLabel = (week: WeekDay[]): string => {
  const a = keyToDate(week[0].dateKey);
  const b = keyToDate(week[6].dateKey);
  const sameMonth = a.getMonth() === b.getMonth();
  const left = `${MONTHS_LONG[a.getMonth()]} ${a.getDate()}`;
  const right = sameMonth
    ? `${b.getDate()}, ${b.getFullYear()}`
    : `${MONTHS_LONG[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  return `${left} – ${right}`;
};

export interface DayAggregate {
  dateKey: string;
  label: string;
  dateLabel: string;
  isToday: boolean;
  isFuture: boolean;
  minutesByCategory: Record<string, number>;
  waterGlasses: number;
  sleepMinutes: number;
  totalTracked: number;
}

export function aggregateWeek(data: DayflowData, week: WeekDay[]): DayAggregate[] {
  const glassMl = data.profile.waterGlassMl || 250;
  return week.map((d) => {
    const totals = categoryTotals(data.events, d.dateKey);
    const minutesByCategory: Record<string, number> = {};
    for (const t of totals) minutesByCategory[t.categoryId] = t.minutes;
    return {
      dateKey: d.dateKey,
      label: d.label,
      dateLabel: d.dateLabel,
      isToday: d.isToday,
      isFuture: d.isFuture,
      minutesByCategory,
      waterGlasses: Math.round((waterTotal(data.water, d.dateKey) / glassMl) * 10) / 10,
      sleepMinutes: sleepMinutes(data.events, d.dateKey),
      totalTracked: totalTracked(data.events, d.dateKey),
    };
  });
}

export const weekCategoryTotals = (days: DayAggregate[]): CategoryTotal[] => {
  const totals = new Map<string, number>();
  for (const d of days) {
    for (const [cid, mins] of Object.entries(d.minutesByCategory)) {
      totals.set(cid, (totals.get(cid) ?? 0) + mins);
    }
  }
  return [...totals.entries()]
    .map(([categoryId, minutes]) => ({ categoryId, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
};

export const weekWorkoutSessions = (data: DayflowData, week: WeekDay[]) => {
  const sessions = week.flatMap((d) => workoutsForDay(data.events, d.dateKey));
  return {
    count: sessions.length,
    minutes: sessions.reduce((s, e) => s + eventDuration(e), 0),
    titles: sessions.map((e) => e.title),
  };
};

// ---------- streaks (consecutive days up to and including dateKey) ----------

export function goalStreak(data: DayflowData, key: GoalProgress["key"], endDateKey: string): number {
  let streak = 0;
  for (let offset = 0; offset >= -364; offset--) {
    const dayKey = keyForOffset(offset);
    if (dayKey > endDateKey) continue; // skip days after the end date
    const goals = goalsForDay(data, dayKey);
    const g = goals.find((x) => x.key === key);
    if (g?.met) streak++;
    else if (dayKey !== endDateKey) break; // allow today to be incomplete
    else if (!g?.met && offset === 0) {
      // today unmet: streak counts yesterday backwards
      continue;
    }
  }
  return streak;
}

// ---------- recaps & export ----------

export interface DayRecap {
  highlights: string[];
  focus: string[];
  watchouts: string[];
}

export function recapForDay(data: DayflowData, dateKey: string): DayRecap {
  const { events } = data;
  const goals = goalsForDay(data, dateKey);
  const highlights: string[] = [];
  const focus: string[] = [];
  const watchouts: string[] = [];

  const met = goals.filter((g) => g.met);
  const unmet = goals.filter((g) => !g.met);
  if (met.length > 0) {
    highlights.push(
      `Hit ${met.length} of 6 goals: ${met.map((g) => g.label.toLowerCase()).join(", ")}`
    );
  }

  const workouts = workoutsForDay(events, dateKey);
  if (workouts.length > 0) {
    const best = workouts.reduce((a, b) => (eventDuration(b) > eventDuration(a) ? b : a));
    highlights.push(`${best.title} — ${fmtDuration(eventDuration(best))}`);
  }

  const sleep = sleepForDay(events, dateKey);
  if (sleep) {
    const m = eventDuration(sleep);
    if (m >= data.goals.sleepMinutes) highlights.push(`Great night of sleep — ${fmtDuration(m)}`);
    else watchouts.push(`Sleep was ${fmtDuration(data.goals.sleepMinutes - m)} short of target`);
  }

  const longest = eventsForDay(events, dateKey)
    .filter((e) => e.categoryId === "work" || e.categoryId === "personal")
    .sort((a, b) => eventDuration(b) - eventDuration(a))[0];
  if (longest) highlights.push(`Longest focus block: ${longest.title} (${fmtDuration(eventDuration(longest))})`);

  for (const g of unmet) {
    if (g.key === "water") {
      watchouts.push(
        `Hydration ${g.done.toFixed(0)}/${g.target} glasses — ${Math.max(0, Math.ceil(g.target - g.done))} to go`
      );
    } else if (g.key === "fitness") {
      watchouts.push("No workout logged today — a 20-minute walk still counts");
    } else if (g.unit === "min") {
      watchouts.push(`${g.label}: ${fmtDuration(g.done)} of ${fmtDuration(g.target)} target`);
    } else {
      watchouts.push(`${g.label}: ${g.done}/${g.target} logged`);
    }
  }

  focus.push("Close the rings that are still open before 10 PM");
  if (!goals.find((g) => g.key === "water")?.met) focus.push("Drink a glass of water with the next break");
  const tomorrow = new Date(keyToDate(dateKey));
  tomorrow.setDate(tomorrow.getDate() + 1);
  focus.push(
    `Plan tomorrow's workout: ${
      [1, 3, 5].includes(tomorrow.getDay()) ? "gym day" : "recovery walk"
    }`
  );

  return { highlights: highlights.slice(0, 4), focus, watchouts };
}

/** Markdown export for a day, mirrors the native app's "Copy timeline". */
export function dayToMarkdown(data: DayflowData, dateKey: string): string {
  const acts = eventsForDay(data.events, dateKey);
  const date = keyToDate(dateKey);
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const lines: string[] = [`# Dayflow — ${label}`, ""];

  const sleep = sleepForDay(data.events, dateKey);
  if (sleep) {
    lines.push(`## Sleep`);
    lines.push(`**${fmtRange(sleep)}** · ${fmtDuration(eventDuration(sleep))}`);
    if (sleep.notes) lines.push("", sleep.notes);
    lines.push("");
  }

  for (const e of acts) {
    if (e.categoryId === "sleep") continue;
    const c = categoryById(data.categories, e.categoryId);
    lines.push(`## ${e.title}`);
    lines.push(`**${fmtRange(e)}** · ${fmtDuration(eventDuration(e))} · ${c.name}`);
    lines.push("");
    if (e.notes) lines.push(e.notes, "");
  }

  const waterMl = waterTotal(data.water, dateKey);
  const glasses = data.profile.waterGlassMl ? Math.round((waterMl / data.profile.waterGlassMl) * 10) / 10 : 0;
  lines.push("---", "");
  lines.push(`**Water:** ${glasses} glasses (${waterMl} ml)`);
  const totals = categoryTotals(data.events, dateKey);
  for (const t of totals) {
    const c = categoryById(data.categories, t.categoryId);
    lines.push(`**${c.name}:** ${fmtDuration(t.minutes)}`);
  }
  return lines.join("\n");
}
