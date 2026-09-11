// ============================================================
// Dayflow AI — Delta Sync store (Phase 2 / PRD §2)
// ------------------------------------------------------------
// Local-first state mirrored from the Supabase schema
// (src/types/supabase.ts is the single source of truth for shapes):
//   - persists to IndexedDB via zustand/persist + idb-keyval
//   - syncDeltas(): boot-time pull of rows newer than the local
//     cursor (created_at for entities, the event column for logs),
//     merged by id; profiles.last_sync_timestamp is folded into
//     the local cursor so webhook-written rows are caught next boot.
//   - Optimistic writes: local append first, Supabase insert second;
//     failures flag the row `pending_sync` and are retried as
//     idempotent full-row upserts on the next boot.
//   - No realtime subscriptions in Phase 2 (Team Mode is Phase 3).
//
// SSR safety mirrors src/lib/store.ts: skipHydration + explicit
// rehydrate from a client effect (see bootDayflowSync).
// ============================================================

import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/types/supabase";
import { createClient as createBrowserClient } from "@/utils/supabase/client";

// ---------- types (mirror the generated Row shapes) ----------

export type ProfileRow = Tables<"profiles">;
/** Local-only divergence flag — never sent to the server. */
export interface SyncFlag {
  pending_sync?: boolean;
}
export type HabitRow = Tables<"habits"> & SyncFlag;
export type HabitLogRow = Tables<"habit_logs"> & SyncFlag;
export type HydrationLogRow = Tables<"hydration_logs"> & SyncFlag;
export type WorkoutLogRow = Tables<"workout_logs"> & SyncFlag;
export type SleepLogRow = Tables<"sleep_logs"> & SyncFlag;
export type JournalEntryRow = Tables<"journal_entries"> & SyncFlag;

// ---------- helpers ----------

const nowIso = () => new Date().toISOString();

/** RFC-4122 v4 with a fallback for non-secure contexts (PWA over http LAN). */
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The v0 browser helper returns the shared singleton; this cast gives the
 * sync engine the generated Database types WITHOUT creating a second
 * client instance or touching the frozen helper module.
 */
export function syncClient(): SupabaseClient<Database> {
  return createBrowserClient() as unknown as SupabaseClient<Database>;
}

/** Server rows win (cloud truth); local-only pending rows never collide. */
function mergeById<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return local;
  const map = new Map(local.map((r) => [r.id, r]));
  for (const row of incoming) map.set(row.id, row);
  return [...map.values()];
}

/** Chronological max of two ISO strings (handles +00:00 and Z forms). */
function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

