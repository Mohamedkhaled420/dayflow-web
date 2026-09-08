"use client";

// WeeklyView — weekly review, tailored to life tracking: stacked
// daily bars by category, sleep & hydration trends against goals,
// a tracking heatmap, workout log, and auto highlights.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Dumbbell, Droplet, MoonStar, TrendingUp } from "lucide-react";
import { useDayflowData, useSortedCategories } from "@/lib/store";
import { keyForOffset } from "@/lib/seed";
import {
  aggregateWeek,
  categoryById,
  eventDuration,
  fmtDuration,
  goalsForDay,
  shiftWeek,
  toMinutes,
  weekCategoryTotals,
  weekOf,
  weekRangeLabel,
  weekWorkoutSessions,
  workoutsForDay,
} from "@/lib/compute";
import { DonutChart } from "@/components/dayflow/DonutChart";

const HEATMAP_START = 5 * 60;
const HEATMAP_END = 23 * 60;
const HEAT_ROWS = (HEATMAP_END - HEATMAP_START) / 60; // 18 hour-rows
const HEAT_COLS = 7;

export function WeeklyView() {
  const data = useDayflowData();
  const categories = useSortedCategories();
  const [anchor, setAnchor] = useState(keyForOffset(0));

  const week = useMemo(() => weekOf(anchor), [anchor]);
  const days = useMemo(() => aggregateWeek(data, week), [data, week]);
  const catTotals = useMemo(() => weekCategoryTotals(days), [days]);
  const todayKey = keyForOffset(0);
  const atCurrentWeek = week[6].dateKey >= todayKey;

  const donutSlices = catTotals.map((t) => {
    const c = categoryById(data.categories, t.categoryId);
    return { label: c.name, value: t.minutes, colorHex: c.colorHex };
  });

  const totalTrackedWeek = days.reduce((s, d) => s + d.totalTracked, 0);
  const workouts = weekWorkoutSessions(data, week);
  const sleepAvg = days.filter((d) => d.sleepMinutes > 0);
  const avgSleep =
    sleepAvg.length > 0 ? sleepAvg.reduce((s, d) => s + d.sleepMinutes, 0) / sleepAvg.length : 0;
  const waterAvg = days.reduce((s, d) => s + d.waterGlasses, 0) / 7;
  const workAvg = days.reduce((s, d) => s + (d.minutesByCategory["work"] ?? 0), 0) / 7;
  const personalTotal = days.reduce((s, d) => s + (d.minutesByCategory["personal"] ?? 0), 0);

  const goalsMetThisWeek = useMemo(() => {
    // count days where ≥4 of 6 goals were met
    return week.filter((d) => {
      if (d.isFuture) return false;
      const g = goalsForDay(data, d.dateKey);
      return g.filter((x) => x.met).length >= 4;
    }).length;
  }, [data, week]);

  const maxBar = Math.max(...days.map((d) => d.totalTracked), 60);

  const highlights: string[] = useMemo(() => {
    const out: string[] = [];
    const bestDay = days.reduce((a, b) => (b.totalTracked > a.totalTracked ? b : a));
    out.push(
      `Most tracked day: ${bestDay.label} — ${fmtDuration(bestDay.totalTracked)} across categories`
    );
    if (workouts.count > 0) {
      out.push(
        `${workouts.count} workouts this week, ${fmtDuration(workouts.minutes)} of training (${data.goals.fitnessSessionsPerWeek}/week goal: ${
          workouts.count >= data.goals.fitnessSessionsPerWeek ? "met" : "still open"
        })`
      );
    }
    if (avgSleep > 0) {
      out.push(
        `Average sleep ${fmtDuration(avgSleep)} vs ${fmtDuration(data.goals.sleepMinutes)} target`
      );
    }
    out.push(`Hydration averaged ${waterAvg.toFixed(1)} glasses/day (goal ${data.goals.waterGlasses})`);
    return out;
  }, [days, workouts, avgSleep, waterAvg, data.goals]);

  return (
    <div className="df-scroll h-full overflow-y-auto px-4 sm:px-6 py-5">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor((a) => shiftWeek(a, -1))}
            aria-label="Previous week"
            className="df-press w-7 h-7 rounded-full grid place-items-center"
            style={{ color: "var(--df-text-primary)" }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1
            className="text-[21px] font-bold tracking-tight"
            style={{ color: "var(--df-text-primary)" }}
          >
            {weekRangeLabel(week)}
          </h1>
          <button
            onClick={() => setAnchor((a) => shiftWeek(a, 1))}
            disabled={atCurrentWeek}
            aria-label="Next week"
            className="df-press w-7 h-7 rounded-full grid place-items-center disabled:opacity-35"
            style={{ color: "var(--df-text-primary)" }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[12.5px]" style={{ color: "var(--df-text-secondary)" }}>
          {goalsMetThisWeek} strong days · {fmtDuration(totalTrackedWeek)} tracked in total
        </p>
      </div>

      {/* stat tiles */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatTile
          icon={<Dumbbell className="h-3.5 w-3.5" />}
          label="Workouts"
          value={`${workouts.count}`}
          sub={fmtDuration(workouts.minutes)}
        />
        <StatTile
          icon={<MoonStar className="h-3.5 w-3.5" />}
          label="Avg sleep"
          value={`${(avgSleep / 60).toFixed(1)}h`}
          sub={`goal ${(data.goals.sleepMinutes / 60).toFixed(0)}h`}
        />
        <StatTile
          icon={<Droplet className="h-3.5 w-3.5" />}
          label="Avg water"
          value={`${waterAvg.toFixed(1)} gl`}
          sub={`goal ${data.goals.waterGlasses}`}
        />
        <StatTile
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Avg work"
          value={fmtDuration(Math.round(workAvg))}
        />
        <StatTile
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Personal"
          value={fmtDuration(personalTotal)}
          sub="side projects & learning"
        />
      </div>

      <div className="mt-5 grid xl:grid-cols-2 gap-4">
        {/* stacked daily bars */}
        <Card title="Daily tracked time" sub="Stacked by category">
          <div className="mt-3 flex items-end gap-2 h-[150px]">
            {days.map((d) => {
              const height = Math.max((d.totalTracked / maxBar) * 120, d.totalTracked > 0 ? 6 : 0);
              return (
                <div key={d.dateKey} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span
                    className="text-[9.5px] font-semibold tabular-nums"
                    style={{
                      color: d.isToday ? "var(--df-accent-text)" : "var(--df-text-muted)",
                    }}
                  >
                    {d.totalTracked > 0 ? `${(d.totalTracked / 60).toFixed(0)}h` : ""}
                  </span>
                  <div
                    className="w-full rounded-[5px] overflow-hidden flex flex-col justify-end relative"
                    style={{
                      height: Math.max(height, 4),
                      background: "var(--df-daily-empty)",
                      border: "0.5px solid color-mix(in srgb, var(--df-text-muted) 18%, transparent)",
                    }}
                    title={`${d.label} — ${fmtDuration(d.totalTracked)}`}
                  >
                    <div className="flex flex-col-reverse w-full h-full">
                      {categories
                        .filter((c) => c.kind === "time")
                        .map((c) => {
                          const mins = d.minutesByCategory[c.id] ?? 0;
                          if (mins <= 0) return null;
                          const frac = mins / Math.max(d.totalTracked, 1);
                          return (
                            <div
                              key={c.id}
                              style={{
                                height: `${frac * 100}%`,
                                background: c.colorHex,
                                opacity: 0.85,
                              }}
                              title={`${c.name} ${fmtDuration(mins)}`}
                            />
                          );
                        })}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-medium"
                    style={{
                      color: d.isToday ? "var(--df-accent-text)" : "var(--df-text-secondary)",
                      fontWeight: d.isToday ? 700 : 400,
                    }}
                  >
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
          {/* legend */}
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {categories
              .filter((c) => c.kind === "time" && catTotals.some((t) => t.categoryId === c.id))
              .map((c) => (
                <span key={c.id} className="flex items-center gap-1.5 text-[10.5px]">
                  <span
                    className="w-2 h-2 rounded-[3px]"
                    style={{ background: c.colorHex, opacity: 0.85 }}
                  />
                  <span style={{ color: "var(--df-text-secondary)" }}>{c.name}</span>
                </span>
              ))}
          </div>
        </Card>

        {/* weekly distribution donut */}
        <Card title="Weekly distribution" sub="Where the week went">
          <div className="mt-3 flex items-center gap-5 flex-wrap">
            <DonutChart
              slices={donutSlices}
              centerTitle="tracked"
              centerValue={fmtDuration(totalTrackedWeek)}
            />
            <ul className="flex-1 min-w-[160px] flex flex-col gap-1">
              {donutSlices.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-[11.5px]">
                  <span
                    className="w-2.5 h-2.5 rounded-[4px] shrink-0"
                    style={{ background: s.colorHex, opacity: 0.75 }}
                  />
                  <span
                    className="truncate flex-1"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
                    {s.label}
                  </span>
                  <span
                    className="font-semibold shrink-0 tabular-nums"
                    style={{ color: "var(--df-text-primary)" }}
                  >
                    {fmtDuration(s.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* sleep & hydration trend */}
        <Card title="Sleep & hydration" sub="Daily values against your goals">
          <TrendRow
            label="Sleep"
            unit="h"
            goal={(data.goals.sleepMinutes / 60).toFixed(1)}
            values={days.map((d) => (d.sleepMinutes / 60).toFixed(1))}
            todayIndex={days.findIndex((d) => d.isToday)}
            colorHex="#6E66D4"
            futureFlags={days.map((d) => d.isFuture)}
          />
          <div className="mt-5">
            <TrendRow
              label="Water"
              unit="gl"
              goal={`${data.goals.waterGlasses}`}
              values={days.map((d) => d.waterGlasses.toFixed(1))}
              todayIndex={days.findIndex((d) => d.isToday)}
              colorHex="#56CFEE"
              futureFlags={days.map((d) => d.isFuture)}
            />
          </div>
        </Card>

        {/* heatmap */}
        <Card title="Tracking heatmap" sub="Tracked minutes per hour of day">
          <div className="mt-3 overflow-x-auto df-scroll">
            <div className="min-w-[300px]">
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `34px repeat(${HEAT_COLS}, 1fr)` }}>
                {Array.from({ length: HEAT_ROWS }, (_, r) => {
                  const hour = HEATMAP_START / 60 + r;
                  return (
                    <div key={`label-${r}`} className="contents">
                      <span
                        className="text-[9px] font-medium text-right pr-1"
                        style={{ color: "var(--df-text-muted)" }}
                      >
                        {hour > 12 ? `${hour - 12}p` : `${hour}a`}
                      </span>
                      {week.map((d, c) => {
                        const acts = data.events.filter(
                          (e) =>
                            e.dateKey === d.dateKey &&
                            toMinutes(e.start) < (hour + 1) * 60 &&
                            toMinutes(e.end) > hour * 60
                        );
                        const mins = acts.reduce(
                          (s, e) => s + Math.min(eventDuration(e), 60),
                          0
                        );
                        const level = mins === 0 ? 0 : Math.min(3, Math.ceil(mins / 20));
                        return (
                          <div
                            key={`${r}-${c}`}
                            className="h-[14px] rounded-[3px]"
                            style={{
                              background:
                                level === 0
                                  ? "var(--df-daily-empty)"
                                  : `color-mix(in srgb, var(--df-accent) ${25 * level}%, transparent)`,
                              border:
                                level === 0
                                  ? "0.5px solid color-mix(in srgb, var(--df-text-muted) 22%, transparent)"
                                  : `0.5px solid color-mix(in srgb, var(--df-accent) ${30 + level * 15}%, transparent)`,
                              opacity: d.isFuture ? 0.35 : 1,
                            }}
                            title={`${d.label} ${hour}:00 — ${mins ? `${mins}m tracked` : "no data"}`}
                          />
                        );
                      })}
                    </div>
                  );
                })}
                <div className="contents">
                  <span />
                  {week.map((d) => (
                    <span
                      key={`h-${d.dateKey}`}
                      className="text-[9px] text-center font-semibold"
                      style={{
                        color: d.isToday ? "var(--df-accent-text)" : "var(--df-text-muted)",
                      }}
                    >
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* workouts */}
        <Card title="Workout log" sub={`${workouts.count} sessions · ${fmtDuration(workouts.minutes)}`}>
          <div className="mt-3 flex flex-col gap-2">
            {week.flatMap((d) =>
              workoutsForDay(data.events, d.dateKey).map((e) => ({
                day: d.label,
                dateLabel: d.dateLabel,
                event: e,
              }))
            ).map(({ day, dateLabel, event }) => (
              <div
                key={event.id}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2"
                style={{
                  background: "var(--df-chip-fill)",
                  border: "0.5px solid var(--df-chip-border)",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: "#FF706B" }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[12px] font-semibold truncate"
                    style={{ color: "var(--df-text-primary)" }}
                  >
                    {event.title}
                  </div>
                  <div className="text-[10.5px]" style={{ color: "var(--df-text-muted)" }}>
                    {day}, {dateLabel}
                  </div>
                </div>
                <span
                  className="text-[11.5px] font-bold shrink-0 tabular-nums"
                  style={{ color: "var(--df-summary-value)" }}
                >
                  {fmtDuration(eventDuration(event))}
                </span>
              </div>
            ))}
            {workouts.count === 0 && (
              <p className="text-[12px]" style={{ color: "var(--df-text-muted)" }}>
                No workouts logged this week. Log one from the timeline — even a walk counts.
              </p>
            )}
          </div>
        </Card>

        {/* highlights */}
        <Card title="Highlights" sub="What stood out">
          <ul className="mt-3 flex flex-col gap-2">
            {highlights.map((h, i) => (
              <motion.li
                key={h}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.25 }}
                className="flex items-start gap-2"
              >
                <span
                  className="mt-[6px] w-[4.5px] h-[4.5px] rounded-full shrink-0"
                  style={{ background: "var(--df-accent)" }}
                />
                <span
                  className="text-[12.5px] leading-relaxed"
                  style={{ color: "var(--df-text-secondary)" }}
                >
                  {h}
                </span>
              </motion.li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function TrendRow({
  label,
  unit,
  goal,
  values,
  todayIndex,
  colorHex,
  futureFlags,
}: {
  label: string;
  unit: string;
  goal: string;
  values: string[];
  todayIndex: number;
  colorHex: string;
  futureFlags: boolean[];
}) {
  const maxV = Math.max(...values.map(Number), Number(goal), 1);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          {label}
        </span>
        <span className="text-[10.5px] tabular-nums" style={{ color: "var(--df-text-muted)" }}>
          goal {goal}
          {unit}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-1.5 h-[86px]">
        {values.map((v, i) => {
          const num = Number(v);
          const height = (num / maxV) * 70;
          const met = num >= Number(goal) - 0.001;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span
                className="text-[9px] font-semibold tabular-nums"
                style={{ color: met ? "var(--df-summary-value)" : "var(--df-text-muted)" }}
              >
                {futureFlags[i] ? "" : num > 0 ? v : ""}
              </span>
              <div
                className="w-full rounded-[4px] transition-[height]"
                style={{
                  height: Math.max(height, futureFlags[i] ? 0 : 3),
                  background: futureFlags[i] || num === 0 ? "var(--df-daily-empty)" : colorHex,
                  opacity: met ? 0.9 : 0.55,
                  border: `0.5px solid color-mix(in srgb, ${colorHex} ${
                    num > 0 && !futureFlags[i] ? 45 : 15
                  }%, transparent)`,
                }}
                title={`${label} — ${v}${unit}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {values.map((_, i) => (
          <span
            key={i}
            className="flex-1 text-center text-[9.5px] font-medium"
            style={{
              color: i === todayIndex ? "var(--df-accent-text)" : "var(--df-text-muted)",
              fontWeight: i === todayIndex ? 700 : 400,
            }}
          >
            {["M", "T", "W", "T", "F", "S", "S"][i]}
          </span>
        ))}
      </div>
    </div>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg p-4"
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label={title}
    >
      <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
        {title}
      </h2>
      {sub && (
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--df-text-muted)" }}>
          {sub}
        </p>
      )}
      {children}
    </section>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="df-summary-card px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span style={{ color: "var(--df-accent)" }}>{icon}</span>
        <span
          className="text-[17px] font-bold leading-none tabular-nums"
          style={{ color: "var(--df-summary-value)" }}
        >
          {value}
        </span>
      </div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wide mt-1.5"
        style={{ color: "var(--df-text-muted)" }}
      >
        {label}
      </div>
      {sub && (
        <div className="text-[9.5px] mt-0.5" style={{ color: "var(--df-text-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
