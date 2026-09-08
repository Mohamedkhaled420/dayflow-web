// ============================================================
// Dayflow — data store
//
// The app is data-provider agnostic. Today it persists to
// localStorage via zustand/persist (mock mode). When Supabase
// is wired in, only this file changes: the same state shape is
// fetched from / inserted into the tables in /supabase/schema.sql
// and every action below becomes an async RPC + optimistic set.
// Views and analytics never touch storage directly.
// ============================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { Category, DayflowData, Goals, Profile, TrackEvent, WaterEntry } from "./types";
import { keyForOffset, makeSeed } from "./seed";

type NewEvent = Omit<TrackEvent, "id">;
type NewWater = Omit<WaterEntry, "id">;

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface DayflowActions {
  // events
  addEvent: (e: NewEvent) => string;
  updateEvent: (id: string, patch: Partial<TrackEvent>) => void;
  deleteEvent: (id: string) => void;
  // water
  addWater: (entry: NewWater) => void;
  deleteWater: (id: string) => void;
  removeLastWaterOfToday: () => void;
  // profile & goals
  updateProfile: (patch: Partial<Profile>) => void;
  updateGoals: (patch: Partial<Goals>) => void;
  // categories
  addCategory: (c: Omit<Category, "id" | "order">) => void;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  moveCategory: (id: string, dir: -1 | 1) => void;
  // data
  resetDemoData: () => void;
  exportJson: () => string;
}

export type DayflowStore = DayflowData & DayflowActions;

const seedState = (): Pick<DayflowStore, "profile" | "goals" | "categories" | "events" | "water"> =>
  makeSeed();

export const useDayflow = create<DayflowStore>()(
  persist(
    (set, get) => ({
      ...seedState(),

      // ---------- events ----------
      addEvent: (e) => {
        const id = uid("ev");
        set((s) => ({ events: [...s.events, { ...e, id }] }));
        return id;
      },
      updateEvent: (id, patch) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      deleteEvent: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),

      // ---------- water ----------
      addWater: (entry) => {
        const id = uid("w");
        set((s) => ({ water: [...s.water, { ...entry, id }] }));
      },
      deleteWater: (id) =>
        set((s) => ({ water: s.water.filter((w) => w.id !== id) })),
      removeLastWaterOfToday: () =>
        set((s) => {
          const today = keyForOffset(0);
          const todays = s.water.filter((w) => w.dateKey === today);
          if (todays.length === 0) return s;
          const last = todays[todays.length - 1];
          return { ...s, water: s.water.filter((w) => w.id !== last.id) };
        }),

      // ---------- profile & goals ----------
      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),
      updateGoals: (patch) => set((s) => ({ goals: { ...s.goals, ...patch } })),

      // ---------- categories ----------
      addCategory: (c) =>
        set((s) => ({
          categories: [...s.categories, { ...c, id: uid("cat"), order: s.categories.length }],
        })),
      updateCategory: (id, patch) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      deleteCategory: (id) =>
        set((s) => ({
          categories: s.categories
            .filter((c) => !(c.id === id && !c.isSystem))
            .map((c, i) => ({ ...c, order: i })),
        })),
      moveCategory: (id, dir) =>
        set((s) => {
          const sorted = [...s.categories].sort((a, b) => a.order - b.order);
          const idx = sorted.findIndex((c) => c.id === id);
          const swap = idx + dir;
          if (idx < 0 || swap < 0 || swap >= sorted.length) return s;
          [sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]];
          return { ...s, categories: sorted.map((c, i) => ({ ...c, order: i })) };
        }),

      // ---------- data ----------
      resetDemoData: () => set({ ...seedState() }),
      exportJson: () => {
        const { profile, goals, categories, events, water } = get();
        return JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            profile,
            goals,
            categories,
            events,
            water,
          },
          null,
          2
        );
      },
    }),
    {
      name: "dayflow-tracker-v1",
      version: 1,
      skipHydration: true, // rehydrated explicitly from AppShell after mount (SSR-safe)
      partialize: (s) => ({
        profile: s.profile,
        goals: s.goals,
        categories: s.categories,
        events: s.events,
        water: s.water,
      }),
    }
  )
);

/** Call once from a client effect — swaps seed state for saved state. */
export const rehydrateDayflow = async () => {
  await useDayflow.persist.rehydrate();
};

/** Convenience hook: the full data slice, re-computed on any data change. */
export const useDayflowData = (): DayflowData =>
  useDayflow(
    useShallow((s) => ({
      profile: s.profile,
      goals: s.goals,
      categories: s.categories,
      events: s.events,
      water: s.water,
    }))
  );

/** Categories sorted by order (stable reference per change). */
export const useSortedCategories = (): Category[] =>
  useDayflow(useShallow((s) => [...s.categories].sort((a, b) => a.order - b.order)));
