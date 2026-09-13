"use client";

// ============================================================
// Dayflow AI — HabitsView (Phase 5 T0/T1b/T3)
// ------------------------------------------------------------
// Identity-based habit tracking (PRD §4.3): habits live in the
// `habits` table, completions in `habit_logs` — both through the
// Delta Sync store (optimistic IndexedDB -> Supabase insert ->
// cursor bump). Each habit keeps its 7-day met grid + flame
// streak; completing fires the paired haptic + visual tick.
//
// The fitness surface also hosts the AI workout generator (T1b):
// Generate Workout -> /api/ai/coach (mode: workout, JSON-mode
// cascade) -> Zod-validated plan -> "Log Workout" writes
// workout_logs. That Log CTA is Liquid Glass T1 surface #2
// (PRD §6.2 budget: exactly 2 live instances app-wide).
// ============================================================

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Dumbbell, Flame, Plus, Sparkles, Target, Trash2, Trophy } from "lucide-react";
import { z } from "zod";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useDayflowData } from "@/lib/viewmodel";
import { keyForOffset } from "@/lib/seed";
import { weekOf } from "@/lib/compute";
import { fmtDuration } from "@/lib/compute";
import { triggerHaptic, hapticWarn } from "@/lib/haptics";
import { LiquidGlass } from "@/components/ui/LiquidGlass";
import { LogoLoop } from "@/components/brand/LogoLoop";
import { CATEGORY_COLORS, GOAL_FALLBACK_COLORS } from "@/styles/palette";
import { useToast } from "@/hooks/use-toast";

// ---------- streak math (habit_logs consecutive days) ----------

const localKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Days-of-week set holding at least one completion per habit. */
function logsByHabitAndDay(habitLogs: { habit_id: string; completed_at: string }[]) {
  const map = new Map<string, Set<string>>();
  for (const log of habitLogs) {
    const set = map.get(log.habit_id) ?? new Set<string>();
    set.add(localKey(log.completed_at));
    map.set(log.habit_id, set);
  }
  return map;
}

/** Consecutive completed days ending today (today is forgiven). */
function habitStreak(days: Set<string>, todayKey: string): number {
  let streak = 0;
  for (let offset = -1; offset >= -364; offset--) {
    const key = keyForOffset(offset);
    if (days.has(key)) streak++;
    else break;
  }
  if (days.has(todayKey)) streak += 1;
  return streak;
}

// ---------- T1b: workout plan schema (Zod-validated before render) ----------

const WorkoutBlockSchema = z.object({
  name: z.string().min(1),
  sets: z.string().optional(),
  durationMinutes: z.number().optional(),
  intensity: z.string().optional(),
  cue: z.string().optional(),
});

const WorkoutPlanSchema = z.object({
  title: z.string().min(1),
  focus: z.string().optional(),
  durationMinutes: z.number().int().positive().max(240).optional(),
  blocks: z.array(WorkoutBlockSchema).min(1).max(14),
});

export type WorkoutPlan = z.infer<typeof WorkoutPlanSchema>;

// ---------- view ----------

