"use client";

// WorkoutSheet — the gym logger (Phase 10, after workout-cool).
// Full-session workout logging on top of workout_logs.exercises:
//
//   build   add exercises from the bundled 1,324-item library, then
//           log sets (weight × reps, or seconds for timed work) with
//           big phone-first touch targets, a rest timer, live volume
//           stats, per-set PR crowns and one-tap "repeat last workout".
//   picker  the ExercisePicker step (search + filters + how-to text).
//
// Quick logs ("evening run, 30 min") still go through EventDialog —
// this sheet owns anything with exercises attached. Saving writes one
// workout_logs row; PRs are detected client-side against history and
// toasted (Epley e1RM, src/lib/workout.ts).
//
// Form state lives in a keyed inner component (WorkoutForm) so each
// open mounts fresh values — same discipline as EventDialog /
// MealCaptureSheet.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  Clock,
  Crown,
  Dumbbell,
  Plus,
  RotateCcw,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { useDayflowStore } from "@/store/useDayflowStore";
import { localDateTime } from "@/lib/viewmodel";
import { keyForOffset } from "@/lib/seed";
import { useToast } from "@/hooks/use-toast";
import { useIsPhone } from "@/hooks/use-media-query";
import { hapticSuccess, triggerHaptic } from "@/lib/haptics";
import { springSoft } from "@/lib/motion";
import { useDockHideRequest } from "@/hooks/use-dock-visibility";
import { useKeyboardTracking } from "@/components/ui/Sheet";
import { CATEGORY_COLORS } from "@/styles/palette";
import {
  autoTitle,
  e1rm,
  exerciseSummaries,
  fmtDaysAgo,
  parseExercises,
  recentExerciseNames,
  serializeExercises,
  workoutStats,
  type ExerciseSummary,
  type WorkoutExercise,
  type WorkoutSet,
} from "@/lib/workout";
import { exerciseById, type ExerciseRecord } from "@/lib/exercise-db";
import { ExercisePicker } from "@/components/dayflow/workout/ExercisePicker";
import { ExerciseThumb } from "@/components/dayflow/workout/ExerciseThumb";

const FITNESS = CATEGORY_COLORS.fitness;
const REST_SECONDS = 90;

const pad = (n: number) => String(n).padStart(2, "0");
const nowHM = () => `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
const label = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const fmtVolume = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)} t` : `${Math.round(kg)} kg`;

/** Row we are editing (subset of WorkoutLogRow). */
export interface WorkoutEditTarget {
  id: string;
  type: string;
  duration_minutes: number | null;
  active_calories: number | null;
  logged_at: string;
  /** jsonb column value (WorkoutExercise[] shape) */
  exercises: unknown;
}

/**
 * A generated routine handed to the logger (AI routine builder).
 * `key` forces a fresh form mount per generation; weights stay
 * empty and get smart-filled from training history below.
 */
