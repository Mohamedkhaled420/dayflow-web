"use client";

// ProgressPanel — training analytics inside the Training section
// (Phase 10). Everything is computed client-side from workout_logs:
//
//   volume   8-week tonnage bar chart (SVG, design tokens only) with
//            week-over-week trend
//   PRs      all-time personal-record board (Epley e1RM per exercise)
//   muscles  30-day muscle distribution bars — spot imbalances early
//
// Zero network, zero schema: it renders whatever the local store has
// already synced, so it works offline and updates the moment a session
// is saved.

import { useMemo } from "react";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { useDayflowStore, type WorkoutLogRow } from "@/store/useDayflowStore";
import { CATEGORY_COLORS } from "@/styles/palette";
import {
  muscleSplit,
  personalRecords,
  weeklyVolume,
  fmtDaysAgo,
  type WeekBucket,
} from "@/lib/workout";

const FITNESS = CATEGORY_COLORS.fitness;

const fmtVolume = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)} t` : `${Math.round(kg)} kg`;
const label = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

interface Props {
  open: boolean;
  onToggle: () => void;
}

export function ProgressPanel({ open, onToggle }: Props) {
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);

  const weeks = useMemo(() => weeklyVolume(workoutLogs, 8), [workoutLogs]);
  const prs = useMemo(() => personalRecords(workoutLogs), [workoutLogs]);
  const muscles = useMemo(() => muscleSplit(workoutLogs, 30), [workoutLogs]);

  const hasData = weeks.some((w) => w.sets > 0) || prs.length > 0;

  const thisWeek = weeks[weeks.length - 1];
  const prevWeek = weeks[weeks.length - 2];
  const delta =
    prevWeek && prevWeek.volumeKg > 0
      ? Math.round(
          ((thisWeek.volumeKg - prevWeek.volumeKg) / prevWeek.volumeKg) * 100
        )
      : null;

  return (
    <div
      className="mt-2 rounded-[16px]"
      style={{ background: "var(--df-input-fill)" }}
      role="region"
      aria-label="Training progress"
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="df-press w-full px-3 h-10 flex items-center gap-2 text-left"
      >
        <span
          className="text-[11.5px] font-bold uppercase tracking-[0.06em] flex-1"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Progress
        </span>
        {hasData && !open && (
          <span
            className="text-[10.5px] font-semibold px-2 h-5 rounded-full flex items-center"
            style={{
              background: `color-mix(in srgb, ${FITNESS} 12%, transparent)`,
              color: FITNESS,
            }}
          >
            {prs.length} PR{prs.length === 1 ? "" : "s"}
          </span>
        )}
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 transition-transform"
          style={{
            color: "var(--df-text-muted)",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-3.5">
          {!hasData ? (
            <p
              className="text-[11.5px] leading-relaxed py-1"
              style={{ color: "var(--df-text-muted)" }}
            >
              Log a gym session with exercises and your volume trend, personal
              records and muscle balance chart themselves here.
            </p>
          ) : (
            <>
              <VolumeChart weeks={weeks} delta={delta} />

              {prs.length > 0 && <PRBoard prs={prs.slice(0, 6)} />}

              {muscles.length > 0 && <MuscleChart split={muscles.slice(0, 6)} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------ volume ----

function VolumeChart({ weeks, delta }: { weeks: WeekBucket[]; delta: number | null }) {
  const W = 320;
  const H = 96;
  const PAD_B = 16; // week labels
  const chartH = H - PAD_B - 8;
  const max = Math.max(...weeks.map((w) => w.volumeKg), 1);
  const bw = W / weeks.length;
  const barW = Math.min(22, bw * 0.56);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--df-text-muted)" }}>
          Volume — 8 weeks
        </span>
        <span className="flex-1" />
        {delta != null && (
          <span
            className="text-[10.5px] font-semibold flex items-center gap-0.5"
            style={{ color: delta >= 0 ? FITNESS : "var(--df-text-muted)" }}
          >
            {delta >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta >= 0 ? "+" : ""}
            {delta}% vs last wk
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full mt-1.5"
        role="img"
        aria-label={`Weekly training volume, latest ${fmtVolume(weeks[weeks.length - 1].volumeKg)}`}
      >
        {/* baseline */}
        <line
          x1={0}
          y1={chartH + 8}
          x2={W}
          y2={chartH + 8}
          style={{ stroke: "var(--df-chip-border)", strokeWidth: 0.5 }}
        />
        {weeks.map((w, i) => {
          const h = w.volumeKg > 0 ? Math.max(3, (w.volumeKg / max) * chartH) : 2;
          const x = i * bw + (bw - barW) / 2;
          const y = chartH + 8 - h;
          const last = i === weeks.length - 1;
          return (
            <g key={w.weekStart}>
              <title>{`Week of ${w.label}: ${fmtVolume(w.volumeKg)} · ${w.sets} sets · ${w.sessions} session${w.sessions === 1 ? "" : "s"}`}</title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={Math.min(3, barW / 3)}
                style={{
                  fill:
                    w.volumeKg > 0
                      ? last
                        ? FITNESS
                        : `color-mix(in srgb, ${FITNESS} 55%, transparent)`
                      : "var(--df-chip-fill)",
                }}
              />
              <text
                x={i * bw + bw / 2}
                y={H - 3}
                textAnchor="middle"
                style={{
                  fill: last ? FITNESS : "var(--df-text-muted)",
                  fontSize: 8.5,
                  fontWeight: last ? 700 : 500,
                }}
              >
                {w.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --------------------------------------------------------- PRs ----

function PRBoard({ prs }: { prs: ReturnType<typeof personalRecords> }) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--df-text-muted)" }}>
        Personal records
      </span>
      <div className="mt-1.5 flex flex-col">
        {prs.map((pr, i) => (
          <div
            key={pr.name}
            className="flex items-center gap-2 py-1.5"
            style={{
              borderBottom:
                i < prs.length - 1
                  ? "0.5px solid color-mix(in srgb, var(--df-chip-border) 60%, transparent)"
                  : "none",
            }}
          >
            <span
              className="shrink-0 h-5 w-5 rounded-full grid place-items-center text-[10px] font-bold"
              style={{
                background: `color-mix(in srgb, ${FITNESS} ${i === 0 ? 22 : 10}%, transparent)`,
                color: FITNESS,
              }}
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="text-[12px] font-semibold truncate"
                style={{ color: "var(--df-text-primary)" }}
              >
                {pr.name}
              </p>
              <p className="text-[10px] truncate" style={{ color: "var(--df-text-muted)" }}>
                {pr.weightKg} kg × {pr.reps} · {fmtDaysAgo(pr.date)}
              </p>
            </div>
            <span
              className="shrink-0 text-[11.5px] font-bold tabular-nums"
              style={{ color: FITNESS }}
              title="Estimated 1RM (Epley)"
            >
              {Math.round(pr.e1rm)}
              <span className="text-[9px] font-medium opacity-70"> kg e1RM</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------ muscles ----

function MuscleChart({ split }: { split: [string, number][] }) {
  const max = Math.max(...split.map(([, n]) => n), 1);
  const total = split.reduce((a, [, n]) => a + n, 0);
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--df-text-muted)" }}>
        Muscle balance — 30 days
      </span>
      <div className="mt-1.5 flex flex-col gap-1">
        {split.map(([target, n]) => (
          <div key={target} className="flex items-center gap-2">
            <span
              className="shrink-0 w-[74px] text-[10.5px] font-semibold truncate text-right"
              style={{ color: "var(--df-text-secondary)" }}
            >
              {label(target)}
            </span>
            <div className="flex-1 h-[7px] rounded-full overflow-hidden" style={{ background: "var(--df-chip-fill)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(4, (n / max) * 100)}%`,
                  background: `color-mix(in srgb, ${FITNESS} 70%, transparent)`,
                }}
              />
            </div>
            <span
              className="shrink-0 w-[52px] text-[10px] font-semibold tabular-nums"
              style={{ color: "var(--df-text-muted)" }}
            >
              {Math.round((n / total) * 100)}% · {n}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type { WorkoutLogRow };