export function HabitsView() {
  const habits = useDayflowStore((s) => s.habits);
  const habitLogs = useDayflowStore((s) => s.habitLogs);
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const addHabit = useDayflowStore((s) => s.addHabit);
  const deleteHabit = useDayflowStore((s) => s.deleteHabit);
  const addHabitLog = useDayflowStore((s) => s.addHabitLog);
  const profileRow = useDayflowStore((s) => s.profile);
  const { toast } = useToast();

  const [newHabit, setNewHabit] = useState("");
  const todayKey = keyForOffset(0);
  const week = useMemo(() => weekOf(todayKey), [todayKey]);

  const data = useDayflowData();
  const sleepLogs = useDayflowStore((s) => s.sleepLogs);
  const hydrationLogs = useDayflowStore((s) => s.hydrationLogs);

  // Today's goal cards — targets come from the profile sections
  // (derived Goals), progress from the server-backed log tables.
  const goals = useMemo(
    () => [
      {
        key: "fitness" as const,
        label: "Fitness",
        done: workoutLogs
          .filter((r) => localKey(r.logged_at) === todayKey)
          .reduce((sum, r) => sum + (r.duration_minutes ?? 45), 0),
        target: data.goals.fitnessMinutes,
        colorHex: GOAL_FALLBACK_COLORS.fitness,
      },
      {
        key: "sleep" as const,
        label: "Sleep",
        done: sleepLogs
          .filter((r) => localKey(r.logged_at) === todayKey)
          .reduce((sum, r) => sum + r.sleep_minutes, 0),
        target: data.goals.sleepMinutes,
        colorHex: GOAL_FALLBACK_COLORS.sleep,
      },
      {
        key: "water" as const,
        label: "Water",
        done:
          hydrationLogs
            .filter((r) => localKey(r.logged_at) === todayKey)
            .reduce((sum, r) => sum + r.amount_ml, 0) / Math.max(1, data.profile.waterGlassMl),
        target: data.goals.waterGlasses,
        colorHex: GOAL_FALLBACK_COLORS.water,
      },
    ],
    [workoutLogs, sleepLogs, hydrationLogs, todayKey, data.goals, data.profile.waterGlassMl]
  );

  const logsByHabit = useMemo(() => logsByHabitAndDay(habitLogs), [habitLogs]);
  const completedToday = habits.filter((h) => logsByHabit.get(h.id)?.has(todayKey));
  const bestStreak = habits.reduce(
    (best, h) => {
      const streak = habitStreak(logsByHabit.get(h.id) ?? new Set(), todayKey);
      return streak > best.streak ? { name: h.name, streak } : best;
    },
    { name: "—", streak: 0 }
  );

  const createHabit = async () => {
    const name = newHabit.trim();
    if (!name) return;
    setNewHabit("");
    await addHabit({ name });
    toast({ title: "Habit created", description: name });
  };

  const completeHabit = async (habitId: string, name: string) => {
    // PRD §4.3: sensory reward — haptic and visual tick on the
    // same frame as the optimistic write.
    triggerHaptic();
    await addHabitLog({ habit_id: habitId });
    toast({ title: "Done", description: `${name} — logged for today` });
  };

  return (
    <div className="df-scroll h-full overflow-y-auto px-4 sm:px-6 py-5">
      {/* header */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-[21px] font-bold tracking-tight" style={{ color: "var(--df-text-primary)" }}>
            Habits & goals
          </h1>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--df-text-secondary)" }}>
            Identity-based streaks — every tap lands in your Dayflow account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="df-summary-card px-3.5 py-2 flex items-center gap-2" aria-label="Habits completed today">
            <Trophy className="h-4 w-4" style={{ color: "var(--df-accent)" }} />
            <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--df-text-primary)" }}>
              {completedToday.length}/{habits.length || 0}
            </span>
            <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
              today
            </span>
          </div>
          <div className="df-summary-card px-3.5 py-2 flex items-center gap-2" aria-label="Best streak">
            <Flame className="h-4 w-4" style={{ color: "var(--df-streak)", fill: "var(--df-streak-fill)" }} />
            <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--df-text-primary)" }}>
              {bestStreak.streak}d
            </span>
            <span className="text-[11px] max-w-[90px] truncate" style={{ color: "var(--df-text-muted)" }}>
              {bestStreak.name} streak
            </span>
          </div>
        </div>
      </div>

      {/* habits */}
      <section
        className="mt-5 rounded-lg p-4"
        style={{
          background: "var(--df-daily-grid-fill)",
          border: "0.5px solid var(--df-daily-grid-border)",
        }}
        aria-label="Weekly habit grid"
      >
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4" style={{ color: "var(--df-accent)" }} />
          <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
            This week
          </h2>
          <span className="text-[11.5px]" style={{ color: "var(--df-text-muted)" }}>
            a filled dot means the habit was completed that day
          </span>
        </div>

        <div className="mt-3 overflow-x-auto df-scroll">
          <div className="min-w-[480px] flex flex-col gap-2.5">
            {/* day header */}
            <div className="flex items-center gap-2 pl-[168px]">
              {week.map((d) => (
                <div key={d.dateKey} className="w-[44px] text-center">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: d.isToday ? "var(--df-accent-text)" : "var(--df-text-muted)" }}
                  >
                    {d.label}
                  </div>
                  <div
                    className="text-[9.5px]"
                    style={{
                      color: d.isToday ? "var(--df-accent-text)" : "var(--df-text-muted)",
                      fontWeight: d.isToday ? 700 : 400,
                    }}
                  >
                    {d.isToday ? "today" : d.dateLabel}
                  </div>
                </div>
              ))}
            </div>

            {habits.map((h) => {
              const days = logsByHabit.get(h.id) ?? new Set<string>();
              const streak = habitStreak(days, todayKey);
              const doneToday = days.has(todayKey);
              const color = h.color ?? CATEGORY_COLORS.fitness;
              return (
                <div key={h.id} className="flex items-center gap-2">
                  <div className="w-[168px] shrink-0 flex items-center gap-2 pr-2">
                    <span className="w-2.5 h-2.5 rounded-[4px] shrink-0" style={{ background: color }} />
                    <span
                      className="text-[12px] font-semibold truncate"
                      style={{ color: "var(--df-text-primary)" }}
                      title={h.name}
                    >
                      {h.name}
                    </span>
                  </div>
                  {week.map((d) => {
                    const met = days.has(d.dateKey);
                    return (
                      <div key={d.dateKey} className="w-[44px] grid place-items-center">
                        <motion.button
                          type="button"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          onClick={() => {
                            if (d.isToday && !met) void completeHabit(h.id, h.name);
                          }}
                          aria-label={`${h.name} on ${d.label}${met ? " — completed" : ""}`}
                          className="h-[26px] w-[26px] rounded-[8px] grid place-items-center df-press"
                          style={{
                            background: met
                              ? color
                              : `color-mix(in srgb, ${color} ${d.isToday && !met ? "18%" : "0%"}, var(--df-daily-empty))`,
                            border: met
                              ? `0.5px solid color-mix(in srgb, ${color} 60%, transparent)`
                              : "0.5px solid color-mix(in srgb, var(--df-text-muted) 25%, transparent)",
                            opacity: d.isFuture ? 0.3 : 1,
                            cursor: d.isToday && !met ? "pointer" : "default",
                          }}
                        >
                          {met && (
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                              <path
                                d="M5 12.5l4.5 4.5L19 7.5"
                                fill="none"
                                style={{ stroke: "var(--df-white)" }}
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </motion.button>
                      </div>
                    );
                  })}
                  <div className="ml-2 flex items-center gap-1 shrink-0">
                    <Flame
                      className="h-3 w-3"
                      style={{ color: streak > 0 ? "var(--df-streak)" : "var(--df-text-muted)" }}
                    />
                    <span
                      className="text-[11px] font-bold tabular-nums"
                      style={{ color: streak > 0 ? "var(--df-text-primary)" : "var(--df-text-muted)" }}
                    >
                      {streak}d
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        hapticWarn();
                        void deleteHabit(h.id);
                        toast({ title: "Habit deleted", description: h.name });
                      }}
                      aria-label={`Delete ${h.name}`}
                      className="df-press ml-1 grid size-7 place-items-center rounded-full"
                      style={{ color: "var(--df-text-muted)" }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* new habit row */}
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void createHabit();
              }}
            >
              <div className="w-[168px] shrink-0 flex items-center gap-2 pr-2">
                <span
                  className="w-2.5 h-2.5 rounded-[4px] shrink-0"
                  style={{ background: "var(--df-text-muted)" }}
                />
                <input
                  value={newHabit}
                  onChange={(e) => setNewHabit(e.target.value)}
                  placeholder="New habit…"
                  aria-label="New habit name"
                  className="w-full min-h-11 rounded-md px-2.5 bg-transparent outline-none text-base placeholder:text-[var(--df-text-muted)]"
                  style={{
                    color: "var(--df-text-primary)",
                    background: "var(--df-input-fill)",
                    border: "0.5px solid var(--df-input-border)",
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={!newHabit.trim()}
                className="df-press df-btn-primary min-h-11 px-3.5 rounded-md text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                Add habit
              </button>
            </form>

            {habits.length === 0 && (
              <p className="text-[11.5px] py-2" style={{ color: "var(--df-text-muted)" }}>
                No habits yet — add your first above (e.g. &ldquo;Morning walk&rdquo;, &ldquo;Read 10 pages&rdquo;).
              </p>
            )}
          </div>
        </div>
      </section>

      {/* today's goal cards (server-backed) */}
      <section className="mt-4 grid sm:grid-cols-3 gap-3" aria-label="Today's goal details">
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.done / Math.max(g.target, 1)) * 100));
          const met = g.done >= g.target - 0.25;
          const valueLabel =
            g.key === "water"
              ? `${g.done.toFixed(g.done % 1 ? 1 : 0)} / ${g.target}`
              : `${fmtDuration(g.done)} / ${fmtDuration(g.target)}`;
          return (
            <motion.div
              key={g.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-lg p-4"
              style={{
                background: "var(--df-daily-grid-fill)",
                border: `0.5px solid ${
                  met ? `color-mix(in srgb, ${g.colorHex} 55%, transparent)` : "var(--df-daily-grid-border)"
                }`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-[4px] shrink-0" style={{ background: g.colorHex }} />
                  <span className="text-[12.5px] font-bold truncate" style={{ color: "var(--df-text-primary)" }}>
                    {g.label}
                  </span>
                </span>
                {met ? (
                  <span
                    className="text-[9.5px] font-bold px-1.5 py-[2px] rounded-full shrink-0"
                    style={{
                      color: "var(--df-summary-value)",
                      background: `color-mix(in srgb, ${g.colorHex} 18%, transparent)`,
                      border: `0.5px solid color-mix(in srgb, ${g.colorHex} 45%, transparent)`,
                    }}
                  >
                    MET
                  </span>
                ) : (
                  <span
                    className="text-[9.5px] font-bold px-1.5 py-[2px] rounded-full shrink-0"
                    style={{ color: "var(--df-text-muted)", border: "0.5px solid var(--df-chip-border)" }}
                  >
                    {pct}%
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div
                  className="h-[6px] rounded-full overflow-hidden"
                  style={{ background: "var(--df-segment-track)" }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-label={`${g.label} progress today`}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ background: g.colorHex }}
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--df-text-secondary)" }}>
                  {valueLabel}
                </span>
              </div>
            </motion.div>
          );
        })}
      </section>

      {/* T1b — AI workout generator + primary Log CTA (Liquid Glass T1 #2) */}
      <WorkoutCard profileRow={profileRow} recentWorkouts={workoutLogs.slice(-6).reverse()} />

      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
        Streaks count consecutive days, with today forgiven until midnight — a missed day
        resets gently, never punitively (Adaptive Reset, PRD §4.3).
      </p>
    </div>
  );
}

