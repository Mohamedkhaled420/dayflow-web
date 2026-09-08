"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  activitiesForDay,
  categoryById,
  computeDaySummary,
  durationMinutes,
  fmtDuration,
  fmtRange,
  todayTargets,
  toMinutes,
  timelineToMarkdown,
  type Activity,
} from "@/lib/demo-data";
import { DonutChart } from "@/components/dayflow/DonutChart";
import { useToast } from "@/hooks/use-toast";

const DAY_START = 6 * 60; // 6 AM
const DAY_END = 22 * 60; // 10 PM
const PX_PER_MIN = 1.15;

const dayLabel = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export function TimelineView() {
  const [dayOffset, setDayOffset] = useState(0);
  const [mode, setMode] = useState<"day" | "week">("day");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const activities = useMemo(() => activitiesForDay(dayOffset), [dayOffset]);
  const summary = useMemo(() => computeDaySummary(activities), [activities]);
  const donutSlices = useMemo(
    () =>
      summary.categoryTotals.map((t) => {
        const c = categoryById(t.categoryId);
        return { label: c.name, value: t.minutes, colorHex: c.colorHex };
      }),
    [summary]
  );

  const go = (delta: number) => {
    setDayOffset((o) => Math.max(-6, Math.min(0, o + delta)));
    setSelected(null);
  };

  const copyTimeline = async () => {
    try {
      await navigator.clipboard.writeText(timelineToMarkdown(dayOffset));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Timeline copied as Markdown" });
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard access was denied by the browser.",
      });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* ------- timeline column ------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* header */}
        <header className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-center gap-x-2 gap-y-2 border-b-0">
          <div className="flex items-center gap-1.5">
            <NavArrow dir="prev" disabled={dayOffset <= -6} onClick={() => go(-1)} />
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className="df-press df-glass-control flex items-center gap-1.5 h-8 pl-2.5 pr-3 text-[12.5px] font-semibold"
              aria-expanded={showCalendar}
              aria-label="Pick a date"
            >
              <Calendar className="h-3.5 w-3.5" strokeWidth={2} />
              {dayOffset === 0
                ? `Today, ${dayLabel(0).split(", ")[1]}`
                : dayLabel(dayOffset)}
              <ChevronRight
                className={`h-3 w-3 transition-transform ${showCalendar ? "rotate-90" : ""} opacity-60`}
              />
            </button>
            <NavArrow dir="next" disabled={dayOffset >= 0} onClick={() => go(1)} />
            {dayOffset !== 0 && (
              <button
                onClick={() => {
                  setDayOffset(0);
                  setSelected(null);
                }}
                className="df-press df-chip ml-1 px-2.5 h-7 text-[11.5px] font-medium rounded-full flex items-center"
              >
                Today
              </button>
            )}
          </div>

          {/* Day/Week segmented toggle */}
          <div
            className="ml-auto rounded-[7px] p-[3px] flex items-center"
            style={{
              background: "var(--df-segment-track)",
              border: "0.5px solid var(--df-segment-track-border)",
            }}
            role="tablist"
            aria-label="Timeline mode"
          >
            {(["day", "week"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className="df-press relative px-3.5 h-[26px] rounded-[5px] text-[12px] font-semibold capitalize"
                style={
                  mode === m
                    ? {
                        background: "var(--df-control-fill)",
                        border: "0.5px solid var(--df-control-border)",
                        boxShadow: "inset 0 0 0 2px var(--df-control-glow)",
                        color: "var(--df-text-primary)",
                      }
                    : { color: "var(--df-segment-inactive)" }
                }
              >
                {m}
              </button>
            ))}
          </div>

          <button
            onClick={copyTimeline}
            className="df-press df-btn-secondary h-8 px-3 text-[12px] font-semibold"
            aria-label="Copy timeline as Markdown"
          >
            {copied ? "Copied!" : "Copy timeline"}
          </button>
        </header>

        {/* calendar popover */}
        <AnimatePresence>
          {showCalendar && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="mx-4 sm:mx-5 mb-3 rounded-lg p-3 backdrop-blur-xl"
              style={{
                background:
                  "color-mix(in srgb, var(--df-card-fill) 92%, transparent)",
                border: "0.5px solid var(--df-card-border)",
              }}
            >
              <div className="grid grid-cols-7 gap-1.5 w-[266px]">
                {buildCalendarDays().map((d) => (
                  <button
                    key={d.offset}
                    disabled={d.offset > 0}
                    onClick={() => {
                      setDayOffset(d.offset);
                      setSelected(null);
                      setShowCalendar(false);
                    }}
                    className="df-press h-8 rounded-md text-[12px] font-medium disabled:opacity-30"
                    style={
                      d.offset === dayOffset
                        ? {
                            background: "var(--df-primary-btn-fill)",
                            color: "#fff",
                            boxShadow:
                              "inset 0 0 0 1.5px var(--df-primary-btn-border)",
                          }
                        : {
                            background: "var(--df-chip-fill)",
                            border: "0.5px solid var(--df-chip-border)",
                            color: "var(--df-text-primary)",
                          }
                    }
                  >
                    {d.dayNum}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* timeline body */}
        {mode === "day" ? (
          <DayTimeline
            activities={activities}
            scrollRef={scrollRef}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <WeekTimeline dayOffset={dayOffset} />
        )}
      </div>

      {/* divider */}
      <div
        className="hidden lg:block w-px shrink-0"
        style={{ background: "var(--df-right-panel-divider)" }}
      />

      {/* ------- right inspector: day summary ------- */}
      <DaySummaryPanel
        summary={summary}
        donutSlices={donutSlices}
        className="lg:w-[300px] xl:w-[320px] shrink-0 border-t lg:border-t-0"
      />
    </div>
  );
}

function NavArrow({
  dir,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous day" : "Next day"}
      className="df-press w-8 h-8 rounded-full grid place-items-center disabled:opacity-35"
      style={{ color: "var(--df-text-primary)" }}
    >
      <Icon
        className="h-[17px] w-[17px]"
        strokeWidth={2.2}
      />
    </button>
  );
}

/* ---------------- day timeline: hour grid + activity cards ---------------- */

function DayTimeline({
  activities,
  selected,
  onSelect,
  scrollRef,
}: {
  activities: Activity[];
  selected: Activity | null;
  onSelect: (a: Activity | null) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = DAY_START / 60; h <= DAY_END / 60; h++) out.push(h);
    return out;
  }, []);

  return (
    <div
      ref={scrollRef}
      className="df-scroll flex-1 overflow-y-auto px-4 sm:px-5 pb-6"
      role="list"
      aria-label="Activity timeline"
    >
      <div className="relative">
        {/* hour lines */}
        <div aria-hidden="true">
          {hours.map((h) => (
            <div
              key={h}
              className="df-hour-line absolute left-[52px] right-0"
              style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}
            />
          ))}
        </div>

        {/* cards */}
        <div className="relative pt-1">
          {activities.map((a, i) => {
            const top = (toMinutes(a.start) - DAY_START) * PX_PER_MIN;
            const height = durationMinutes(a) * PX_PER_MIN;
            return (
              <motion.div
                key={a.id}
                role="listitem"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: Math.min(i * 0.04, 0.3),
                  duration: 0.3,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute left-[52px] right-0"
                style={{ top, height }}
              >
                <ActivityCard
                  activity={a}
                  selected={selected?.id === a.id}
                  onClick={() => onSelect(selected?.id === a.id ? null : a)}
                />
              </motion.div>
            );
          })}
          <div style={{ height: (DAY_END - DAY_START) * PX_PER_MIN + 40 }} />
        </div>
      </div>
    </div>
  );
}

