"use client";

// TimelineView — the daily timeline, ported from the native Mac app
// and tailored to life tracking: 24-hour proportional cards for
// workouts, work, personal time, meals and overnight sleep, plus
// hydration markers and manual logging (the web replacement for
// screen capture).

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Droplet,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { CategoryIcon } from "@/components/dayflow/category-icons";
import { DonutChart } from "@/components/dayflow/DonutChart";
import { EventDialog } from "@/components/dayflow/EventDialog";
import { useDayflow, useDayflowData, useSortedCategories } from "@/lib/store";
import { keyForOffset, keyToDate, pad2 } from "@/lib/seed";
import {
  categoryById,
  categoryTotals,
  eventsForDay,
  eventDuration,
  fmtDuration,
  fmtRange,
  fmtTime,
  goalsForDay,
  isOvernight,
  toMinutes,
  totalTracked,
  waterForDay,
  waterTotal,
  dayToMarkdown,
  weekOf,
} from "@/lib/compute";
import type { TrackEvent } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { hapticSelect, hapticSuccess, hapticWarn } from "@/lib/haptics";
import { springSoft } from "@/lib/motion";

const PX_PER_MIN = 1.1;
const MIN_CARD_H = 24;
const DAY_SPAN = 24 * 60;
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const dayLabel = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