function maxRowTimestamp<T extends { id: string }>(
  rows: T[],
  column: "created_at" | "logged_at" | "completed_at"
): string | null {
  let max: string | null = null;
  for (const row of rows) {
    const v = (row as Record<string, unknown>)[column];
    if (typeof v === "string") max = maxIso(max, v);
  }
  return max;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- IndexedDB storage adapter (idb-keyval) ----------

const idbStorage: StateStorage = {
  getItem: async (name) => {
    if (typeof indexedDB === "undefined") return null; // SSR guard
    return (await idbGet<string>(name)) ?? null;
  },
  setItem: async (name, value) => {
    if (typeof indexedDB === "undefined") return; // SSR guard
    await idbSet(name, value);
  },
  removeItem: async (name) => {
    if (typeof indexedDB === "undefined") return; // SSR guard
    await idbDel(name);
  },
};

// ---------- state / actions ----------

export interface DayflowSyncState {
  profile: ProfileRow | null;
  habits: HabitRow[];
  habitLogs: HabitLogRow[];
  hydrationLogs: HydrationLogRow[];
  workoutLogs: WorkoutLogRow[];
  sleepLogs: SleepLogRow[];
  journalEntries: JournalEntryRow[];
  /** ISO cursor: pull rows strictly newer than this next boot. */
  lastSyncCursor: string | null;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncError: string | null;
}

export interface DayflowSyncActions {
  syncDeltas: () => Promise<void>;

  addHabit: (input: {
    name: string;
    icon?: string | null;
    color?: string | null;
  }) => Promise<string | null>;
  updateHabit: (id: string, patch: Partial<TablesUpdate<"habits">>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;

  addHabitLog: (input: {
    habit_id: string;
    completed_at?: string;
    note?: string | null;
  }) => Promise<string | null>;
  addHydrationLog: (input: {
    amount_ml: number;
    logged_at?: string;
  }) => Promise<string | null>;
  addWorkoutLog: (input: {
    type: string;
    duration_minutes?: number | null;
    active_calories?: number | null;
    logged_at?: string;
  }) => Promise<string | null>;
  addSleepLog: (input: {
    sleep_minutes: number;
    resting_heart_rate?: number | null;
    logged_at?: string;
  }) => Promise<string | null>;
  addJournalEntry: (input: {
    content: string;
    mood_score?: number | null;
  }) => Promise<string | null>;
}

export type DayflowSyncStore = DayflowSyncState & DayflowSyncActions;

const initialState = (): DayflowSyncState => ({
  profile: null,
  habits: [],
  habitLogs: [],
  hydrationLogs: [],
  workoutLogs: [],
  sleepLogs: [],
  journalEntries: [],
  lastSyncCursor: null,
  lastSyncedAt: null,
  isSyncing: false,
  syncError: null,
});

/**
 * Shared optimistic-write tail: fire the Supabase insert, then either
 * bump the sync cursor (success) or flag the row pending_sync (failure).
 * The local append already happened in the calling action. Callers pass
 * a typed insert thunk (concrete table literal at the call site keeps
 * the full generated Insert typing; supabase-js cannot correlate a
 * generic table name with its Insert shape).
 */
async function settleWrite(
  row: { id: string },
  insert: () => PromiseLike<{ error: { message: string } | null }>,
  userId: string,
  onPending: () => void
): Promise<void> {
  const { error } = await insert();
  if (error) {
    onPending(); // retried as an idempotent upsert on next boot
    return;
  }
  // On Supabase success, advance the delta-sync signal (PRD §2).
  const timestamp = nowIso();
  await syncClient()
    .from("profiles")
    .update({ last_sync_timestamp: timestamp })
    .eq("id", userId);
  useDayflowStore.setState((s) => ({
    lastSyncCursor: maxIso(s.lastSyncCursor, timestamp),
  }));
}

/**
 * Retry every pending_sync row as a full-row upsert
 * (ON CONFLICT (id) DO UPDATE) — idempotent for both never-inserted
 * rows and locally-edited rows. One pass, one flag-clearing set().
 */
async function retryPendingRows(
  set: (partial: Partial<DayflowSyncState>) => void,
  get: () => DayflowSyncState
): Promise<void> {
  const supabase = syncClient();
  const cleared = {
    habits: [] as string[],
    habitLogs: [] as string[],
    hydrationLogs: [] as string[],
    workoutLogs: [] as string[],
    sleepLogs: [] as string[],
    journalEntries: [] as string[],
  };

  for (const row of get().habits.filter((r) => r.pending_sync)) {
    const { pending_sync, ...payload } = row;
    const { error } = await supabase.from("habits").upsert(payload, { onConflict: "id" });
    if (!error) cleared.habits.push(row.id);
  }
  for (const row of get().habitLogs.filter((r) => r.pending_sync)) {
    const { pending_sync, ...payload } = row;
    const { error } = await supabase.from("habit_logs").upsert(payload, { onConflict: "id" });
    if (!error) cleared.habitLogs.push(row.id);
  }
  for (const row of get().hydrationLogs.filter((r) => r.pending_sync)) {
    const { pending_sync, ...payload } = row;
    const { error } = await supabase.from("hydration_logs").upsert(payload, { onConflict: "id" });
    if (!error) cleared.hydrationLogs.push(row.id);
  }
  for (const row of get().workoutLogs.filter((r) => r.pending_sync)) {
    const { pending_sync, ...payload } = row;
    const { error } = await supabase.from("workout_logs").upsert(payload, { onConflict: "id" });
    if (!error) cleared.workoutLogs.push(row.id);
  }
  for (const row of get().sleepLogs.filter((r) => r.pending_sync)) {
    const { pending_sync, ...payload } = row;
    const { error } = await supabase.from("sleep_logs").upsert(payload, { onConflict: "id" });
    if (!error) cleared.sleepLogs.push(row.id);
  }
  for (const row of get().journalEntries.filter((r) => r.pending_sync)) {
    const { pending_sync, ...payload } = row;
    const { error } = await supabase.from("journal_entries").upsert(payload, { onConflict: "id" });
    if (!error) cleared.journalEntries.push(row.id);
  }

  const clear = <T extends { id: string; pending_sync?: boolean }>(
    rows: T[],
    ids: string[]
  ) =>
    rows.map((r) =>
      r.pending_sync && ids.includes(r.id) ? { ...r, pending_sync: undefined } : r
    );

  set({
    habits: clear(get().habits, cleared.habits),
    habitLogs: clear(get().habitLogs, cleared.habitLogs),
    hydrationLogs: clear(get().hydrationLogs, cleared.hydrationLogs),
    workoutLogs: clear(get().workoutLogs, cleared.workoutLogs),
    sleepLogs: clear(get().sleepLogs, cleared.sleepLogs),
    journalEntries: clear(get().journalEntries, cleared.journalEntries),
  });
}

/** Local session read (cached by supabase-js — no network round-trip). */
async function currentUserId(): Promise<string | null> {
  const { data } = await syncClient().auth.getSession();
  return data.session?.user.id ?? null;
}

export const useDayflowStore = create<DayflowSyncStore>()(
  persist(
    (set, get) => ({
      ...initialState(),

      // ---------- delta sync ----------
      syncDeltas: async () => {
        if (get().isSyncing) return;
        set({ isSyncing: true, syncError: null });

        const errors: string[] = [];
        const supabase = syncClient();

        // 0. Session gate — unauthenticated boots keep local state.
        const { data: authData, error: authError } = await supabase.auth.getUser();
        const userId = authData.user?.id ?? null;
        if (authError || !userId) {
          set({ isSyncing: false });
          return;
        }

        // 1. Retry rows that diverged while offline.
        try {
          await retryPendingRows(set, get);
        } catch (e) {
          errors.push(`pending retry: ${errorMessage(e)}`);
        }

        // 2. Pull deltas newer than the local cursor.
        const since = get().lastSyncCursor;
        const pulled: Partial<DayflowSyncState> = {};
        let newest = since;

        {
          let q = supabase.from("habits").select("*");
          if (since) q = q.gt("created_at", since);
          const { data, error } = await q;
          if (error) errors.push(`habits: ${error.message}`);
          else if (data) {
            pulled.habits = mergeById(get().habits, data);
            newest = maxIso(newest, maxRowTimestamp(data, "created_at"));
          }
        }
        {
          let q = supabase.from("habit_logs").select("*");
          if (since) q = q.gt("completed_at", since);
          const { data, error } = await q;
          if (error) errors.push(`habit_logs: ${error.message}`);
          else if (data) {
            pulled.habitLogs = mergeById(get().habitLogs, data);
            newest = maxIso(newest, maxRowTimestamp(data, "completed_at"));
          }
        }
        {
          let q = supabase.from("hydration_logs").select("*");
          if (since) q = q.gt("logged_at", since);
          const { data, error } = await q;
          if (error) errors.push(`hydration_logs: ${error.message}`);
          else if (data) {
            pulled.hydrationLogs = mergeById(get().hydrationLogs, data);
            newest = maxIso(newest, maxRowTimestamp(data, "logged_at"));
          }
        }
        {
          let q = supabase.from("workout_logs").select("*");
          if (since) q = q.gt("logged_at", since);
          const { data, error } = await q;
          if (error) errors.push(`workout_logs: ${error.message}`);
          else if (data) {
            pulled.workoutLogs = mergeById(get().workoutLogs, data);
            newest = maxIso(newest, maxRowTimestamp(data, "logged_at"));
          }
        }
        {
          let q = supabase.from("sleep_logs").select("*");
          if (since) q = q.gt("logged_at", since);
          const { data, error } = await q;
          if (error) errors.push(`sleep_logs: ${error.message}`);
          else if (data) {
            pulled.sleepLogs = mergeById(get().sleepLogs, data);
            newest = maxIso(newest, maxRowTimestamp(data, "logged_at"));
          }
        }
        {
          let q = supabase.from("journal_entries").select("*");
          if (since) q = q.gt("created_at", since);
          const { data, error } = await q;
          if (error) errors.push(`journal_entries: ${error.message}`);
          else if (data) {
            pulled.journalEntries = mergeById(get().journalEntries, data);
            newest = maxIso(newest, maxRowTimestamp(data, "created_at"));
          }
        }

        // 3. Profile row + the server-side cursor (webhook signal).
        {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();
          if (error) errors.push(`profiles: ${error.message}`);
          else {
            pulled.profile = data ?? null;
            if (data?.last_sync_timestamp) {
              newest = maxIso(newest, data.last_sync_timestamp);
            }
          }
        }

        set({
          ...pulled,
          lastSyncCursor: newest,
          lastSyncedAt: nowIso(),
          isSyncing: false,
          syncError: errors.length > 0 ? errors.join("; ") : null,
        });
      },

      // ---------- habits ----------
      addHabit: async (input) => {
        const userId = await currentUserId();
        if (!userId) return null;
        const row: HabitRow = {
          id: uuid(),
          user_id: userId,
          name: input.name,
          icon: input.icon ?? null,
          color: input.color ?? null,
          streak_count: 0,
          is_archived: false,
          created_at: nowIso(),
        };
        set((s) => ({ habits: [...s.habits, row] }));
        const { pending_sync, ...payload } = row;
        await settleWrite(
          row,
          () => syncClient().from("habits").insert(payload),
          userId,
          () =>
            useDayflowStore.setState((s) => ({
              habits: s.habits.map((r) => (r.id === row.id ? { ...r, pending_sync: true } : r)),
            }))
        );
        return row.id;
      },

      updateHabit: async (id, patch) => {
        set((s) => ({
          habits: s.habits.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
        const supabase = syncClient();
        const { error } = await supabase.from("habits").update(patch).eq("id", id);
        if (error) {
          // Flag for a full-row upsert retry next boot.
          set((s) => ({
            habits: s.habits.map((r) => (r.id === id ? { ...r, pending_sync: true } : r)),
          }));
        }
      },

      deleteHabit: async (id) => {
        // Pessimistic (DB cascades habit_logs): only remove locally on success.
        const supabase = syncClient();
        const { error } = await supabase.from("habits").delete().eq("id", id);
        if (!error) {
          set((s) => ({
            habits: s.habits.filter((r) => r.id !== id),
            habitLogs: s.habitLogs.filter((r) => r.habit_id !== id),
          }));
        }
      },

      // ---------- logs (optimistic) ----------
      addHabitLog: async (input) => {
        const userId = await currentUserId();
        if (!userId) return null;
        const row: HabitLogRow = {
          id: uuid(),
          habit_id: input.habit_id,
          user_id: userId,
          completed_at: input.completed_at ?? nowIso(),
          note: input.note ?? null,
          created_at: nowIso(),
        };
        set((s) => ({ habitLogs: [...s.habitLogs, row] }));
        const { pending_sync, ...payload } = row;
        await settleWrite(
          row,
          () => syncClient().from("habit_logs").insert(payload),
          userId,
          () =>
            useDayflowStore.setState((s) => ({
              habitLogs: s.habitLogs.map((r) =>
                r.id === row.id ? { ...r, pending_sync: true } : r
              ),
            }))
        );
        return row.id;
      },

      addHydrationLog: async (input) => {
        const userId = await currentUserId();
        if (!userId) return null;
        const row: HydrationLogRow = {
          id: uuid(),
          user_id: userId,
          amount_ml: input.amount_ml,
          logged_at: input.logged_at ?? nowIso(),
          created_at: nowIso(),
        };
        set((s) => ({ hydrationLogs: [...s.hydrationLogs, row] }));
        const { pending_sync, ...payload } = row;
        await settleWrite(
          row,
          () => syncClient().from("hydration_logs").insert(payload),
          userId,
          () =>
            useDayflowStore.setState((s) => ({
              hydrationLogs: s.hydrationLogs.map((r) =>
                r.id === row.id ? { ...r, pending_sync: true } : r
              ),
            }))
        );
        return row.id;
      },

      addWorkoutLog: async (input) => {
        const userId = await currentUserId();
        if (!userId) return null;
        const row: WorkoutLogRow = {
          id: uuid(),
          user_id: userId,
          type: input.type,
          duration_minutes: input.duration_minutes ?? null,
          active_calories: input.active_calories ?? null,
          logged_at: input.logged_at ?? nowIso(),
          created_at: nowIso(),
        };
        set((s) => ({ workoutLogs: [...s.workoutLogs, row] }));
        const { pending_sync, ...payload } = row;
        await settleWrite(
          row,
          () => syncClient().from("workout_logs").insert(payload),
          userId,
          () =>
            useDayflowStore.setState((s) => ({
              workoutLogs: s.workoutLogs.map((r) =>
                r.id === row.id ? { ...r, pending_sync: true } : r
              ),
            }))
        );
        return row.id;
      },

      addSleepLog: async (input) => {
        const userId = await currentUserId();
        if (!userId) return null;
        const row: SleepLogRow = {
          id: uuid(),
          user_id: userId,
          sleep_minutes: input.sleep_minutes,
          resting_heart_rate: input.resting_heart_rate ?? null,
          logged_at: input.logged_at ?? nowIso(),
          created_at: nowIso(),
        };
        set((s) => ({ sleepLogs: [...s.sleepLogs, row] }));
        const { pending_sync, ...payload } = row;
        await settleWrite(
          row,
          () => syncClient().from("sleep_logs").insert(payload),
          userId,
          () =>
            useDayflowStore.setState((s) => ({
              sleepLogs: s.sleepLogs.map((r) =>
                r.id === row.id ? { ...r, pending_sync: true } : r
              ),
            }))
        );
        return row.id;
      },

      addJournalEntry: async (input) => {
        const userId = await currentUserId();
        if (!userId) return null;
        const row: JournalEntryRow = {
          id: uuid(),
          user_id: userId,
          content: input.content,
          mood_score: input.mood_score ?? null,
          created_at: nowIso(),
        };
        set((s) => ({ journalEntries: [...s.journalEntries, row] }));
        const { pending_sync, ...payload } = row;
        await settleWrite(
          row,
          () => syncClient().from("journal_entries").insert(payload),
          userId,
          () =>
            useDayflowStore.setState((s) => ({
              journalEntries: s.journalEntries.map((r) =>
                r.id === row.id ? { ...r, pending_sync: true } : r
              ),
            }))
        );
        return row.id;
      },
    }),
    {
      name: "dayflow-sync-v1",
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true, // rehydrated explicitly after mount (SSR-safe)
      partialize: (s) => ({
        profile: s.profile,
        habits: s.habits,
        habitLogs: s.habitLogs,
        hydrationLogs: s.hydrationLogs,
        workoutLogs: s.workoutLogs,
        sleepLogs: s.sleepLogs,
        journalEntries: s.journalEntries,
        lastSyncCursor: s.lastSyncCursor,
        lastSyncedAt: s.lastSyncedAt,
      }),
    }
  )
);

let bootPromise: Promise<void> | null = null;

/**
 * Call once from a client effect after mount (SSR-safe): rehydrates the
 * IndexedDB snapshot, then pulls server deltas. Idempotent per page load;
 * failures surface through `syncError`, never as rejections.
 */
export function bootDayflowSync(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      try {
        await useDayflowStore.persist.rehydrate();
      } catch {
        // Corrupted storage: start fresh — the delta pull repopulates.
      }
      try {
        await useDayflowStore.getState().syncDeltas();
      } catch {
        // syncDeltas swallows its own errors; guard the boot path anyway.
      }
    })();
  }
  return bootPromise;
}
