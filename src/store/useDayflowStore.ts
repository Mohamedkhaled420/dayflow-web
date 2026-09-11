// ============================================================
// Dayflow AI — Delta Sync store (Phase 2 / PRD §2, Team slice Phase 3)
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
//   - Team slice (Phase 3): team + teammate activity state lives in
//     memory only (never persisted — it is realtime data); habit
//     completions broadcast STATUS-ONLY events to team_activities,
//     and the /team page subscribes to the postgres_changes channel
//     for presence pulses.
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
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "@/types/supabase";

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
export type TeamRow = Tables<"teams">;
export type TeamActivityRow = Tables<"team_activities">;
export type TeamInviteRow = Tables<"team_invites">;

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
 * Deferred Supabase browser client (Phase 4 bundle diet).
 *
 * The supabase-js browser chunk (~42KB gzipped) is dynamically
 * imported on the first SYNC use — after first paint — instead of
 * riding the initial JS payload. The singleton promise is cached so
 * every caller still shares one client instance, and the cast gives
 * the sync engine the generated Database types exactly as before.
 */
let browserClientPromise: Promise<SupabaseClient<Database>> | null = null;

export function syncClient(): Promise<SupabaseClient<Database>> {
  if (!browserClientPromise) {
    browserClientPromise = import("@/utils/supabase/client").then(
      ({ createClient }) => createClient() as unknown as SupabaseClient<Database>
    );
  }
  return browserClientPromise;
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
  /** Team slice (Phase 3) — in-memory only, never persisted. */
  team: TeamRow | null;
  teamActivities: TeamActivityRow[];
  incomingInvites: TeamInviteRow[];
  sentInvites: TeamInviteRow[];
  teamLoaded: boolean;
  /** ISO cursor: pull rows strictly newer than this next boot. */
  lastSyncCursor: string | null;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncError: string | null;
}

export interface DayflowSyncActions {
  syncDeltas: () => Promise<void>;

  /** Settings (Phase 5 T0): merge + persist profile JSONB sections. */
  updateProfileSections: (sections: {
    identity?: Json;
    chronobiology?: Json;
    occupational_context?: Json;
    metabolism?: Json;
  }) => Promise<void>;

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

  // ---------- log mutations (Phase 5 T0: timeline editing/drag) ----------
  /** Update a sleep row (duration / wake time) — optimistic, reverts on failure. */
  updateSleepLog: (id: string, patch: Partial<TablesUpdate<"sleep_logs">>) => Promise<boolean>;
  /** Update a workout row (type / start / duration) — optimistic, reverts on failure. */
  updateWorkoutLog: (id: string, patch: Partial<TablesUpdate<"workout_logs">>) => Promise<boolean>;
  /** Remove a hydration row ("Undo last glass") — optimistic, restores on failure. */
  deleteHydrationLog: (id: string) => Promise<boolean>;
  /** Remove a sleep row — optimistic, restores on failure. */
  deleteSleepLog: (id: string) => Promise<boolean>;
  /** Remove a workout row — optimistic, restores on failure. */
  deleteWorkoutLog: (id: string) => Promise<boolean>;

