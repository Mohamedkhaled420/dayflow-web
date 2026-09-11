// ============================================================
// Dayflow — date helpers + the fixed system category set
//
// The mock data provider (makeSeed / eventsForKey / waterForKey)
// was deleted with the legacy local-only store in Phase 5 T0:
// every view now reads server-backed rows derived in
// src/lib/viewmodel.ts. What remains here is the date-key layer
// every selector depends on, plus the system category set
// (presentation data sourced from the palette module).
// ============================================================

import type { Category } from "./types";
import { CATEGORY_COLORS } from "@/styles/palette";

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

// ---------- default categories ----------

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "work", name: "Work", colorHex: CATEGORY_COLORS.work, icon: "briefcase", order: 0, kind: "time", isSystem: true },
  { id: "personal", name: "Personal work", colorHex: CATEGORY_COLORS.personal, icon: "laptop", order: 1, kind: "time", isSystem: true },
  { id: "fitness", name: "Fitness", colorHex: CATEGORY_COLORS.fitness, icon: "dumbbell", order: 2, kind: "time", isSystem: true },
  { id: "meals", name: "Meals", colorHex: CATEGORY_COLORS.meals, icon: "utensils", order: 3, kind: "time", isSystem: true },
  { id: "sleep", name: "Sleep", colorHex: CATEGORY_COLORS.sleep, icon: "moon", order: 4, kind: "time", isSystem: true },
  { id: "water", name: "Water", colorHex: CATEGORY_COLORS.water, icon: "glass-water", order: 5, kind: "counter", isSystem: true },
  { id: "leisure", name: "Leisure", colorHex: CATEGORY_COLORS.leisure, icon: "coffee", order: 6, kind: "time" },
];