function ActivityCard({
  activity,
  selected,
  onClick,
}: {
  activity: Activity;
  selected: boolean;
  onClick: () => void;
}) {
  const cat = categoryById(activity.categoryId);
  const isIdle = cat.isIdle;
  return (
    <button
      onClick={onClick}
      className="df-card w-full h-full text-left px-3.5 py-2.5 flex flex-col overflow-hidden df-press"
      style={{
        outline: selected ? "1.5px solid var(--df-accent)" : "none",
        outlineOffset: "1px",
        filter: isIdle ? "saturate(0.55) opacity(0.75)" : undefined,
      }}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="text-[13px] font-semibold leading-snug line-clamp-2"
          style={{ color: "var(--df-text-primary)" }}
        >
          {activity.title}
        </span>
        <span
          className="shrink-0 mt-[3px] w-2.5 h-2.5 rounded-full"
          style={{
            background: cat.colorHex,
            boxShadow: `0 0 0 2px color-mix(in srgb, ${cat.colorHex} 30%, transparent)`,
          }}
          aria-label={cat.name}
        />
      </div>
      {durationMinutes(activity) >= 25 && (
        <p
          className="mt-1 text-[11.5px] leading-[1.35] line-clamp-2"
          style={{ color: "var(--df-text-secondary)" }}
        >
          {activity.summary}
        </p>
      )}
      <span
        className="mt-auto pt-1 text-[10.5px] font-medium tracking-wide"
        style={{ color: "var(--df-card-time)" }}
      >
        {fmtRange(activity)} · {fmtDuration(durationMinutes(activity))}
      </span>
    </button>
  );
}

/* ---------------- week timeline: 7-column mini grid ---------------- */