// ---------- T1b: the AI workout generator card ----------

function WorkoutCard({
  profileRow,
  recentWorkouts,
}: {
  profileRow: ReturnType<typeof useDayflowStore.getState>["profile"];
  recentWorkouts: { type: string; duration_minutes: number | null; logged_at: string }[];
}) {
  const addWorkoutLog = useDayflowStore((s) => s.addWorkoutLog);
  const { toast } = useToast();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  const metabolism =
    profileRow?.metabolism &&
    typeof profileRow.metabolism === "object" &&
    !Array.isArray(profileRow.metabolism)
      ? (profileRow.metabolism as { preferredWorkoutWindow?: string; workoutFrequencyTargetDays?: number })
      : {};

  const generate = async () => {
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      // Auth per Amendment #12: live session JWT rides the Bearer.
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Sign in again — your session expired.");
        return;
      }
      const context = [
        `Preferred window: ${metabolism.preferredWorkoutWindow ?? "any"}.`,
        recentWorkouts.length > 0
          ? `Recent sessions: ${recentWorkouts.map((w) => `${w.type} (${w.duration_minutes ?? 45}m)`).join("; ")}.`
          : "No recent sessions — start moderate.",
        "Return ONLY a JSON object: {\"title\": string, \"focus\"?: string, \"durationMinutes\"?: number, \"blocks\": [{\"name\": string, \"sets\"?: string, \"durationMinutes\"?: number, \"intensity\"?: string, \"cue\"?: string}]}",
      ].join(" ");
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: "workout",
          messages: [
            {
              role: "system",
              content:
                "You are Dayflow's strength & conditioning coach. Generate a focused, safe session plan as strict JSON — no prose, no markdown fences.",
            },
            {
              role: "user",
              content: `Generate today's workout plan. ${context}`,
            },
          ],
        }),
      });
      if (!res.ok) {
        setError(`Coach unavailable (HTTP ${res.status}). Try again in a moment.`);
        return;
      }
      const payload = (await res.json()) as { text?: string; error?: string };
      if (payload.error || !payload.text) {
        setError(payload.error ?? "Coach returned an empty plan.");
        return;
      }
      // Zod-validate BEFORE render (PRD §4.5). F-5 (Phase 8 / S1):
      // the JSON.parse is guarded FIRST — when the algorithmic floor
      // answers plain text (Groq key unset / cascade exhausted), the
      // dedicated "plan didn't validate" branch stays reachable
      // instead of falling into the generic network-catch.
      const raw = payload.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        setError("The plan didn't validate — ask again for a cleaner one.");
        return;
      }
      const parsed = WorkoutPlanSchema.safeParse(json);
      if (!parsed.success) {
        setError("The plan didn't validate — ask again for a cleaner one.");
        return;
      }
      setPlan(parsed.data);
      toast({ title: "Workout ready", description: parsed.data.title });
    } catch {
      setError("The coach couldn't be reached. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const logWorkout = async () => {
    if (!plan) return;
    setLogging(true);
    try {
      await addWorkoutLog({
        type: plan.title,
        duration_minutes: plan.durationMinutes ?? plan.blocks.reduce((s, b) => s + (b.durationMinutes ?? 10), 0),
      });
      triggerHaptic();
      toast({ title: "Workout logged", description: plan.title });
    } finally {
      setLogging(false);
    }
  };

  return (
    <section
      className="mt-4 rounded-lg p-4"
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label="AI workout generator"
    >
      <div className="flex items-center gap-2">
        <Dumbbell className="h-4 w-4" style={{ color: "var(--df-accent)" }} />
        <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
          Body — AI workout
        </h2>
        <span className="text-[11.5px]" style={{ color: "var(--df-text-muted)" }}>
          generated by your coach, validated before render
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="df-press df-btn-secondary min-h-11 px-4 rounded-md text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy ? <LogoLoop size="sm" /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy ? "thinking…" : plan ? "Regenerate workout" : "Generate Workout"}
        </button>

        {/* Primary Log CTA — Liquid Glass T1 surface #2 (PRD §6.2). */}
        {plan && (
          <LiquidGlass
            filterCss="url(#lg-cta) blur(18px) saturate(1.7)"
            className="inline-flex"
            style={{ background: `color-mix(in srgb, ${CATEGORY_COLORS.fitness} 22%, transparent)` }}
          >
            <button
              type="button"
              onClick={logWorkout}
              disabled={logging}
              className="df-press min-h-11 px-5 rounded-(--radius-pill) text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
              style={{ color: "var(--df-text-primary)" }}
            >
              <Dumbbell className="h-3.5 w-3.5" style={{ color: CATEGORY_COLORS.fitness }} />
              {logging ? "Logging…" : "Log Workout"}
            </button>
          </LiquidGlass>
        )}
      </div>

      {error && (
        <p className="mt-3 text-[12px] rounded-md px-3 py-2" role="alert" style={{ color: "var(--df-destructive-text)", background: "color-mix(in srgb, var(--df-destructive) 12%, transparent)" }}>
          {error}
        </p>
      )}

      {plan && (
        <div className="mt-3 rounded-lg p-3.5" style={{ background: "var(--df-chip-fill)", border: "0.5px solid var(--df-chip-border)" }}>
          <p className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
            {plan.title}
            {plan.durationMinutes ? <span className="font-medium" style={{ color: "var(--df-text-muted)" }}> · {fmtDuration(plan.durationMinutes)}</span> : null}
          </p>
          {plan.focus && (
            <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--df-text-secondary)" }}>
              {plan.focus}
            </p>
          )}
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {plan.blocks.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--df-text-secondary)" }}>
                <span className="mt-[6px] w-[4.5px] h-[4.5px] rounded-full shrink-0" style={{ background: "var(--df-accent)" }} />
                <span className="min-w-0">
                  <span className="font-semibold" style={{ color: "var(--df-text-primary)" }}>{b.name}</span>
                  {b.sets ? ` · ${b.sets}` : ""}
                  {b.durationMinutes ? ` · ${b.durationMinutes}m` : ""}
                  {b.intensity ? ` · ${b.intensity}` : ""}
                  {b.cue && <span className="block text-[11px] mt-0.5" style={{ color: "var(--df-text-muted)" }}>{b.cue}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