  // ---------- team slice (Phase 3) ----------
  /** Full team page load: team row + invites + recent activities. */
  loadTeam: () => Promise<void>;
  /** Boot-time light load: just the teams row (enables broadcasts). */
  ensureTeamSummary: () => Promise<void>;
  /** Re-fetch recent team_activities (after sends / channel events). */
  loadTeamActivities: () => Promise<void>;
  createTeamInvite: (email: string) => Promise<boolean>;
  acceptTeamInvite: (inviteId: string) => Promise<boolean>;
  sendTeamPraise: (message: string) => Promise<void>;
  /** RPC upsert of the one presence row per user (0007). */
  pulseTeamPresence: () => Promise<void>;
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
  team: null,
  teamActivities: [],
  incomingInvites: [],
  sentInvites: [],
  teamLoaded: false,
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
  const supabase = await syncClient();
  await supabase
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
  const supabase = await syncClient();
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
  const supabase = await syncClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Shared success tail for update/delete writes (cursor advance). */
async function bumpSyncCursor(userId: string): Promise<void> {
  const timestamp = nowIso();
  const supabase = await syncClient();
  await supabase
    .from("profiles")
    .update({ last_sync_timestamp: timestamp })
    .eq("id", userId);
  useDayflowStore.setState((s) => ({
    lastSyncCursor: maxIso(s.lastSyncCursor, timestamp),
  }));
}

/**
 * Fire-and-forget Team Mode broadcast (Phase 3). Inserts into
 * team_activities under the existing member-INSERT policy (0002).
 * Failures are swallowed — a broadcast is a signal, never source of
 * truth, and must not block the user's own write path. Payloads are
 * STATUS ONLY: habit names, notes, and journal content never ride
 * this channel (journal privacy wall, PRD §2).
 */
async function broadcastTeamActivity(
  activityType: string,
  payload: Json
): Promise<void> {
  try {
    const { team } = useDayflowStore.getState();
    const userId = await currentUserId();
    if (!team || !userId) return;
    const supabase = await syncClient();
    await supabase
      .from("team_activities")
      .insert({
        team_id: team.id,
        user_id: userId,
        activity_type: activityType,
        payload,
      });
  } catch {
    // Silent by design (see docblock).
  }
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
        const supabase = await syncClient();

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

      // ---------- profile sections (Settings, Phase 5 T0) ----------

      updateProfileSections: async (sections) => {
        const userId = await currentUserId();
        if (!userId) return;
        // Optimistic local merge (server row wins on next delta pull).
        const before = get().profile;
        const merged = before
          ? { ...before, ...sections }
          : ({ id: userId, ...sections, created_at: nowIso() } as ProfileRow);
        set({ profile: merged });
        const supabase = await syncClient();
        const { error } = await supabase.from("profiles").update(sections).eq("id", userId);
        if (error) {
          set({ profile: before, syncError: `profiles update: ${error.message}` });
          return;
        }
        // Same success tail as log inserts: advance the delta cursor.
        const timestamp = nowIso();
        await supabase
          .from("profiles")
          .update({ last_sync_timestamp: timestamp })
          .eq("id", userId);
        useDayflowStore.setState((s) => ({
          lastSyncCursor: maxIso(s.lastSyncCursor, timestamp),
        }));
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
          async () => {
            const supabase = await syncClient();
            return supabase.from("habits").insert(payload);
          },
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
        const supabase = await syncClient();
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
        const supabase = await syncClient();
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
          async () => {
            const supabase = await syncClient();
            return supabase.from("habit_logs").insert(payload);
          },
          userId,
          () =>
            useDayflowStore.setState((s) => ({
              habitLogs: s.habitLogs.map((r) =>
                r.id === row.id ? { ...r, pending_sync: true } : r
              ),
            }))
        );
        // Team Mode broadcast (Phase 3): STATUS ONLY — the payload carries
        // just the completion signal, never habit names or notes. Fired
        // only when the log actually landed server-side.
        const landed = !useDayflowStore
          .getState()
          .habitLogs.find((r) => r.id === row.id)?.pending_sync;
        if (landed) {
          void broadcastTeamActivity("habit", { status: "completed" });
        }
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
          async () => {
            const supabase = await syncClient();
            return supabase.from("hydration_logs").insert(payload);
          },
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
          async () => {
            const supabase = await syncClient();
            return supabase.from("workout_logs").insert(payload);
          },
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
          async () => {
            const supabase = await syncClient();
            return supabase.from("sleep_logs").insert(payload);
          },
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
          async () => {
            const supabase = await syncClient();
            return supabase.from("journal_entries").insert(payload);
          },
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

      // ---------- log mutations (Phase 5 T0) ----------

      updateSleepLog: async (id, patch) => {
        const userId = await currentUserId();
        if (!userId) return false;
        const before = get().sleepLogs.find((r) => r.id === id);
        if (!before) return false;
        set((s) => ({
          sleepLogs: s.sleepLogs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
        const supabase = await syncClient();
        const { error } = await supabase.from("sleep_logs").update(patch).eq("id", id);
        if (error) {
          set((s) => ({
            sleepLogs: s.sleepLogs.map((r) => (r.id === id ? before : r)),
            syncError: `sleep_logs update: ${error.message}`,
          }));
          return false;
        }
        void bumpSyncCursor(userId);
        return true;
      },

      updateWorkoutLog: async (id, patch) => {
        const userId = await currentUserId();
        if (!userId) return false;
        const before = get().workoutLogs.find((r) => r.id === id);
        if (!before) return false;
        set((s) => ({
          workoutLogs: s.workoutLogs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
        const supabase = await syncClient();
        const { error } = await supabase.from("workout_logs").update(patch).eq("id", id);
        if (error) {
          set((s) => ({
            workoutLogs: s.workoutLogs.map((r) => (r.id === id ? before : r)),
            syncError: `workout_logs update: ${error.message}`,
          }));
          return false;
        }
        void bumpSyncCursor(userId);
        return true;
      },

      deleteHydrationLog: async (id) => {
        const userId = await currentUserId();
        if (!userId) return false;
        const before = get().hydrationLogs.find((r) => r.id === id);
        if (!before) return false;
        set((s) => ({ hydrationLogs: s.hydrationLogs.filter((r) => r.id !== id) }));
        const supabase = await syncClient();
        const { error } = await supabase.from("hydration_logs").delete().eq("id", id);
        if (error) {
          set((s) => ({
            hydrationLogs: [...s.hydrationLogs, before],
            syncError: `hydration_logs delete: ${error.message}`,
          }));
          return false;
        }
        void bumpSyncCursor(userId);
        return true;
      },

      deleteSleepLog: async (id) => {
        const userId = await currentUserId();
        if (!userId) return false;
        const before = get().sleepLogs.find((r) => r.id === id);
        if (!before) return false;
        set((s) => ({ sleepLogs: s.sleepLogs.filter((r) => r.id !== id) }));
        const supabase = await syncClient();
        const { error } = await supabase.from("sleep_logs").delete().eq("id", id);
        if (error) {
          set((s) => ({
            sleepLogs: [...s.sleepLogs, before],
            syncError: `sleep_logs delete: ${error.message}`,
          }));
          return false;
        }
        void bumpSyncCursor(userId);
        return true;
      },

      deleteWorkoutLog: async (id) => {
        const userId = await currentUserId();
        if (!userId) return false;
        const before = get().workoutLogs.find((r) => r.id === id);
        if (!before) return false;
        set((s) => ({ workoutLogs: s.workoutLogs.filter((r) => r.id !== id) }));
        const supabase = await syncClient();
        const { error } = await supabase.from("workout_logs").delete().eq("id", id);
        if (error) {
          set((s) => ({
            workoutLogs: [...s.workoutLogs, before],
            syncError: `workout_logs delete: ${error.message}`,
          }));
          return false;
        }
        void bumpSyncCursor(userId);
        return true;
      },

      // ---------- team slice (Phase 3) ----------

      ensureTeamSummary: async () => {
        const userId = await currentUserId();
        if (!userId) return;
        const supabase = await syncClient();
        const { data } = await supabase
          .from("teams")
          .select("*")
          .or(`member_a.eq.${userId},member_b.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        useDayflowStore.setState({ team: data ?? null });
      },

      loadTeamActivities: async () => {
        const team = get().team;
        if (!team) {
          useDayflowStore.setState({ teamActivities: [] });
          return;
        }
        const supabase = await syncClient();
        const { data } = await supabase
          .from("team_activities")
          .select("*")
          .eq("team_id", team.id)
          .order("timestamp", { ascending: false })
          .limit(60);
        if (data) useDayflowStore.setState({ teamActivities: data });
      },

      loadTeam: async () => {
        const userId = await currentUserId();
        if (!userId) return;
        await get().ensureTeamSummary();
        // RLS splits pending invites into mine-sent vs addressed-to-me
        // automatically (0002 + 0008 recipient/inviter policies).
        const supabase = await syncClient();
        const { data: invites } = await supabase
          .from("team_invites")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: false });
        const all = invites ?? [];
        useDayflowStore.setState({
          sentInvites: all.filter((i) => i.inviter_id === userId),
          incomingInvites: all.filter((i) => i.inviter_id !== userId),
        });
        await get().loadTeamActivities();
        useDayflowStore.setState({ teamLoaded: true });
      },

      createTeamInvite: async (email) => {
        const userId = await currentUserId();
        if (!userId) return false;
        const clean = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return false;
        const supabase = await syncClient();
        const { error } = await supabase
          .from("team_invites")
          .insert({ inviter_id: userId, invitee_email: clean });
        if (error) return false;
        await get().loadTeam();
        return true;
      },

      acceptTeamInvite: async (inviteId) => {
        const supabase = await syncClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return false;
        const { data: team, error } = await supabase.rpc("accept_team_invite", {
          p_invite_id: inviteId,
        });
        if (error || !team) return false;
        // Self-introduction broadcast: profiles are owner-only under
        // RLS, so each member announces displayName + email on join —
        // this is the only identity channel. Journal content never
        // enters team_activities (privacy wall, PRD §2).
        const { data: profile } = await supabase
          .from("profiles")
          .select("identity")
          .eq("id", user.id)
          .maybeSingle();
        const displayName =
          (profile?.identity as { displayName?: string } | null)?.displayName ??
          user.email?.split("@")[0] ??
          "Teammate";
        void supabase.from("team_activities").insert({
          team_id: team.id,
          user_id: user.id,
          activity_type: "join",
          payload: { displayName, email: user.email ?? null },
        });
        useDayflowStore.setState({ team });
        await get().loadTeam();
        return true;
      },

      sendTeamPraise: async (message) => {
        const team = get().team;
        const userId = await currentUserId();
        if (!team || !userId) return;
        const supabase = await syncClient();
        const { error } = await supabase
          .from("team_activities")
          .insert({
            team_id: team.id,
            user_id: userId,
            activity_type: "praise",
            payload: { message },
          });
        if (!error) await get().loadTeamActivities();
      },

      pulseTeamPresence: async () => {
        if (!get().team) return;
        const supabase = await syncClient();
        await supabase.rpc("update_presence", {});
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
      // Team Mode (Phase 3): resolve the teams row at boot so habit
      // completions anywhere in the app can broadcast status-only
      // events. Fire-and-forget — never blocks first paint.
      void useDayflowStore.getState().ensureTeamSummary();
    })();
  }
  return bootPromise;
}
