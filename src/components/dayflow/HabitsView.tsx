"use client";

// HabitsView — the goals dashboard: a 7-day met/unmet grid per
// goal, current streaks, and weekly completion. This is the
// "tailored to my goals" heart of the web tracker.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Flame, Target, Trophy } from "lucide-react";
import { useDayflowData } from "@/lib/store";
import { keyForOffset } from "@/lib/seed";
import { fmtDuration, goalStreak, goalsForDay, weekOf } from "@/lib/compute";
import type { GoalProgress } from "@/lib/types";

export function HabitsView() {
  const data = useDayflowData();
  const todayKey = keyForOffset(0);

  const week = useMemo(() => weekOf(todayKey), [todayKey]);

  // 7-day grid of goal states (Mon..Sun of the current week)
  const grid = useMemo(
    () =>
      week.map((d) => ({
        dateKey: d.dateKey,
        label: d.label,
        dateLabel: d.dateLabel,
        isToday: d.isToday,
        isFuture: d.isFuture,
        goals: d.isFuture ? null : goalsForDay(data, d.dateKey),
      })),
    [week, data]
  );

  const goals = useMemo(() => goalsForDay(data, todayKey), [data, todayKey]);

  const bestStreak = useMemo(() => {
    const keys: GoalProgress["key"][] = ["work", "personal", "fitness", "sleep", "water", "meals"];
    const streaks = keys.map((k) => ({ key: k, streak: goalStreak(data, k, todayKey) }));
    return streaks.reduce((a, b) => (b.streak > a.streak ? b : a));
  }, [data, todayKey]);

  const metCount = goals.filter((g) => g.met).length;

  return (
    <div className="df-scroll h-full overflow-y-auto px-4 sm:px-6 py-5">
      {/* header */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-[21px] font-bold tracking-tight" style={{ color: "var(--df-text-primary)" }}>
            Habits & goals
          </h1>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--df-text-secondary)" }}>
            Built around your goals: work, personal time, fitness, sleep, water, and meals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="df-summary-card px-3.5 py-2 flex items-center gap-2"
            aria-label="Goals met today"
          >
            <Trophy className="h-4 w-4" style={{ color: "var(--df-accent)" }} />
            <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--df-text-primary)" }}>
              {metCount}/6
            </span>
            <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
              today
            </span>
          </div>
          <div
            className="df-summary-card px-3.5 py-2 flex items-center gap-2"
            aria-label="Best streak"
          >
            <Flame className="h-4 w-4" style={{ color: "var(--df-streak)", fill: "var(--df-streak-fill)" }} />
            <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--df-text-primary)" }}>
              {bestStreak.streak}d
            </span>
            <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
              {goals.find((g) => g.key === bestStreak.key)?.label.toLowerCase()} streak
            </span>
          </div>
        </div>
      </div>

      {/* goal rows */}
      <section
        className="mt-5 rounded-lg p-4"
        style={{
          background: "var(--df-daily-grid-fill)",
          border: "0.5px solid var(--df-daily-grid-border)",
        }}
        aria-label="Weekly goal grid"
      >
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4" style={{ color: "var(--df-accent)" }} />
          <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
            This week
          </h2>
          <span className="text-[11.5px]" style={{ color: "var(--df-text-muted)" }}>
            a filled dot means the goal was met that day
          </span>
        </div>

        <div className="mt-3 overflow-x-auto df-scroll">
          <div className="min-w-[560px] flex flex-col gap-2.5">
            {/* day header */}
            <div className="flex items-center gap-2 pl-[168px]">
              {grid.map((d) => (
                <div key={d.dateKey} className="w-[44px] text-center">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      color: d.isToday ? "var(--df-accent-text)" : "var(--df-text-muted)",
                    }}
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

            {goals.map((g) => {
              const streak = goalStreak(data, g.key, todayKey);
              return (
                <div key={g.key} className="flex items-center gap-2">
                  <div className="w-[168px] shrink-0 flex items-center gap-2 pr-2">
                    <span
                      className="w-2.5 h-2.5 rounded-[4px] shrink-0"
                      style={{ background: g.colorHex }}
                    />
                    <span
                      className="text-[12px] font-semibold truncate"
                      style={{ color: "var(--df-text-primary)" }}
                      title={g.label}
                    >
                      {g.label}
                    </span>
                  </div>
                  {grid.map((d) => {
                    const dayGoal = d.goals?.find((x) => x.key === g.key) ?? null;
                    const met = dayGoal?.met ?? false;
                    const partial =
                      dayGoal != null && !met && dayGoal.done > dayGoal.target * 0.5;
                    return (
                      <div
                        key={d.dateKey}
                        className="w-[44px] grid place-items-center"
                        title={
                          d.isFuture
                            ? `${d.label} — upcoming`
                            : `${d.label} · ${g.label}: ${
                                dayGoal?.unit === "count"
                                  ? `${dayGoal.done.toFixed(0)}/${dayGoal.target}`
                                  : `${fmtDuration(dayGoal?.done ?? 0)} / ${fmtDuration(g.target)}`
                              }`
                        }
                      >
                        <motion.div
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          className="h-[26px] w-[26px] rounded-[8px] grid place-items-center"
                          style={{
                            background: met
                              ? g.colorHex
                              : partial
                                ? `color-mix(in srgb, ${g.colorHex} 30%, transparent)`
                                : "var(--df-daily-empty)",
                            border: met
                              ? `0.5px solid color-mix(in srgb, ${g.colorHex} 60%, transparent)`
                              : "0.5px solid color-mix(in srgb, var(--df-text-muted) 25%, transparent)",
                            opacity: d.isFuture ? 0.3 : 1,
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
                          {!met && partial && (
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: g.colorHex }}
                            />
                          )}
                        </motion.div>
                      </div>
                    );
                  })}
                  <div className="ml-2 flex items-center gap-1 shrink-0">
                    <Flame
                      className="h-3 w-3"
                      style={{
                        color: streak > 0 ? "var(--df-streak)" : "var(--df-text-muted)",
                      }}
                    />
                    <span
                      className="text-[11px] font-bold tabular-nums"
                      style={{
                        color: streak > 0 ? "var(--df-text-primary)" : "var(--df-text-muted)",
                      }}
                    >
                      {streak}d
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* today's goals detail */}
      <section
        className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-3"
        aria-label="Today's goal details"
      >
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.done / Math.max(g.target, 1)) * 100));
          const streak = goalStreak(data, g.key, todayKey);
          const valueLabel =
            g.unit === "count"
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
                  g.met
                    ? `color-mix(in srgb, ${g.colorHex} 55%, transparent)`
                    : "var(--df-daily-grid-border)"
                }`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-[4px] shrink-0"
                    style={{ background: g.colorHex }}
                  />
                  <span
                    className="text-[12.5px] font-bold truncate"
                    style={{ color: "var(--df-text-primary)" }}
                  >
                    {g.label}
                  </span>
                </span>
                {g.met ? (
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
                    style={{
                      color: "var(--df-text-muted)",
                      border: "0.5px solid var(--df-chip-border)",
                    }}
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
                <span
                  className="text-[11px] font-semibold tabular-nums"
                  style={{ color: "var(--df-text-secondary)" }}
                >
                  {valueLabel}
                </span>
                <span
                  className="text-[10.5px] flex items-center gap-1 tabular-nums"
                  style={{ color: streak > 0 ? "var(--df-text-primary)" : "var(--df-text-muted)" }}
                >
                  <Flame
                    className="h-3 w-3"
                    style={{ color: streak > 0 ? "var(--df-streak)" : "var(--df-text-muted)" }}
                  />
                  {streak}-day streak
                </span>
              </div>
            </motion.div>
          );
        })}
      </section>

      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
        Targets are fully customizable in Settings → Goals. Streaks count consecutive days a goal
        was met, with today forgiven until midnight.
      </p>
    </div>
  );
}