export interface WorkoutPrefill {
  key: string;
  title?: string;
  exercises: WorkoutExercise[];
  durationMinutes?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Target day (defaults to today / the edited row's day). */
  dateKey?: string;
  /** When set, the sheet edits this existing workout_logs row. */
  editing?: WorkoutEditTarget | null;
  /** When set (and not editing), the sheet starts from this routine. */
  prefill?: WorkoutPrefill | null;
}

export function WorkoutSheet({ open, onClose, dateKey, editing, prefill }: Props) {
  const isPhone = useIsPhone();
  // Overlay owns the bottom band while open (dock-avoidance Rule B):
  // the phone sheet + its sticky Save row never stack glass on glass
  // with the nav dock underneath.
  useDockHideRequest("overlay:workout-sheet", open);
  return (
    <AnimatePresence>
      {open && (
        <WorkoutForm
          key={editing?.id ?? prefill?.key ?? "new"}
          onClose={onClose}
          dateKey={dateKey}
          editing={editing ?? null}
          prefill={prefill ?? null}
          isPhone={isPhone}
        />
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------ form ----

function WorkoutForm({
  onClose,
  dateKey,
  editing,
  prefill,
  isPhone,
}: {
  onClose: () => void;
  dateKey?: string;
  editing: WorkoutEditTarget | null;
  prefill: WorkoutPrefill | null;
  isPhone: boolean;
}) {
  const addWorkoutLog = useDayflowStore((s) => s.addWorkoutLog);
  const updateWorkoutLog = useDayflowStore((s) => s.updateWorkoutLog);
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const { toast } = useToast();
  // Software-keyboard tracking: lifts the phone shell above the
  // keyboard (title/time/kcal fields) via the shared variable.
  useKeyboardTracking();

  const editingExercises = useMemo(
    () => parseExercises(editing?.exercises ?? null),
    [editing]
  );

  const [step, setStep] = useState<"build" | "picker">("build");
  const [title, setTitle] = useState(editing?.type ?? prefill?.title ?? "");
  const [startHM, setStartHM] = useState(() => {
    if (editing?.logged_at) {
      const d = new Date(editing.logged_at);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return nowHM();
  });
  const [durationMin, setDurationMin] = useState(
    String(editing?.duration_minutes ?? prefill?.durationMinutes ?? 60)
  );
  const [calories, setCalories] = useState(
    editing?.active_calories != null ? String(editing.active_calories) : ""
  );
  // Editing an existing row reuses its exercises verbatim. A
  // generated routine instead arrives weight-empty: each exercise
  // without a prescribed load gets the athlete's last-session
  // weight prefilled (AI plan × training history = smart start),
  // and everything is unchecked so sets are logged as they happen.
  const [session, setSession] = useState<WorkoutExercise[]>(() => {
    if (editingExercises.length > 0) return editingExercises;
    if (!prefill) return [];
    const hist = exerciseSummaries(workoutLogs);
    return prefill.exercises.map((ex) => {
      if (ex.s.some((s) => s.w != null)) return ex;
      const w = hist.get(ex.n)?.lastSet.w;
      return w == null
        ? ex
        : { ...ex, s: ex.s.map((s) => (s.r != null ? { ...s, w } : s)) };
    });
  });
  const [askClose, setAskClose] = useState(false);

  // ---- rest timer ------------------------------------------------
  const [restLeft, setRestLeft] = useState<number | null>(null);
  useEffect(() => {
    if (restLeft == null || restLeft <= 0) return;
    const t = setTimeout(() => {
      if (restLeft <= 1) {
        hapticSuccess();
        setRestLeft(null);
      } else {
        setRestLeft(restLeft - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  // ---- history / PRs ---------------------------------------------
  /** best e1RM per exercise name, excluding the row being edited */
  const historyBest = useMemo(() => {
    const best = new Map<string, number>();
    for (const row of workoutLogs) {
      if (editing && row.id === editing.id) continue;
      for (const ex of parseExercises(row.exercises ?? null)) {
        for (const s of ex.s) {
          if (s.w == null || s.r == null) continue;
          const est = e1rm(s.w, s.r);
          if (est > (best.get(ex.n) ?? 0)) best.set(ex.n, est);
        }
      }
    }
    return best;
  }, [workoutLogs, editing]);

  /** most recent session with exercises (for the repeat chip) */
  const lastSession = useMemo(() => {
    const rows = workoutLogs
      .filter((r) => !editing || r.id !== editing.id)
      .sort((a, b) => b.logged_at.localeCompare(a.logged_at));
    const first = rows
      .map((row) => ({ title: row.type, exs: parseExercises(row.exercises ?? null) }))
      .find((r) => r.exs.length > 0);
    return first ?? null;
  }, [workoutLogs, editing]);

  /** per-exercise history — "Last: …" lines + smart set prefill */
  const summaries = useMemo(
    () => exerciseSummaries(workoutLogs, editing?.id),
    [workoutLogs, editing]
  );

  /** most-logged exercises for the picker's Recent row */
  const recentExercises = useMemo(
    () =>
      recentExerciseNames(workoutLogs)
        .map((r) => exerciseById(r.id))
        .filter((e): e is ExerciseRecord => e != null),
    [workoutLogs]
  );

  // ---- session editing -------------------------------------------
  const picked = new Set(session.map((e) => e.id));

  const addExercise = (ex: ExerciseRecord) => {
    setSession((s) =>
      s.some((x) => x.id === ex.id)
        ? s
        : [
            ...s,
            {
              id: ex.id,
              n: ex.name,
              t: ex.target || ex.muscleGroup,
              e: ex.equipment,
              s: [defaultSet(ex, summaries.get(ex.name))],
            },
          ]
    );
  };

  const removeExercise = (id: string) =>
    setSession((s) => s.filter((e) => e.id !== id));

  const patchExercise = (
    id: string,
    fn: (ex: WorkoutExercise) => WorkoutExercise
  ) => setSession((s) => s.map((e) => (e.id === id ? fn(e) : e)));

  /** complete a set → start the rest timer */
  const completeSet = (ex: WorkoutExercise, setIdx: number) => {
    const willComplete = !ex.s[setIdx]?.c;
    patchExercise(ex.id, (e) => ({
      ...e,
      s: e.s.map((st, i) => (i === setIdx ? { ...st, c: !st.c } : st)),
    }));
    if (willComplete) {
      triggerHaptic();
      setRestLeft(REST_SECONDS);
    }
  };

  const stats = useMemo(() => workoutStats(session), [session]);
  const derivedTitle = useMemo(
    () => autoTitle(session, (id) => exerciseById(id)?.bodyPart),
    [session]
  );
  const durationNum = Math.round(Number(durationMin));
  const caloriesNum =
    calories.trim() === "" ? null : Math.round(Number(calories));
  const valid =
    session.length > 0 &&
    Number.isFinite(durationNum) &&
    durationNum > 0 &&
    durationNum < 24 * 60 &&
    (caloriesNum == null || (caloriesNum >= 0 && Number.isFinite(caloriesNum)));

  const dirty =
    session.length > 0 &&
    session.some(
      (e) => e.s.length > 1 || e.s.some((s) => s.w != null || s.r != null || s.d != null)
    );

  const requestClose = () => {
    if (dirty && !askClose) {
      setAskClose(true);
      return;
    }
    onClose();
  };

  const repeatLast = () => {
    if (!lastSession) return;
    triggerHaptic();
    setSession(
      lastSession.exs.map((ex) => ({
        ...ex,
        s: ex.s.map(({ w, r, d }) => ({ w, r, d, c: false })),
      }))
    );
  };

  const save = async () => {
    if (!valid) return;
    const dayKey = dateKey ?? keyForOffset(0);
    const payload = {
      type: title.trim() || derivedTitle || "Workout",
      duration_minutes: durationNum,
      active_calories: caloriesNum,
      logged_at: localDateTime(dayKey, startHM),
      exercises: serializeExercises(session),
    };
    if (editing) await updateWorkoutLog(editing.id, payload);
    else await addWorkoutLog(payload);

    // PR toasts — the best moment of the gym logger.
    const prs = session
      .map((ex) => {
        let best = 0;
        for (const s of ex.s) {
          if (s.w == null || s.r == null) continue;
          best = Math.max(best, e1rm(s.w, s.r));
        }
        return best > (historyBest.get(ex.n) ?? 0) && best > 0
          ? { name: ex.n, est: Math.round(best) }
          : null;
      })
      .filter((x): x is { name: string; est: number } => x != null);
    for (const pr of prs.slice(0, 3)) {
      toast({
        title: `New PR — ${pr.name}`,
        description: `Estimated 1RM ${pr.est} kg`,
      });
    }
    toast({
      title: editing ? "Workout updated" : "Workout logged",
      description:
        stats.exercises > 0
          ? `${stats.exercises} exercise${stats.exercises > 1 ? "s" : ""} · ${stats.sets} set${stats.sets > 1 ? "s" : ""}${
              stats.volumeKg > 0 ? ` · ${fmtVolume(stats.volumeKg)}` : ""
            }`
          : undefined,
    });
    hapticSuccess();
    onClose();
  };

  const reducedMotion = useReducedMotion();

  const body = (
    <div className="flex flex-col min-h-0 flex-1">
      {/* header */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span
          className="h-9 w-9 rounded-[12px] grid place-items-center shrink-0"
          style={{
            background: `color-mix(in srgb, ${FITNESS} 15%, transparent)`,
            color: FITNESS,
          }}
        >
          <Dumbbell className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold" style={{ color: "var(--df-text-primary)" }}>
            {editing ? "Edit gym session" : "Gym session"}
          </h2>
          <p className="text-[11px] truncate" style={{ color: "var(--df-text-muted)" }}>
            {session.length > 0 && derivedTitle
              ? `Suggested title — ${derivedTitle}`
              : "Pick exercises, log sets, rest, repeat"}
          </p>
        </div>
        <button
          onClick={requestClose}
          aria-label="Close"
          className="df-press shrink-0 h-8 w-8 grid place-items-center rounded-full"
          style={{ background: "var(--df-chip-fill)", color: "var(--df-text-secondary)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {step === "picker" ? (
        <div className="mt-3 flex flex-col min-h-0 flex-1">
          <ExercisePicker
            picked={picked}
            onPick={addExercise}
            onBack={() => setStep("build")}
            history={summaries}
            recent={recentExercises}
          />
        </div>
      ) : (
        <BuildStep
          title={title}
          setTitle={setTitle}
          placeholder={derivedTitle ?? "Workout"}
          startHM={startHM}
          setStartHM={setStartHM}
          durationMin={durationMin}
          setDurationMin={setDurationMin}
          calories={calories}
          setCalories={setCalories}
          session={session}
          stats={stats}
          historyBest={historyBest}
          summaries={summaries}
          addExercise={() => setStep("picker")}
          removeExercise={removeExercise}
          patchExercise={patchExercise}
          completeSet={completeSet}
          repeatLast={lastSession ? repeatLast : null}
          lastSessionTitle={lastSession?.title ?? null}
          restLeft={restLeft}
          addRest={() => setRestLeft((v) => (v ?? 0) + 30)}
          stopRest={() => setRestLeft(null)}
          valid={valid}
          save={save}
          askClose={askClose}
          keepLogging={() => setAskClose(false)}
          discard={onClose}
        />
      )}
    </div>
  );

  return (
    <Scrim onClose={requestClose}>
      {isPhone ? (
        <motion.div
          initial={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0.6 }}
          animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0.5 }}
          transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
          className="w-full rounded-t-[24px] overflow-hidden df-material flex flex-col"
          style={{
            height: "92dvh",
            /* Keyboard lift (shared --keyboard-height) — same fix as
               RoutineSheet: ride above the software keyboard, shrink
               via maxHeight so the top never runs off-screen. */
            marginBottom: "var(--keyboard-height, 0px)",
            maxHeight: "calc(100dvh - var(--keyboard-height, 0px))",
            transition: "margin-bottom 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="mx-auto mt-2.5 mb-1 h-[5px] w-9 rounded-full shrink-0"
            style={{ background: "var(--df-chip-border)" }}
          />
          <div className="flex flex-col min-h-0 flex-1 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
            {body}
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
          transition={reducedMotion ? { duration: 0.18 } : springSoft}
          className="w-full max-w-[520px] rounded-2xl df-material flex flex-col"
          style={{ height: "min(82dvh, 720px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col min-h-0 flex-1 p-5">{body}</div>
        </motion.div>
      )}
    </Scrim>
  );
}

// -------------------------------------------------- build step ----

interface BuildProps {
  title: string;
  setTitle: (v: string) => void;
  placeholder: string;
  startHM: string;
  setStartHM: (v: string) => void;
  durationMin: string;
  setDurationMin: (v: string) => void;
  calories: string;
  setCalories: (v: string) => void;
  session: WorkoutExercise[];
  stats: ReturnType<typeof workoutStats>;
  historyBest: Map<string, number>;
  summaries: ReadonlyMap<string, ExerciseSummary>;
  addExercise: () => void;
  removeExercise: (id: string) => void;
  patchExercise: (id: string, fn: (ex: WorkoutExercise) => WorkoutExercise) => void;
  completeSet: (ex: WorkoutExercise, setIdx: number) => void;
  repeatLast: (() => void) | null;
  lastSessionTitle: string | null;
  restLeft: number | null;
  addRest: () => void;
  stopRest: () => void;
  valid: boolean;
  save: () => void;
  askClose: boolean;
  keepLogging: () => void;
  discard: () => void;
}

function BuildStep(p: BuildProps) {
  return (
    <div className="mt-3 flex flex-col min-h-0 flex-1 overflow-y-auto df-scroll -mx-1 px-1">
      {/* title + when */}
      <div className="df-input-glass rounded-md px-3 h-12 flex items-center shrink-0">
        <input
          value={p.title}
          onChange={(e) => p.setTitle(e.target.value.slice(0, 60))}
          placeholder={p.placeholder}
          aria-label="Workout title"
          className="w-full bg-transparent outline-none text-base"
          style={{ color: "var(--df-text-primary)" }}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 shrink-0">
        <TimeField label="Start" value={p.startHM} onChange={p.setStartHM} />
        <NumField
          label="Minutes"
          value={p.durationMin}
          onChange={p.setDurationMin}
          placeholder="60"
        />
        <NumField label="kcal" value={p.calories} onChange={p.setCalories} placeholder="—" />
      </div>

      {/* repeat last */}
      {p.repeatLast && p.session.length === 0 && (
        <button
          onClick={p.repeatLast}
          className="df-press mt-2.5 rounded-md px-3 h-10 flex items-center gap-2 text-[12.5px] font-semibold shrink-0"
          style={{
            background: `color-mix(in srgb, ${FITNESS} 10%, transparent)`,
            border: `0.5px solid color-mix(in srgb, ${FITNESS} 35%, transparent)`,
            color: FITNESS,
          }}
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Repeat last — {p.lastSessionTitle}</span>
        </button>
      )}

      {/* session cards */}
      {p.session.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2.5">
          {p.session.map((ex) => (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              historyBest={p.historyBest}
              last={p.summaries.get(ex.n) ?? null}
              onRemove={() => p.removeExercise(ex.id)}
              patch={(fn) => p.patchExercise(ex.id, fn)}
              completeSet={(i) => p.completeSet(ex, i)}
            />
          ))}
        </div>
      )}

      {/* add exercise */}
      <button
        onClick={() => {
          triggerHaptic();
          p.addExercise();
        }}
        className="df-press mt-2.5 rounded-md px-3 h-11 flex items-center justify-center gap-1.5 text-[13px] font-semibold shrink-0"
        style={{
          background: "var(--df-input-fill)",
          border: `1px dashed color-mix(in srgb, ${FITNESS} 45%, transparent)`,
          color: FITNESS,
        }}
      >
        <Plus className="h-4 w-4" />
        Add exercise
        <span className="font-normal opacity-70">— 1,324 in library</span>
      </button>

      {p.session.length === 0 && (
        <p
          className="mt-2.5 text-[11.5px] leading-relaxed shrink-0"
          style={{ color: "var(--df-text-muted)" }}
        >
          Log sets as you lift — weight × reps, or seconds for planks and cardio.
          Checking a set starts a {REST_SECONDS}s rest timer, and beating your best
          earns a PR crown. Quick logs like runs still live in the timeline’s “+”
          button.
        </p>
      )}

      <div className="h-1 shrink-0" />

      {/* sticky footer */}
      <div className="df-sheet-footer sticky bottom-0 mt-auto pt-2 pb-1 -mx-1 px-1">
        {/* rest pill */}
        {p.restLeft != null && p.restLeft > 0 && (
          <div
            className="mb-2 rounded-full px-3 h-10 flex items-center gap-2.5"
            style={{
              background: `color-mix(in srgb, ${FITNESS} 16%, transparent)`,
              border: `0.5px solid color-mix(in srgb, ${FITNESS} 45%, transparent)`,
            }}
            role="timer"
            aria-label={`Rest timer ${p.restLeft} seconds`}
          >
            <Timer className="h-4 w-4 shrink-0" style={{ color: FITNESS }} />
            <span className="text-[13px] font-bold tabular-nums" style={{ color: FITNESS }}>
              Rest {Math.floor(p.restLeft / 60)}:{pad(p.restLeft % 60)}
            </span>
            <div className="flex-1" />
            <button
              onClick={p.addRest}
              className="df-press text-[11.5px] font-semibold px-2.5 h-7 rounded-full"
              style={{
                background: `color-mix(in srgb, ${FITNESS} 20%, transparent)`,
                color: FITNESS,
              }}
            >
              +30s
            </button>
            <button
              onClick={p.stopRest}
              aria-label="Stop rest timer"
              className="df-press h-7 w-7 grid place-items-center rounded-full"
              style={{
                background: `color-mix(in srgb, ${FITNESS} 20%, transparent)`,
                color: FITNESS,
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {p.askClose && (
          <div
            className="mb-2 rounded-md px-3 py-2.5 flex items-center gap-2"
            style={{
              background: "var(--df-daily-grid-fill)",
              border: "0.5px solid var(--df-chip-border)",
            }}
          >
            <span className="text-[12px] flex-1" style={{ color: "var(--df-text-secondary)" }}>
              Discard this session?
            </span>
            <button
              onClick={p.keepLogging}
              className="df-press df-btn-secondary h-8 px-3 text-[12px] font-semibold"
            >
              Keep logging
            </button>
            <button
              onClick={p.discard}
              className="df-press h-8 px-3 rounded-md text-[12px] font-semibold"
              style={{
                background: "color-mix(in srgb, var(--df-destructive-soft) 16%, transparent)",
                color: "var(--df-destructive-text)",
              }}
            >
              Discard
            </button>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p
              className="text-[11.5px] font-semibold truncate"
              style={{ color: "var(--df-text-secondary)" }}
            >
              {p.stats.exercises > 0
                ? `${p.stats.exercises} exercise${p.stats.exercises > 1 ? "s" : ""} · ${p.stats.sets} set${p.stats.sets > 1 ? "s" : ""}${
                    p.stats.volumeKg > 0 ? ` · ${fmtVolume(p.stats.volumeKg)}` : ""
                  }`
                : "No exercises yet"}
            </p>
            <p className="text-[10.5px] truncate" style={{ color: "var(--df-text-muted)" }}>
              {p.stats.sets > 0 && `${p.stats.doneSets} of ${p.stats.sets} sets done`}
              {Object.keys(p.stats.byTarget).length > 0 &&
                ` · ${Object.entries(p.stats.byTarget)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([t, n]) => `${label(t)} ${n}`)
                  .join(" · ")}`}
            </p>
          </div>
          <button
            onClick={p.save}
            disabled={!p.valid}
            className="df-press df-btn-primary df-btn-capsule h-11 px-5 text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-40 shrink-0"
          >
            <Check className="h-4 w-4" />
            {p.valid ? "Save workout" : "Add exercises"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------ exercise card ----

function ExerciseCard({
  ex,
  historyBest,
  last,
  onRemove,
  patch,
  completeSet,
}: {
  ex: WorkoutExercise;
  historyBest: Map<string, number>;
  last: ExerciseSummary | null;
  onRemove: () => void;
  patch: (fn: (ex: WorkoutExercise) => WorkoutExercise) => void;
  completeSet: (setIdx: number) => void;
}) {
  /** timed mode = every set carries duration and no reps */
  const timed = ex.s.length > 0 && ex.s.every((s) => s.r == null);
  const anyPR = ex.s.some(
    (s) => s.w != null && s.r != null && e1rm(s.w, s.r) > (historyBest.get(ex.n) ?? 0)
  );

  const addSet = () =>
    patch((e) => {
      const last = e.s[e.s.length - 1];
      return { ...e, s: [...e.s, { ...(last ?? defaultSetShape(timed)), c: false }] };
    });

  const toggleMode = () =>
    patch((e) => ({
      ...e,
      s: timed
        ? e.s.map((s) => ({ w: null, r: null, d: s.d ?? 45, c: s.c }))
        : e.s.map((s) => ({ w: s.w, r: s.r ?? 10, d: null, c: s.c })),
    }));

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-chip-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <ExerciseThumb
          name={ex.n}
          bodyPart={ex.id ? exerciseById(ex.id)?.bodyPart ?? null : null}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p
            className="text-[13.5px] font-bold truncate flex items-center gap-1.5"
            style={{ color: "var(--df-text-primary)" }}
          >
            <span className="truncate">{ex.n}</span>
            {anyPR && (
              <Crown
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: FITNESS }}
                aria-label="personal record"
              />
            )}
          </p>
          <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--df-text-muted)" }}>
            {[ex.t, ex.e].filter((s): s is string => !!s).map(label).join(" · ")}
          </p>
          {last && (
            <p
              className="text-[10.5px] mt-0.5 truncate flex items-center gap-1"
              style={{ color: FITNESS }}
            >
              <Clock className="h-3 w-3 shrink-0" />
              Last: {last.lastLine} · {fmtDaysAgo(last.lastDate)}
            </p>
          )}
        </div>
        <button
          onClick={toggleMode}
          className="df-press shrink-0 h-7 px-2 rounded-full text-[10.5px] font-semibold"
          style={{
            background: timed
              ? `color-mix(in srgb, ${FITNESS} 16%, transparent)`
              : "var(--df-chip-fill)",
            color: timed ? FITNESS : "var(--df-text-secondary)",
          }}
          aria-pressed={timed}
          title={timed ? "Switch to weight × reps" : "Switch to timed sets"}
        >
          {timed ? "seconds" : "kg × reps"}
        </button>
        <button
          onClick={onRemove}
          aria-label={`Remove ${ex.n}`}
          className="df-press shrink-0 h-7 w-7 grid place-items-center rounded-full opacity-60 hover:opacity-100"
          style={{ color: "var(--df-destructive-text)" }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* set rows */}
      <div className="mt-2 flex flex-col gap-1.5">
        {ex.s.map((s, i) => {
          const pr =
            s.w != null && s.r != null && e1rm(s.w, s.r) > (historyBest.get(ex.n) ?? 0);
          return (
            <SetRow
              key={i}
              index={i}
              set={s}
              timed={timed}
              pr={pr}
              onToggle={() => completeSet(i)}
              patchSet={(fn) =>
                patch((e) => ({
                  ...e,
                  s: e.s.map((st, j) => (j === i ? fn(st) : st)),
                }))
              }
              onDelete={
                ex.s.length > 1
                  ? () => patch((e) => ({ ...e, s: e.s.filter((_, j) => j !== i) }))
                  : null
              }
            />
          );
        })}
      </div>

      <button
        onClick={addSet}
        className="df-press mt-2 h-8 w-full rounded-md text-[11.5px] font-semibold flex items-center justify-center gap-1"
        style={{ background: "var(--df-chip-fill)", color: "var(--df-text-secondary)" }}
      >
        <Plus className="h-3 w-3" />
        Add set
      </button>
    </div>
  );
}

function SetRow({
  index,
  set,
  timed,
  pr,
  onToggle,
  patchSet,
  onDelete,
}: {
  index: number;
  set: WorkoutSet;
  timed: boolean;
  pr: boolean;
  onToggle: () => void;
  patchSet: (fn: (s: WorkoutSet) => WorkoutSet) => void;
  onDelete: (() => void) | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="shrink-0 h-9 w-7 grid place-items-center rounded-md text-[11px] font-bold tabular-nums"
        style={{
          background: set.c
            ? `color-mix(in srgb, ${FITNESS} 18%, transparent)`
            : "var(--df-chip-fill)",
          color: set.c ? FITNESS : "var(--df-text-muted)",
        }}
      >
        {index + 1}
      </span>

      {timed ? (
        <NumCell
          value={set.d != null ? String(set.d) : ""}
          onChange={(v) => patchSet((s) => ({ ...s, d: v === "" ? null : Number(v) }))}
          unit="sec"
          ariaLabel={`Set ${index + 1} seconds`}
        />
      ) : (
        <>
          <NumCell
            value={set.w != null ? String(set.w) : ""}
            onChange={(v) => patchSet((s) => ({ ...s, w: v === "" ? null : Number(v) }))}
            unit="kg"
            ariaLabel={`Set ${index + 1} weight`}
            width="flex-[1.1]"
          />
          <NumCell
            value={set.r != null ? String(set.r) : ""}
            onChange={(v) => patchSet((s) => ({ ...s, r: v === "" ? null : Number(v) }))}
            unit="reps"
            ariaLabel={`Set ${index + 1} reps`}
          />
        </>
      )}

      {pr && (
        <Crown
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: FITNESS }}
          aria-label="personal record"
        />
      )}

      <button
        onClick={onToggle}
        aria-label={`Mark set ${index + 1} ${set.c ? "undone" : "done"}`}
        aria-pressed={!!set.c}
        className="df-press shrink-0 h-9 w-9 grid place-items-center rounded-md"
        style={{
          background: set.c ? FITNESS : "var(--df-chip-fill)",
          border: `0.5px solid ${set.c ? FITNESS : "var(--df-chip-border)"}`,
          color: set.c ? "var(--df-primary-btn-text)" : "var(--df-text-muted)",
        }}
      >
        <Check className="h-4 w-4" />
      </button>

      {onDelete && (
        <button
          onClick={onDelete}
          aria-label={`Delete set ${index + 1}`}
          className="df-press shrink-0 h-9 w-7 grid place-items-center rounded-md opacity-50 hover:opacity-90"
          style={{ background: "var(--df-chip-fill)", color: "var(--df-text-muted)" }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------- inputs ----

function NumCell({
  value,
  onChange,
  unit,
  ariaLabel,
  width = "flex-1",
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  ariaLabel: string;
  width?: string;
}) {
  return (
    <div
      className={`${width} h-9 rounded-md px-2.5 flex items-center gap-1 min-w-0`}
      style={{
        background: "var(--df-input-fill)",
        border: "0.5px solid var(--df-input-border)",
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, "").slice(0, 6))}
        inputMode="decimal"
        placeholder="—"
        aria-label={ariaLabel}
        className="w-full min-w-0 bg-transparent outline-none text-[14px] font-semibold tabular-nums"
        style={{ color: "var(--df-text-primary)" }}
      />
      <span className="text-[10px] shrink-0" style={{ color: "var(--df-text-muted)" }}>
        {unit}
      </span>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="df-input-glass mt-1 rounded-md px-2 h-10 flex items-center gap-1">
        <Clock className="h-3 w-3 shrink-0" style={{ color: "var(--df-text-muted)" }} />
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-full bg-transparent outline-none text-[13.5px] tabular-nums [color-scheme:light] dark:[color-scheme:dark]"
          style={{ color: "var(--df-text-primary)" }}
        />
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="df-input-glass mt-1 rounded-md px-2.5 h-10 flex items-center">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
          inputMode="numeric"
          placeholder={placeholder}
          aria-label={label}
          className="w-full bg-transparent outline-none text-[13.5px] font-semibold tabular-nums"
          style={{ color: "var(--df-text-primary)" }}
        />
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="text-[10px] font-bold uppercase tracking-[0.06em] flex items-center gap-1"
      style={{ color: "var(--df-text-secondary)" }}
    >
      {children}
    </label>
  );
}

// ---------------------------------------------------- shells ----

function Scrim({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[70] flex justify-center p-0 sm:p-4 items-end sm:items-center"
      style={{
        background: "var(--df-scrim)",
        backdropFilter: "blur(3px)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log a gym session"
    >
      {children}
    </motion.div>
  );
}

/** first set of a freshly added exercise — prefills your last session,
 * cardio defaults to timed. */
function defaultSet(
  ex: ExerciseRecord,
  hist?: ExerciseSummary
): WorkoutSet {
  const last = hist?.lastSet;
  if (last) {
    if (last.d != null && last.w == null) return { d: last.d, c: false };
    if (last.w != null || last.r != null)
      return { w: last.w ?? null, r: last.r ?? 10, c: false };
  }
  if (ex.bodyPart === "cardio") return { d: 300, c: false };
  return { w: null, r: 10, c: false };
}

/** blank set when a card somehow has none. */
function defaultSetShape(timed: boolean): WorkoutSet {
  return timed ? { d: 45, c: false } : { w: null, r: 10, c: false };
}