export function TimelineView() {
  const [dayOffset, setDayOffset] = useState(0);
  const [mode, setMode] = useState<"day" | "week">("day");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; event: TrackEvent | null }>({
    open: false,
    event: null,
  });
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const data = useDayflowData();
  const categories = useSortedCategories();
  const addWater = useDayflow((s) => s.addWater);
  const profile = data.profile;

  const dateKey = keyForOffset(dayOffset);
  const dayEvents = useMemo(() => eventsForDay(data.events, dateKey), [data.events, dateKey]);
  const visibleEvents = useMemo(
    () => (filter ? dayEvents.filter((e) => e.categoryId === filter) : dayEvents),
    [dayEvents, filter]
  );
  const selected = useMemo(
    () => dayEvents.find((e) => e.id === selectedId) ?? null,
    [dayEvents, selectedId]
  );

  // auto-scroll to a sensible anchor (now on today, wake time otherwise).
  // On phones the timeline is page-flow (fully expanded), so scroll the
  // window instead of the container.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || mode !== "day") return;
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    const anchor = isMobile ? 5 * 60 + 30 : dayOffset === 0 ? nowMinutes() - 120 : 5 * 60 + 30;
    const scrollTop = Math.max(0, anchor * PX_PER_MIN - (isMobile ? 12 : 60));
    if (el.scrollHeight > el.clientHeight + 8) {
      el.scrollTo({ top: scrollTop, behavior: "smooth" });
    } else {
      const rect = el.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top + anchor * PX_PER_MIN - 120), behavior: "smooth" });
    }
    const timer = window.setTimeout(() => {
      if (scrollRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        scrollRef.current.scrollTo({ top: scrollTop, behavior: "smooth" });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [dayOffset, mode, dateKey]);

  const go = (delta: number) => {
    setDayOffset((o) => Math.max(-13, Math.min(0, o + delta)));
    setSelectedId(null);
  };

  // Escape closes the calendar popover (wayfinding — never trap).
  useEffect(() => {
    if (!showCalendar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCalendar(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCalendar]);

  const copyTimeline = async () => {
    try {
      await navigator.clipboard.writeText(dayToMarkdown(data, dateKey));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Day copied as Markdown" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access was denied by the browser." });
    }
  };

  const quickWater = () => {
    hapticSuccess();
    const d = new Date();
    addWater({
      dateKey,
      time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
      ml: profile.waterGlassMl,
    });
    toast({
      title: "Glass logged 💧",
      description: `${profile.waterGlassMl} ml · ${waterTotal(data.water, dateKey) + profile.waterGlassMl} ml today`,
    });
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* ------- timeline column ------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="df-timeline-header px-4 sm:px-5 pt-4 pb-2.5 flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="flex items-center gap-1.5">
            <NavArrow dir="prev" disabled={dayOffset <= -13} onClick={() => go(-1)} />
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className="df-press df-glass-control flex items-center gap-1.5 h-8 pl-2.5 pr-3 text-[12.5px] font-semibold"
              aria-expanded={showCalendar}
              aria-label="Pick a date"
            >
              <Calendar className="h-3.5 w-3.5" strokeWidth={2} />
              {dayOffset === 0 ? `Today, ${dayLabel(0).split(", ")[1]}` : dayLabel(dayOffset)}
              <ChevronRight
                className={`h-3 w-3 transition-transform ${showCalendar ? "rotate-90" : ""} opacity-60`}
              />
            </button>
            <NavArrow dir="next" disabled={dayOffset >= 0} onClick={() => go(1)} />
            {dayOffset !== 0 && (
              <button
                onClick={() => {
                  setDayOffset(0);
                  setSelectedId(null);
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
                onClick={() => {
                  if (mode !== m) hapticSelect();
                  setMode(m);
                }}
                className="df-press relative px-3.5 h-[26px] rounded-[5px] text-[12px] font-semibold capitalize"
                style={{
                  color:
                    mode === m
                      ? "var(--df-text-primary)"
                      : "var(--df-segment-inactive)",
                }}
              >
                {mode === m && (
                  <motion.span
                    layoutId="timeline-mode-thumb"
                    transition={springSoft}
                    className="absolute inset-0 rounded-[5px]"
                    style={{
                      background: "var(--df-control-fill)",
                      border: "0.5px solid var(--df-control-border)",
                      boxShadow: "inset 0 0 0 2px var(--df-control-glow)",
                    }}
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">{m}</span>
              </button>
            ))}
          </div>

          <div className="df-timeline-actions flex items-center gap-1.5">
            <button
              onClick={quickWater}
              disabled={dayOffset !== 0}
              className="df-press df-chip h-8 px-2.5 rounded-full flex items-center gap-1.5 text-[12px] font-semibold disabled:opacity-40"
              aria-label="Log a glass of water for today"
              title={dayOffset === 0 ? "Log a glass of water" : "Switch to today to quick-log water"}
            >
              <Droplet className="h-3.5 w-3.5" style={{ color: "#56CFEE" }} fill="#56CFEE" />
              Water
            </button>
            <button
              onClick={() => setDialog({ open: true, event: null })}
              className="df-press df-btn-primary h-8 px-3 text-[12px] font-semibold flex items-center gap-1"
              aria-label="Log a block"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              Log
            </button>
            <button
              onClick={copyTimeline}
              className="df-press df-btn-secondary h-8 px-3 text-[12px] font-semibold"
              aria-label="Copy timeline as Markdown"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </header>

        {/* category filter chips */}
        {mode === "day" && (
          <div className="df-timeline-filters px-4 sm:px-5 pb-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            <FilterChip
              label="All"
              colorHex={null}
              active={filter === null}
              onClick={() => setFilter(null)}
            />
            {categories.map((c) => (
              <FilterChip
                key={c.id}
                label={c.name}
                colorHex={c.colorHex}
                icon={c.icon}
                active={filter === c.id}
                onClick={() => setFilter(filter === c.id ? null : c.id)}
              />
            ))}
          </div>
        )}

        {/* calendar popover — anchored to its trigger, springs in,
            dismisses on outside click or Escape */}
        <AnimatePresence>
          {showCalendar && (
            <motion.div
              key="cal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-30"
              onClick={() => setShowCalendar(false)}
              aria-hidden="true"
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showCalendar && (
            <motion.div
              key="cal-popover"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={springSoft}
              style={{
                transformOrigin: "top left",
                background: "color-mix(in srgb, var(--df-card-fill) 92%, transparent)",
                border: "0.5px solid var(--df-card-border)",
                boxShadow: "var(--df-material-shadow)",
              }}
              className="relative z-40 mx-4 sm:mx-5 mb-3 rounded-lg p-3 backdrop-blur-xl saturate-180 w-[266px]"
            >
              <div className="grid grid-cols-7 gap-1.5">
                {buildCalendarDays().map((d) => (
                  <button
                    key={d.dayNum}
                    disabled={d.offset > 0}
                    onClick={() => {
                      setDayOffset(d.offset);
                      setSelectedId(null);
                      setShowCalendar(false);
                    }}
                    className="df-press h-8 rounded-md text-[12px] font-medium disabled:opacity-30"
                    style={
                      d.offset === dayOffset
                        ? {
                            background: "var(--df-primary-btn-fill)",
                            color: "#fff",
                            boxShadow: "inset 0 0 0 1.5px var(--df-primary-btn-border)",
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
            events={visibleEvents}
            water={waterForDay(data.water, dateKey)}
            glassMl={profile.waterGlassMl}
            isToday={dayOffset === 0}
            selectedId={selectedId}
            onSelect={(id) => {
              hapticSelect();
              setSelectedId((cur) => (cur === id ? null : id));
            }}
            scrollRef={scrollRef}
          />
        ) : (
          <WeekTimeline dateKey={dateKey} />
        )}
      </div>

      {/* divider */}
      <div
        className="hidden lg:block w-px shrink-0"
        style={{ background: "var(--df-right-panel-divider)" }}
      />

      {/* ------- right inspector ------- */}
      {selected ? (
        <EventDetailPanel
          event={selected}
          onEdit={() => setDialog({ open: true, event: selected })}
          onDelete={() => {
            hapticWarn();
            useDayflow.getState().deleteEvent(selected.id);
            setSelectedId(null);
            toast({ title: "Block deleted", description: selected.title });
          }}
          className="lg:w-[300px] xl:w-[320px] shrink-0 border-t lg:border-t-0"
        />
      ) : (
        <DaySummaryPanel
          dateKey={dateKey}
          className="lg:w-[300px] xl:w-[320px] shrink-0 border-t lg:border-t-0"
        />
      )}

      {/* add / edit dialog */}
      <EventDialog
        open={dialog.open}
        event={dialog.event}
        dateKey={dateKey}
        onClose={() => setDialog({ open: false, event: null })}
      />
    </div>
  );
}

/* ---------------- small pieces ---------------- */

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
      <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
    </button>
  );
}

function FilterChip({
  label,
  colorHex,
  icon,
  active,
  onClick,
}: {
  label: string;
  colorHex: string | null;
  icon?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="df-press rounded-full h-7 pl-2 pr-3 flex items-center gap-1.5 text-[11.5px] font-semibold"
      style={{
        background: active
          ? colorHex
            ? `color-mix(in srgb, ${colorHex} 24%, transparent)`
            : "var(--df-control-fill)"
          : "var(--df-chip-fill)",
        border: active
          ? colorHex
            ? `1.5px solid color-mix(in srgb, ${colorHex} 60%, transparent)`
            : "1.5px solid var(--df-control-border)"
          : "0.5px solid var(--df-chip-border)",
        color: "var(--df-text-primary)",
      }}
      aria-pressed={active}
    >
      {colorHex ? (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: colorHex, boxShadow: `0 0 0 2px color-mix(in srgb, ${colorHex} 25%, transparent)` }}
        />
      ) : icon ? (
        <CategoryIcon name={icon} className="h-3 w-3" />
      ) : null}
      {label}
    </button>
  );
}

/* ---------------- day timeline: 24h grid + cards + water ---------------- */

interface Segment {
  key: string;
  event: TrackEvent;
  topMin: number;
  heightMin: number;
  labelSide: "top" | "bottom";
}

/** Cards are time-proportional; short ones clamp to MIN_CARD_H and nudge
 *  below their predecessor so adjacent blocks never visually overlap. */
function placeSegments(events: TrackEvent[]): { seg: Segment; top: number; height: number }[] {
  const segs = segmentsFor(events);
  let lastBottom = -Infinity;
  return segs.map((seg) => {
    const naturalTop = seg.topMin * PX_PER_MIN + 1;
    const height = Math.max(seg.heightMin * PX_PER_MIN - 2, MIN_CARD_H);
    const top = Math.max(naturalTop, lastBottom + 1);
    lastBottom = top + height;
    return { seg, top, height };
  });
}

function segmentsFor(events: TrackEvent[]): Segment[] {
  const out: Segment[] = [];
  for (const e of events) {
    const s = toMinutes(e.start);
    const t = toMinutes(e.end);
    if (isOvernight(e)) {
      // morning half: 0:00 -> end ; evening half: start -> 24:00
      out.push({ key: `${e.id}-am`, event: e, topMin: 0, heightMin: t, labelSide: "bottom" });
      out.push({ key: `${e.id}-pm`, event: e, topMin: s, heightMin: DAY_SPAN - s, labelSide: "top" });
    } else {
      out.push({ key: e.id, event: e, topMin: s, heightMin: t - s, labelSide: "top" });
    }
  }
  return out.sort((a, b) => a.topMin - b.topMin);
}

function DayTimeline({
  events,
  water,
  glassMl,
  isToday,
  selectedId,
  onSelect,
  scrollRef,
}: {
  events: TrackEvent[];
  water: { id: string; time: string; ml: number }[];
  glassMl: number;
  isToday: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const placed = useMemo(() => placeSegments(events), [events]);
  const hourLines = useMemo(() => {
    const out: number[] = [];
    for (let h = 0; h <= 24; h++) out.push(h);
    return out;
  }, []);
  const nowMin = nowMinutes();

  return (
    <>
      <div className="df-mobile-event-list df-scroll flex-1 overflow-y-auto px-4 pb-32" role="list" aria-label="Day timeline">
        {events.length === 0 ? (
          <div className="df-card mt-3 p-5 text-center">
            <p className="text-[13px] font-semibold" style={{ color: "var(--df-text-primary)" }}>Nothing tracked yet</p>
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--df-text-secondary)" }}>Tap Log above to add your first block.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            {events.map((event) => {
              const cat = categoryById(useDayflow.getState().categories, event.categoryId);
              return (
                <button
                  key={event.id}
                  onClick={() => onSelect(event.id)}
                  className="df-mobile-event df-card flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left df-press"
                  style={{ outline: selectedId === event.id ? "1.5px solid var(--df-accent)" : "none" }}
                  aria-pressed={selectedId === event.id}
                  aria-label={`${event.title}, ${cat.name}, ${fmtRange(event)}, ${fmtDuration(eventDuration(event))}`}
                >
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: cat.colorHex }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--df-text-primary)" }}>{event.title}</span>
                    <span className="mt-1 block truncate text-[10.5px]" style={{ color: "var(--df-text-muted)" }}>{cat.name} · {fmtRange(event)}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] font-semibold tabular-nums" style={{ color: "var(--df-text-secondary)" }}>{fmtDuration(eventDuration(event))}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="df-desktop-timeline df-scroll df-edge-fade flex-1 overflow-y-auto px-4 pb-8 sm:px-5"
        role="list"
        aria-label="Day timeline"
      >
      <div className="relative pt-1" style={{ height: DAY_SPAN * PX_PER_MIN + 30 }}>
        {/* hour lines */}
        <div aria-hidden="true">
          {hourLines.map((h) => (
            <div
              key={h}
              className="df-hour-line absolute left-[46px] right-0"
              style={{ top: h * 60 * PX_PER_MIN }}
            />
          ))}
        </div>

        {/* hour labels every 2 hours */}
        <div aria-hidden="true">
          {hourLines
            .filter((h) => h % 2 === 0 && h < 24)
            .map((h) => (
              <div
                key={h}
                className="absolute right-[calc(100%-44px)] text-[11px] font-medium tabular-nums"
                style={{
                  top: h * 60 * PX_PER_MIN - 8,
                  color: isToday && h * 60 > nowMin ? "var(--df-hour-line)" : "var(--df-text-muted)",
                }}
              >
                {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
              </div>
            ))}
        </div>

        {/* now line */}
        {isToday && (
          <div
            aria-hidden="true"
            className="absolute left-[40px] right-0 z-10"
            style={{ top: nowMin * PX_PER_MIN }}
          >
            <div
              style={{
                borderTop: "1.5px dashed color-mix(in srgb, var(--df-accent) 75%, transparent)",
              }}
            />
            <span
              className="absolute -left-[6px] -top-[4px] w-2 h-2 rounded-full"
              style={{ background: "var(--df-accent)" }}
            />
          </div>
        )}

        {/* water markers */}
        {water.map((w) => (
          <div
            key={w.id}
            className="absolute z-[5] group"
            style={{ top: toMinutes(w.time) * PX_PER_MIN - 9, left: 18 }}
            title={`${w.ml} ml at ${fmtTime(w.time)}`}
            aria-label={`Water: ${w.ml} ml at ${fmtTime(w.time)}`}
          >
            <span
              className="grid place-items-center w-[18px] h-[18px] rounded-full transition-transform group-hover:scale-125"
              style={{
                background: "color-mix(in srgb, #56CFEE 26%, transparent)",
                border: "1px solid color-mix(in srgb, #56CFEE 65%, transparent)",
              }}
            >
              <Droplet className="h-[10px] w-[10px]" style={{ color: "#2E9FBE" }} fill="#56CFEE" />
            </span>
          </div>
        ))}

        {/* activity cards */}
        {placed.map(({ seg, top, height }, i) => (
          <motion.div
            key={seg.key}
            role="listitem"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: Math.min(i * 0.03, 0.25),
              ...springSoft,
            }}
            className="absolute left-[46px] right-0"
            style={{ top, height }}
          >
            <ActivityCard
              event={seg.event}
              segmentLabel={
                isOvernight(seg.event)
                  ? seg.labelSide === "top"
                    ? `from ${fmtTime(seg.event.start)}`
                    : `until ${fmtTime(seg.event.end)}`
                  : undefined
              }
              selected={selectedId === seg.event.id}
              onClick={() => onSelect(seg.event.id)}
            />
          </motion.div>
        ))}

        {/* empty state */}
        {placed.length === 0 && (
          <div
            className="absolute left-[46px] right-0 top-[300px] df-card p-5 text-center"
            style={{ borderColor: "var(--df-card-border)" }}
          >
            <p className="text-[13px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
              Nothing tracked yet
            </p>
            <p className="text-[11.5px] mt-1" style={{ color: "var(--df-text-secondary)" }}>
              Tap <b>Log</b> above to add your first block — a workout, work session, meal, or
              night of sleep.
            </p>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function ActivityCard({
  event,
  segmentLabel,
  selected,
  onClick,
}: {
  event: TrackEvent;
  segmentLabel?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const data = useDayflowData();
  const cat = categoryById(data.categories, event.categoryId);
  const dur = eventDuration(event);
  const cardH = Math.max(dur * PX_PER_MIN - 2, MIN_CARD_H);
  const compact = cardH < 44;
  return (
    <button
      onClick={onClick}
      className={`df-card df-lift w-full h-full text-left flex flex-col overflow-hidden df-press relative ${
        compact ? "py-[3px] px-3" : "py-2 px-3.5"
      }`}
      style={{
        outline: selected ? "1.5px solid var(--df-accent)" : "none",
        outlineOffset: "1px",
      }}
      aria-pressed={selected}
      aria-label={`${event.title}, ${cat.name}, ${fmtRange(event)}, ${fmtDuration(dur)}`}
    >
      {/* category color edge */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-[5px]"
        style={{ background: cat.colorHex, borderRadius: "2px 0 0 2px" }}
      />
      {compact ? (
        <div className="flex items-center gap-1.5 min-w-0 leading-none">
          <span
            className="text-[11.5px] font-semibold truncate"
            style={{ color: "var(--df-text-primary)" }}
          >
            {event.title}
          </span>
          <span
            className="ml-auto shrink-0 text-[9.5px] font-medium tabular-nums pl-1"
            style={{ color: "var(--df-card-time)" }}
          >
            {fmtDuration(dur)}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2 min-h-0">
            <span
              className="text-[12.5px] font-semibold leading-snug line-clamp-2"
              style={{ color: "var(--df-text-primary)" }}
            >
              {event.title}
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
          {dur >= 60 && event.notes && (
            <p
              className="mt-1 text-[11px] leading-[1.35] line-clamp-2"
              style={{ color: "var(--df-text-secondary)" }}
            >
              {event.notes}
            </p>
          )}
          <span
            className="mt-auto pt-1 text-[10px] font-medium tracking-wide tabular-nums"
            style={{ color: "var(--df-card-time)" }}
          >
            {segmentLabel ?? fmtRange(event)} · {fmtDuration(dur)}
          </span>
        </>
      )}
    </button>
  );
}

/* ---------------- week timeline ---------------- */

function WeekTimeline({ dateKey }: { dateKey: string }) {
  const data = useDayflowData();
  const week = useMemo(() => weekOf(dateKey), [dateKey]);
  return (
    <div className="df-scroll flex-1 overflow-y-auto px-4 sm:px-5 pb-6">
      <div className="grid grid-cols-7 gap-2">
        {week.map((d) => {
          const acts = eventsForDay(data.events, d.dateKey);
          return (
            <div key={d.dateKey} className="min-w-0">
              <div
                className="text-center mb-2 sticky top-0 py-1 backdrop-blur-md"
                style={{ color: "var(--df-text-secondary)" }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide">{d.label}</div>
                <div
                  className="text-[10px]"
                  style={{
                    color: d.isToday ? "var(--df-accent-text)" : "var(--df-text-muted)",
                    fontWeight: d.isToday ? 700 : 400,
                  }}
                >
                  {d.isToday ? "today" : d.dateLabel}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {acts.map((a) => {
                  const cat = categoryById(data.categories, a.categoryId);
                  return (
                    <div
                      key={a.id}
                      className="df-card px-2 py-1.5 min-h-[34px]"
                      style={{ borderLeft: `2.5px solid ${cat.colorHex}` }}
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
                        {fmtDuration(eventDuration(a))}
                      </div>
                    </div>
                  );
                })}
                {acts.length === 0 && (
                  <div
                    className="text-[10px] rounded-md py-2 text-center"
                    style={{ color: "var(--df-text-muted)" }}
                  >
                    {d.isFuture ? "—" : "no data"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- right panel: day summary ---------------- */

function DaySummaryPanel({ dateKey, className }: { dateKey: string; className?: string }) {
  const data = useDayflowData();
  const addWater = useDayflow((s) => s.addWater);
  const removeLastWater = useDayflow((s) => s.removeLastWaterOfToday);
  const goals = useMemo(() => goalsForDay(data, dateKey), [data, dateKey]);
  const totals = useMemo(() => categoryTotals(data.events, dateKey), [data.events, dateKey]);
  const donutSlices = useMemo(
    () =>
      totals.map((t) => {
        const c = categoryById(data.categories, t.categoryId);
        return { label: c.name, value: t.minutes, colorHex: c.colorHex };
      }),
    [totals, data.categories]
  );
  const dayWater = useMemo(() => waterForDay(data.water, dateKey), [data.water, dateKey]);
  const waterMl = waterTotal(data.water, dateKey);
  const glasses = Math.round((waterMl / (data.profile.waterGlassMl || 250)) * 10) / 10;
  const goalGlasses = data.goals.waterGlasses;
  const sleep = goals.find((g) => g.key === "sleep")!;
  const isToday = dateKey === keyForOffset(0);

  const logWater = () => {
    hapticSuccess();
    const d = new Date();
    const time = isToday
      ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
      : "12:00";
    addWater({ dateKey, time, ml: data.profile.waterGlassMl });
  };

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

      {/* goals */}
      <section aria-label="Today's goals" className="mt-4">
        <h3
          className="text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Goals
        </h3>
        <div className="mt-2 flex flex-col gap-1.5">
          {goals.map((g) => {
            const pct = Math.min(100, Math.round((g.done / Math.max(g.target, 1)) * 100));
            const valueLabel =
              g.unit === "count"
                ? `${g.done.toFixed(g.done % 1 ? 1 : 0)}/${g.target}`
                : `${fmtDuration(g.done)} / ${fmtDuration(g.target)}`;
            return (
              <div
                key={g.key}
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
                    {g.label}
                  </span>
                  <span
                    className="text-[10px] font-bold shrink-0 tabular-nums"
                    style={{ color: g.met ? "var(--df-summary-value)" : "var(--df-text-muted)" }}
                  >
                    {g.met ? "✓ " : ""}
                    {valueLabel}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-[5px] rounded-full overflow-hidden"
                  style={{ background: "var(--df-segment-track)" }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-label={`${g.label} progress`}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${pct}%`, background: g.colorHex }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* hydration quick tracker */}
      <section aria-label="Hydration" className="mt-4">
        <h3
          className="text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Hydration
        </h3>
        <div
          className="mt-2 rounded-lg p-3"
          style={{
            background: "color-mix(in srgb, #56CFEE 10%, transparent)",
            border: "0.5px solid color-mix(in srgb, #56CFEE 38%, transparent)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-bold tabular-nums" style={{ color: "var(--df-text-primary)" }}>
              {glasses} / {goalGlasses} glasses
            </span>
            <span className="text-[10.5px] tabular-nums" style={{ color: "var(--df-text-muted)" }}>
              {waterMl} ml
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
            {Array.from({ length: Math.max(goalGlasses, Math.ceil(glasses)) }).map((_, i) => {
              const filled = i < Math.floor(glasses + 0.0001);
              return (
                <Droplet
                  key={i}
                  className="h-4 w-4"
                  style={{ color: filled ? "#2E9FBE" : "var(--df-text-muted)", opacity: filled ? 1 : 0.35 }}
                  fill={filled ? "#56CFEE" : "transparent"}
                />
              );
            })}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              onClick={logWater}
              className="df-press h-7 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1"
              style={{
                background: "color-mix(in srgb, #56CFEE 24%, transparent)",
                border: "1px solid color-mix(in srgb, #56CFEE 55%, transparent)",
                color: "var(--df-text-primary)",
              }}
              aria-label="Log a glass of water"
            >
              <Droplet className="h-3 w-3" fill="#56CFEE" style={{ color: "#2E9FBE" }} />
              Add glass
            </button>
            {dayWater.length > 0 && (
              <button
                onClick={removeLastWater}
                className="df-press h-7 px-2.5 rounded-full text-[11px] font-semibold"
                style={{
                  background: "var(--df-chip-fill)",
                  border: "0.5px solid var(--df-chip-border)",
                  color: "var(--df-text-secondary)",
                }}
                aria-label="Remove last glass"
                title="Remove the last logged glass"
              >
                Undo last
              </button>
            )}
          </div>
        </div>
      </section>

      {/* summary stat cards */}
      <section aria-label="Day stats" className="mt-4 grid grid-cols-3 gap-1.5">
        <StatCard label="Sleep" value={fmtDuration(sleep.done)} />
        <StatCard label="Workouts" value={fmtDuration(goals.find((g) => g.key === "fitness")!.done)} />
        <StatCard label="Tracked" value={fmtDuration(totalTracked(data.events, dateKey))} />
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
            centerValue={fmtDuration(totalTracked(data.events, dateKey))}
          />
          <ul className="mt-3 w-full flex flex-col gap-1">
            {donutSlices.slice(0, 7).map((s) => (
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
      </section>
    </aside>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
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
    </div>
  );
}

/* ---------------- right panel: event detail ---------------- */

function EventDetailPanel({
  event,
  onEdit,
  onDelete,
  className,
}: {
  event: TrackEvent;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}) {
  const data = useDayflowData();
  const cat = categoryById(data.categories, event.categoryId);
  const dur = eventDuration(event);

  return (
    <aside
      className={`df-scroll overflow-y-auto px-4 py-4 ${className ?? ""}`}
      aria-label="Block details"
      style={{
        background: "var(--df-right-panel-fill)",
        borderLeft: "0.5px solid var(--df-right-panel-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: cat.colorHex }}
        />
        <span
          className="text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          {cat.name}
        </span>
      </div>

      <h2
        className="mt-2 text-[17px] font-bold leading-snug tracking-tight"
        style={{ color: "var(--df-text-primary)" }}
      >
        {event.title}
      </h2>

      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <span
          className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold tabular-nums"
          style={{
            background: "var(--df-chip-fill)",
            border: "0.5px solid var(--df-chip-border)",
            color: "var(--df-text-primary)",
          }}
        >
          {fmtRange(event)}
          {isOvernight(event) && " +1"}
        </span>
        <span
          className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold tabular-nums"
          style={{
            background: "var(--df-chip-fill)",
            border: "0.5px solid var(--df-chip-border)",
            color: "var(--df-text-primary)",
          }}
        >
          {fmtDuration(dur)}
        </span>
      </div>

      {event.notes && (
        <section className="mt-4">
          <h3
            className="text-[11px] font-bold tracking-[0.06em]"
            style={{ color: "var(--df-text-secondary)" }}
          >
            NOTES
          </h3>
          <p
            className="mt-1.5 text-[12.5px] leading-relaxed"
            style={{ color: "var(--df-text-primary)" }}
          >
            {event.notes}
          </p>
        </section>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={onEdit}
          className="df-press df-btn-primary h-9 px-3.5 text-[12px] font-semibold flex items-center gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="df-press h-9 px-3.5 rounded-md text-[12px] font-semibold flex items-center gap-1.5"
          style={{
            background: "color-mix(in srgb, #FF5950 12%, transparent)",
            border: "0.5px solid color-mix(in srgb, #FF5950 35%, transparent)",
            color: "#E55A3E",
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>

      <p className="mt-4 text-[10.5px] leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
        Logged for{" "}
        {keyToDate(event.dateKey).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        {isOvernight(event) && " (night before)"}
      </p>
    </aside>
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
