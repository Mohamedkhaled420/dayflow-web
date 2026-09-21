"use client";

// TrainingSection — the workout home on the Daily view (Phase 10).
// Shows today's gym sessions (title, clock range, sets / volume /
// muscle split) with tap-to-edit in the gym logger, a dashed CTA when
// empty, a compact "this week" rollup (sessions, tonnage, sets)
// computed client-side from workout_logs.exercises, and the
// ProgressPanel analytics drawer (volume trend, PR board, muscle
// balance).

import { useMemo, useState } from "react";
import { Clock, Dumbbell, Sparkles, Trash2 } from "lucide-react";
import { useDayflowStore, type WorkoutLogRow } from "@/store/useDayflowStore";
import { keyForOffset } from "@/lib/seed";
import { triggerHaptic, hapticWarn } from "@/lib/haptics";
import { CATEGORY_COLORS } from "@/styles/palette";
import { ProgressPanel } from "@/components/dayflow/workout/ProgressPanel";
import {
  parseExercises,
  workoutStats,
  type WorkoutExercise,
} from "@/lib/workout";

const FITNESS = CATEGORY_COLORS.fitness;

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayKeyOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const label = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const fmtVolume = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)} t` : `${Math.round(kg)} kg`;

const fmtDuration = (min: number) =>
  min >= 60
    ? `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`.trim()
    : `${min}m`;

interface Props {
  dateKey: string;
  onLogWorkout: () => void;
  onEditWorkout: (row: WorkoutLogRow) => void;
  /** Opens the AI routine builder sheet. */
  onGenerateRoutine: () => void;
}

export function TrainingSection({ dateKey, onLogWorkout, onEditWorkout, onGenerateRoutine }: Props) {
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const deleteWorkoutLog = useDayflowStore((s) => s.deleteWorkoutLog);
  const [progressOpen, setProgressOpen] = useState(false);

  const sessions = useMemo(
    () =>
      workoutLogs
        .filter((r) => dayKeyOf(r.logged_at) === dateKey)
        .sort((a, b) => a.logged_at.localeCompare(b.logged_at)),
    [workoutLogs, dateKey]
  );

  /** last 7 days rollup — sessions with exercises, tonnage, sets */
  const week = useMemo(() => {
    const keys = new Set(Array.from({ length: 7 }, (_, i) => keyForOffset(-i)));
    let gymSessions = 0;
    let volumeKg = 0;
    let sets = 0;
    let allMin = 0;
    for (const r of workoutLogs) {
      if (!keys.has(dayKeyOf(r.logged_at))) continue;
      allMin += r.duration_minutes ?? 0;
      const exs = parseExercises(r.exercises ?? null);
      if (exs.length === 0) continue;
      gymSessions++;
      const st = workoutStats(exs);
      volumeKg += st.volumeKg;
      sets += st.sets;
    }
    return { gymSessions, volumeKg, sets, allMin };
  }, [workoutLogs]);

  return (
    <section
      className="mt-5 rounded-[20px] p-4"
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label="Training"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Dumbbell className="h-4 w-4 shrink-0" style={{ color: FITNESS }} />
          <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
            Training
          </h2>
          {week.gymSessions > 0 && (
            <span
              className="text-[11px] px-2 h-5 rounded-full flex items-center shrink-0 font-semibold"
              style={{
                background: `color-mix(in srgb, ${FITNESS} 12%, transparent)`,
                color: FITNESS,
              }}
            >
              {week.gymSessions} gym session{week.gymSessions > 1 ? "s" : ""} / 7d
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              triggerHaptic();
              onGenerateRoutine();
            }}
            className="df-press df-glass-chip df-btn-capsule h-8 px-3 text-[12px] font-semibold flex items-center gap-1.5"
            style={{
              background: `color-mix(in srgb, ${FITNESS} 12%, transparent)`,
              border: `0.5px solid color-mix(in srgb, ${FITNESS} 40%, transparent)`,
              color: FITNESS,
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI plan
          </button>
          <button
            onClick={() => {
              triggerHaptic();
              onLogWorkout();
            }}
            className="df-press df-btn-secondary df-btn-capsule h-8 px-3 text-[12px] font-semibold flex items-center gap-1.5 shrink-0"
          >
            Log workout
          </button>
        </div>
      </div>

      {/* today's sessions */}
      {sessions.length === 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={() => {
              triggerHaptic();
              onLogWorkout();
            }}
            className="df-press w-full rounded-[20px] py-4 flex flex-col items-center gap-1.5"
            style={{
              background: "var(--df-input-fill)",
              border: `1.5px dashed color-mix(in srgb, ${FITNESS} 40%, transparent)`,
            }}
          >
            <Dumbbell className="h-5 w-5" style={{ color: FITNESS }} />
            <span className="text-[12px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
              Log sets from the 1,324-exercise library
            </span>
            <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
              Bench, squat, run — weight × reps with rest timer & PR tracking
            </span>
          </button>
          <button
            onClick={() => {
              triggerHaptic();
              onGenerateRoutine();
            }}
            className="df-press w-full rounded-[16px] py-3 flex flex-col items-center gap-1"
            style={{
              background: `color-mix(in srgb, ${FITNESS} 7%, transparent)`,
              border: `1px dashed color-mix(in srgb, ${FITNESS} 30%, transparent)`,
            }}
          >
            <span
              className="text-[12px] font-semibold flex items-center gap-1.5"
              style={{ color: FITNESS }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Or let AI build today&apos;s routine
            </span>
            <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
              Science-backed plan — your goal, gear and history in, exercises out
            </span>
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          {sessions.map((row) => (
            <SessionRow
              key={row.id}
              row={row}
              onEdit={() => onEditWorkout(row)}
              onDelete={() => void deleteWorkoutLog(row.id)}
            />
          ))}
        </div>
      )}

      {/* weekly rollup */}
      {(week.volumeKg > 0 || week.sets > 0) && (
        <div
          className="mt-3 rounded-[14px] px-3 py-2 flex items-center gap-2 text-[11px] font-semibold flex-wrap"
          style={{
            background: "var(--df-input-fill)",
            color: "var(--df-text-secondary)",
          }}
        >
          <span>This week</span>
          <span style={{ color: FITNESS }}>{fmtVolume(week.volumeKg)} moved</span>
          <span className="opacity-50">·</span>
          <span>{week.sets} sets</span>
          <span className="opacity-50">·</span>
          <span>{fmtDuration(week.allMin)} active</span>
        </div>
      )}

      {/* analytics drawer — volume trend, PR board, muscle balance */}
      <ProgressPanel
        open={progressOpen}
        onToggle={() => {
          triggerHaptic();
          setProgressOpen((v) => !v);
        }}
      />
    </section>
  );
}

function SessionRow({
  row,
  onEdit,
  onDelete,
}: {
  row: WorkoutLogRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const exs: WorkoutExercise[] = parseExercises(row.exercises ?? null);
  const st = workoutStats(exs);
  const dur = row.duration_minutes ?? 0;
  const muscles = Object.entries(st.byTarget)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div
      className="rounded-[14px] px-3 py-2.5 flex items-center gap-2.5"
      style={{ background: "var(--df-input-fill)" }}
    >
      <button
        onClick={onEdit}
        className="df-press flex-1 min-w-0 text-left"
        aria-label={`Edit ${row.type}`}
      >
        <span className="flex items-center gap-2">
          <span
            className="text-[13px] font-semibold truncate"
            style={{ color: "var(--df-text-primary)" }}
          >
            {row.type}
          </span>
          <span
            className="text-[10.5px] shrink-0 flex items-center gap-1"
            style={{ color: "var(--df-text-muted)" }}
          >
            <Clock className="h-3 w-3" />
            {clock(row.logged_at)}
            {dur > 0 && ` · ${fmtDuration(dur)}`}
          </span>
        </span>
        <span className="block text-[11px] mt-0.5 truncate" style={{ color: "var(--df-text-muted)" }}>
          {exs.length > 0
            ? `${exs.length} exercise${exs.length > 1 ? "s" : ""} · ${st.sets} set${st.sets > 1 ? "s" : ""}${
                st.volumeKg > 0 ? ` · ${fmtVolume(st.volumeKg)}` : ""
              }${muscles.length ? ` · ${muscles.map(([m]) => label(m)).join(", ")}` : ""}`
            : "Quick log — no exercises attached"}
        </span>
      </button>
      <button
        onClick={() => {
          hapticWarn();
          onDelete();
        }}
        aria-label={`Delete ${row.type}`}
        className="df-press shrink-0 h-7 w-7 grid place-items-center rounded-full opacity-50 hover:opacity-100"
        style={{ color: "var(--df-destructive-text)" }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