function WeekTimeline({ dayOffset }: { dayOffset: number }) {
  const days = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + dayOffset);
    // week containing that day, Mon..Sun
    const dow = (base.getDay() + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const offset = Math.round(
        (d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
      );
      return {
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        dateNum: d.getDate(),
        offset,
        isToday: offset === 0,
      };
    });
  }, [dayOffset]);

  return (
    <div className="df-scroll flex-1 overflow-y-auto px-4 sm:px-5 pb-6">
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => (
          <div key={d.label} className="min-w-0">
            <div
              className="text-center mb-2 sticky top-0 py-1 backdrop-blur-md"
              style={{ color: "var(--df-text-secondary)" }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide">
                {d.label}
              </div>
              <div
                className="text-[10px]"
                style={{
                  color: d.isToday ? "var(--df-accent-text)" : "var(--df-text-muted)",
                  fontWeight: d.isToday ? 700 : 400,
                }}
              >
                {d.isToday ? "today" : `Sep ${d.dateNum}`}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {activitiesForDay(Math.max(d.offset, -2)).map((a) => {
                const cat = categoryById(a.categoryId);
                return (
                  <div
                    key={a.id}
                    className="df-card px-2 py-1.5 min-h-[34px]"
                    style={{
                      borderLeft: `2.5px solid ${cat.colorHex}`,
                    }}
                    title={`${a.title} · ${fmtRange(a)}`}
                  >
                    <div
                      className="text-[10.5px] font-semibold leading-tight line-clamp-2"
                      style={{ color: "var(--df-text-primary)" }}
                    >
                      {a.title}
                    </div>
                    <div
                      className="text-[9.5px] mt-0.5"
                      style={{ color: "var(--df-card-time)" }}
                    >
                      {fmtDuration(durationMinutes(a))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- right panel: day summary ---------------- */

function DaySummaryPanel({
  summary,
  donutSlices,
  className,
}: {
  summary: ReturnType<typeof computeDaySummary>;
  donutSlices: { label: string; value: number; colorHex: string }[];
  className?: string;
}) {
  return (
    <aside
      className={`df-scroll overflow-y-auto px-4 py-4 ${className ?? ""}`}
      aria-label="Day summary"
      style={{
        background: "var(--df-right-panel-fill)",
        borderLeft: "0.5px solid var(--df-right-panel-border)",
      }}
    >
      <h2
        className="text-[15px] font-bold tracking-tight"
        style={{ color: "var(--df-text-primary)" }}
      >
        Your day so far
      </h2>

      {/* today's targets */}
      <section aria-label="Today's targets" className="mt-4">
        <h3
          className="text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Today&apos;s targets
        </h3>
        <div className="mt-2 flex flex-col gap-1.5">
          {todayTargets.map((t) => {
            const pct = Math.min(100, Math.round((t.doneMinutes / t.plannedMinutes) * 100));
            const cat = categoryById(t.categoryId);
            return (
              <div
                key={t.label}
                className="rounded-md px-2.5 py-2"
                style={{
                  background: "var(--df-chip-fill)",
                  border: "0.5px solid var(--df-chip-border)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11.5px] font-semibold truncate"
                    style={{ color: "var(--df-text-primary)" }}
                  >
                    {t.label}
                  </span>
                  <span
                    className="text-[10px] font-bold shrink-0"
                    style={{ color: "var(--df-accent-text)" }}
                  >
                    {pct}%
                  </span>
                </div>
                <div
                  className="mt-1.5 h-[5px] rounded-full overflow-hidden"
                  style={{ background: "var(--df-segment-track)" }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-label={`${t.label} progress`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: cat.colorHex,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* summary stat cards */}
      <section
        aria-label="Focus stats"
        className="mt-4 grid grid-cols-3 gap-1.5"
      >
        <StatCard label="Total focus" value={fmtDuration(summary.totalFocus)} />
        <StatCard
          label="Longest focus"
          value={
            summary.longestFocus
              ? fmtDuration(summary.longestFocus.minutes)
              : "—"
          }
          sub={
            summary.longestFocus
              ? summary.longestFocus.title
              : undefined
          }
        />
        <StatCard
          label="Distractions"
          value={fmtDuration(summary.totalDistracted)}
        />
      </section>

      {/* category donut */}
      <section aria-label="Category breakdown" className="mt-5">
        <h3
          className="text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Categories
        </h3>
        <div className="mt-3 flex flex-col items-center">
          <DonutChart
            slices={donutSlices}
            centerTitle="tracked"
            centerValue={fmtDuration(summary.totalCaptured)}
          />
          <ul className="mt-3 w-full flex flex-col gap-1">
            {donutSlices.slice(0, 6).map((s) => (
              <li
                key={s.label}
                className="flex items-center gap-2 text-[11.5px]"
              >
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
                  className="font-semibold shrink-0"
                  style={{ color: "var(--df-text-primary)" }}
                >
                  {fmtDuration(s.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </aside>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="df-summary-card px-2 py-2.5 text-center min-w-0">
      <div
        className="text-[14.5px] font-bold leading-none truncate"
        style={{ color: "var(--df-summary-value)" }}
      >
        {value}
      </div>
      <div
        className="text-[9.5px] font-semibold uppercase tracking-wide mt-1.5"
        style={{ color: "var(--df-text-muted)" }}
      >
        {label}
      </div>
      {sub && (
        <div
          className="text-[9px] mt-0.5 truncate"
          style={{ color: "var(--df-text-muted)" }}
          title={sub}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function buildCalendarDays() {
  const now = new Date();
  const first = new Date(now);
  first.setDate(1);
  const startDow = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  const cells: { offset: number; dayNum: number }[] = [];
  for (let i = 0; i < startDow; i++) cells.push({ offset: 99, dayNum: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ offset: d - today, dayNum: d });
  }
  return cells.filter((c) => c.dayNum > 0);
}
