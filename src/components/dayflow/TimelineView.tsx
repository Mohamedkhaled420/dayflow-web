"use client";

// TimelineView — the daily timeline, ported from the native Mac app
// and tailored to life tracking: 24-hour proportional cards for
// workouts, work, personal time, meals and overnight sleep, plus
// hydration markers and manual logging (the web replacement for
// screen capture).

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Droplet,
  Flame,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { CategoryIcon } from "@/components/dayflow/category-icons";
import { DonutChart } from "@/components/dayflow/DonutChart";
import { EventDialog } from "@/components/dayflow/EventDialog";
import {
  WorkoutSheet,
  type WorkoutEditTarget,
} from "@/components/dayflow/workout/WorkoutSheet";
import { parseExercises } from "@/lib/workout";
import {
  useDayflowData,
  LOGGABLE_CATEGORIES,
  localDateTime,
} from "@/lib/viewmodel";
import { useDayflowStore } from "@/store/useDayflowStore";
import {
  computeCircadianZones,
  zonesForTimeline,
  isMinuteInPeak,
  type CircadianZones,
  type TimelineZone,
} from "@/lib/circadian";
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
import { hapticSelect, hapticWarn, triggerHaptic } from "@/lib/haptics";
import { springSoft } from "@/lib/motion";
import { CATEGORY_COLORS, CIRCADIAN_COLORS } from "@/styles/palette";
import { DoodleCluster, DoodleCrown, DoodleNotebook, DoodleSparkle, Marker, SquiggleUnderline, StickerTilt } from "@/components/dayflow/doodles";

const WATER = CATEGORY_COLORS.water;

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
  // Phase 10: gym sessions (workout rows carrying exercises) edit in
  // the WorkoutSheet gym logger, not the plain EventDialog.
  const [workoutEdit, setWorkoutEdit] = useState<WorkoutEditTarget | null>(null);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Sticky controls row (date rail + Day/Week toggle) — the phone
  // calendar popover anchors under it, so it needs a handle.
  const controlsRef = useRef<HTMLDivElement>(null);
  // Standalone (pinned) + iPhone QA fix: the phone calendar popover
  // used a hardcoded top offset (safe-area-top + 152px) tuned for a
  // short controls row — but the sticky block also carries the
  // category chip rail, so on 414px the popover overlapped the chips
  // by ~45px (the IMG_7210 screenshot complaint). Measure the stuck
  // controls' real bottom at open instead of guessing.
  const [calTop, setCalTop] = useState<number | null>(null);
  useEffect(() => {
    // No reset-on-close: the popover unmounts anyway, and a stale
    // measurement is re-measured on the next open's first frame.
    if (!showCalendar) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 1024px)").matches) return; // desktop: in-flow
    const measure = () => {
      const controls = controlsRef.current;
      if (!controls) return;
      const bottom = controls.getBoundingClientRect().bottom;
      if (bottom > 0) setCalTop(Math.round(bottom + 8));
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [showCalendar]);

  const data = useDayflowData();
  const categories = LOGGABLE_CATEGORIES;
  const addHydrationLog = useDayflowStore((s) => s.addHydrationLog);
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const deleteSleepLog = useDayflowStore((s) => s.deleteSleepLog);
  const deleteWorkoutLog = useDayflowStore((s) => s.deleteWorkoutLog);
  const deleteActivityLog = useDayflowStore((s) => s.deleteActivityLog);
  const updateSleepLog = useDayflowStore((s) => s.updateSleepLog);
  const updateWorkoutLog = useDayflowStore((s) => s.updateWorkoutLog);
  const updateActivityLog = useDayflowStore((s) => s.updateActivityLog);
  const profileRow = useDayflowStore((s) => s.profile);

  /** edit path: gym sessions → WorkoutSheet, everything else → EventDialog */
  const openEditor = (ev: TrackEvent) => {
    if (ev.source === "workout") {
      const row = workoutLogs.find((r) => r.id === ev.id);
      if (row && parseExercises(row.exercises ?? null).length > 0) {
        setWorkoutEdit({
          id: row.id,
          type: row.type,
          duration_minutes: row.duration_minutes,
          active_calories: row.active_calories,
          logged_at: row.logged_at,
          exercises: row.exercises,
        });
        return;
      }
    }
    setDialog({ open: true, event: ev });
  };
  const profile = data.profile;

  const dateKey = keyForOffset(dayOffset);
  const dayEvents = useMemo(() => eventsForDay(data.events, dateKey), [data.events, dateKey]);
  const trackedMin = useMemo(
    () => totalTracked(data.events, dateKey),
    [data.events, dateKey]
  );
  // Up next (Phase 11): today's remaining blocks for the horizontal
  // "Today's Schedule" rail from the reference home screen — blocks
  // whose latest minute is still ahead of now (ongoing included).
  const upNext = useMemo(() => {
    if (dayOffset !== 0) return [];
    const now = nowMinutes() - 15;
    return dayEvents
      .filter((e) => Math.max(toMinutes(e.start), toMinutes(e.end)) > now)
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
      .slice(0, 8);
  }, [dayEvents, dayOffset]);

  // Circadian zones (T1c): MCTQ windows from the profile's
  // chronobiology section — naturalWakeTime + target sleep duration.
  const zones = useMemo<CircadianZones>(() => {
    const chrono =
      profileRow?.chronobiology &&
      typeof profileRow.chronobiology === "object" &&
      !Array.isArray(profileRow.chronobiology)
        ? (profileRow.chronobiology as {
            naturalWakeTime?: string;
            targetSleepDurationMinutes?: number;
          })
        : {};
    return computeCircadianZones(
      chrono.naturalWakeTime,
      chrono.targetSleepDurationMinutes
    );
  }, [profileRow]);
  const timelineZones = useMemo(() => zonesForTimeline(zones), [zones]);
  const visibleEvents = useMemo(
    () => (filter ? dayEvents.filter((e) => e.categoryId === filter) : dayEvents),
    [dayEvents, filter]
  );
  const selected = useMemo(
    () => dayEvents.find((e) => e.id === selectedId) ?? null,
    [dayEvents, selectedId]
  );

  // auto-scroll to a sensible anchor (now on today, wake time otherwise).
  // DESKTOP ONLY: mobile now rides the single column scroll flow and
  // opens at the hero (the natural start) — re-scrolling there on
  // every date change read as a view jump. (1023px matches the
  // app shell's lg mobile/desktop split.)
  useEffect(() => {
    if (mode !== "day") return;
    if (window.matchMedia("(max-width: 1023px)").matches) return;
    const el = scrollRef.current;
    if (!el) return;
    const anchor = dayOffset === 0 ? nowMinutes() - 120 : 5 * 60 + 30;
    const scrollTop = Math.max(0, anchor * PX_PER_MIN - 60);
    if (el.scrollHeight > el.clientHeight + 8) {
      el.scrollTo({ top: scrollTop, behavior: "smooth" });
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
    triggerHaptic();
    // Optimistic toast on the expected total — the Delta Sync store
    // appends locally first, then fires the Supabase insert. The toast
    // only claims success when a row actually landed (2026-09 fix: a
    // dead session used to no-op silently while still toasting).
    void addHydrationLog({ amount_ml: profile.waterGlassMl }).then((id) => {
      if (id) {
        toast({
          title: "Glass logged",
          description: `${profile.waterGlassMl} ml · ${waterTotal(data.water, dateKey) + profile.waterGlassMl} ml today`,
        });
      } else {
        toast({
          title: "Water didn't log",
          description: "Your session looks expired — reload the app and try again.",
        });
      }
    });
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0">
      {/* ------- timeline column ------- */}
      {/* 2026-09 iPhone QA fix: on phones the COLUMN is the one
          scroll surface (single flow — hero, rail, controls, event
          list and the day summary all ride it). The old layout kept
          the hero/controls fixed and squeezed the event list into a
          ~260px nested scroller, which read as cramped and left a
          big void above the dock. Desktop keeps the fixed-chrome +
          scrolling-grid split. */}
      <div className="df-scroll flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
        {/* Lively Pastel hero (Phase 10 + 11) — the reference home:
            periwinkle greeting card ("Hey, {name}" + streak badge +
            the ONE charcoal pill CTA) beside the CHARCOAL progress
            card with the sunny yellow ring ("Excellent! · % of the
            day mapped"). Stacks on phones, pairs from sm up. */}
        <div className="df-rise mx-4 mt-4 mb-1 flex shrink-0 flex-col gap-2 sm:mx-5 sm:flex-row">
        <section
          className="relative flex-1 min-w-0 overflow-hidden rounded-[24px] px-5 py-4"
          style={{
            background: "var(--df-hero-panel)",
            border: "0.5px solid var(--df-hero-panel-edge)",
            boxShadow: "var(--df-hero-panel-shadow)",
          }}
          aria-label="Today at a glance"
        >
          {/* doodle cluster — a sticker of sparkles leaning into the
              hero corner (decorative, aria-hidden) */}
          <StickerTilt
            degrees={10}
            className="pointer-events-none absolute bottom-1.5 right-2.5"
          >
            <DoodleCluster className="h-12 w-12" />
          </StickerTilt>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                className="text-[20px] font-extrabold leading-snug tracking-tight"
                style={{ color: "var(--df-text-primary)" }}
              >
                Hey, <Marker>{profile.name}</Marker>
              </h2>
              <p
                className="mt-0.5 text-[12px] font-semibold leading-none"
                style={{ color: "var(--df-text-secondary)" }}
              >
                {dayLabel(dayOffset)} · {fmtDuration(totalTracked(data.events, dateKey))} tracked
              </p>
            </div>
            <span
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-bold"
              style={{
                background: "var(--df-hero-badge-fill)",
                border: "0.5px solid var(--df-hero-badge-border)",
                color: "var(--df-text-primary)",
              }}
              aria-label={`${dayEvents.length} ${dayEvents.length === 1 ? "block" : "blocks"} on the timeline`}
            >
              <Flame className="h-3.5 w-3.5" style={{ color: "var(--df-streak)" }} aria-hidden="true" />
              {dayEvents.length} {dayEvents.length === 1 ? "block" : "blocks"}
            </span>
          </div>
          <button
            onClick={() => setDialog({ open: true, event: null })}
            className="df-press df-btn-primary mt-3.5 inline-flex h-9 items-center gap-1.5 px-4 text-[12.5px] font-bold"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
            Plan today
          </button>
        </section>
          <ProgressHeroCard trackedMin={trackedMin} blocks={dayEvents.length} />
        </div>

        {/* Up next — the reference's horizontal "Today's Schedule"
            rail: the day's remaining blocks as pastel cards with the
            circular category medallions; tap selects + scrolls the
            timeline to the block. */}
        {mode === "day" && (
          <UpNextRail
            events={upNext}
            onSelect={(id) => {
              hapticSelect();
              setSelectedId(id);
              document
                .querySelector(`[data-seg-id="${id}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        )}

        {/* controls header — sticky inside the mobile column scroll
            (the date rail + Day/Week toggle stay reachable while the
            event list scrolls under them) and plain flow on desktop. */}
        <div ref={controlsRef} className="sticky top-0 z-20 bg-[var(--df-panel-fill)] lg:static">
        <header
          className="df-timeline-header px-4 sm:px-5 pt-3 pb-2.5 flex flex-wrap items-center gap-x-2 gap-y-2"
          style={{ background: "linear-gradient(to bottom, var(--df-panel-fill) 78%, transparent)" }}
        >
          <div className="flex items-center gap-1.5">
            <NavArrow dir="prev" disabled={dayOffset <= -13} onClick={() => go(-1)} />
            <button
              onClick={() => {
                // On phones the popover is viewport-anchored below
                // this row — stick the row to the top first so the
                // popover reads as attached to its trigger. Instant
                // (not smooth): the popover measures the stuck row
                // on the very next frame, so the scroll must already
                // have settled when the measurement runs.
                if (!showCalendar && window.matchMedia("(max-width: 1023px)").matches) {
                  controlsRef.current?.scrollIntoView({ block: "start" });
                }
                setShowCalendar((v) => !v);
              }}
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
              <Droplet className="h-3.5 w-3.5" style={{ color: WATER, fill: WATER }} />
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
          <div className="df-timeline-filters px-4 sm:px-5 pt-1 pb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
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
        </div>

        {/* calendar popover — anchored to its trigger, springs in,
            dismisses on outside click or Escape. 2026-09 iPhone QA
            fix: absolutely positioned under the sticky controls row
            so opening it overlays instead of shoving the timeline
            down the scroll flow (it used to sit in-flow and pushed
            the whole list ~330px, which read as a broken layout). */}
        <AnimatePresence>
          {showCalendar && (
            <motion.div
              key="cal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[55]"
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
                /* Phone: measured top under the stuck controls row
                   (see the calTop effect above). The class fallback
                   only paints for the first frame before the
                   measurement lands. */
                ...(calTop != null ? { top: calTop } : {}),
              }}
              className="absolute max-lg:fixed left-4 max-lg:top-[calc(var(--safe-area-top,0px)+152px)] z-[60] w-[282px] overflow-hidden rounded-[20px] backdrop-blur-xl saturate-180 sm:left-5 lg:relative lg:top-auto lg:mx-0 lg:mb-3"
            >
              {/* Phase 11 — warm-yellow head band (the reference
                  calendar screen): month label + a Today quick-jump. */}
              <div
                className="flex items-center justify-between gap-2 px-3.5 py-2"
                style={{ background: "var(--df-calendar-head)" }}
              >
                <p
                  className="text-[12px] font-extrabold capitalize leading-none"
                  style={{ color: "var(--df-calendar-head-ink)" }}
                >
                  {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
                <button
                  onClick={() => {
                    setDayOffset(0);
                    setSelectedId(null);
                    setShowCalendar(false);
                  }}
                  className="df-press rounded-full px-2.5 py-1 text-[10px] font-bold leading-none"
                  style={{
                    background: "var(--df-date-pill-fill)",
                    border: "0.5px solid var(--df-date-pill-border)",
                    color: "var(--df-text-primary)",
                  }}
                >
                  Today
                </button>
              </div>

              {/* date pill strip — ±3 days around the selection (the
                  reference date pills: white capsules, selected =
                  charcoal capsule with stacked weekday + number) */}
              <div className="df-scroll flex gap-1.5 overflow-x-auto px-3 py-2.5">
                {[-3, -2, -1, 0, 1, 2, 3].map((o) => {
                  const d = new Date();
                  d.setDate(d.getDate() + o);
                  const active = o === dayOffset;
                  return (
                    <button
                      key={o}
                      disabled={o > 0}
                      onClick={() => {
                        setDayOffset(o);
                        setSelectedId(null);
                        setShowCalendar(false);
                      }}
                      className="df-press flex h-[46px] w-[36px] shrink-0 flex-col items-center justify-center gap-[2px] rounded-[14px] disabled:opacity-35"
                      style={
                        active
                          ? {
                              background: "var(--df-date-pill-active)",
                              color: "var(--df-date-pill-active-ink)",
                            }
                          : {
                              background: "var(--df-date-pill-fill)",
                              border: "0.5px solid var(--df-date-pill-border)",
                              color: "var(--df-text-primary)",
                            }
                      }
                      aria-pressed={active}
                      aria-label={d.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    >
                      <span className="text-[8.5px] font-bold uppercase leading-none">
                        {d.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                      <span className="text-[13px] font-extrabold leading-none">
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* month grid — day cells become full pills */}
              <div className="grid grid-cols-7 gap-1.5 px-3 pb-3">
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                  <span
                    key={d}
                    className="h-5 text-center text-[9.5px] font-bold uppercase tracking-wide"
                    style={{ color: "var(--df-text-muted)" }}
                    aria-hidden="true"
                  >
                    {d}
                  </span>
                ))}
                {buildCalendarDays().map((d, i) =>
                  d.placeholder ? (
                    <span key={`pad-${i}`} aria-hidden="true" />
                  ) : (
                    <button
                      key={d.dayNum}
                      disabled={d.offset > 0}
                      onClick={() => {
                        setDayOffset(d.offset);
                        setSelectedId(null);
                        setShowCalendar(false);
                      }}
                      className="df-press h-8 rounded-full text-[12px] font-medium disabled:opacity-30"
                      style={
                        d.offset === dayOffset
                          ? {
                              background: "var(--df-date-pill-active)",
                              color: "var(--df-date-pill-active-ink)",
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
                  )
                )}
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
            selected={selected}
            dateKey={dateKey}
            zones={timelineZones}
            onSelect={(id) => {
              hapticSelect();
              setSelectedId((cur) => (cur === id ? null : id));
            }}
            onEdit={() => selected && openEditor(selected)}
            onDelete={async () => {
              if (!selected) return;
              hapticWarn();
              setSelectedId(null);
              if (selected.source === "sleep") {
                await deleteSleepLog(selected.id);
              } else if (selected.source === "activity") {
                await deleteActivityLog(selected.id);
              } else {
                await deleteWorkoutLog(selected.id);
              }
              toast({ title: "Block deleted", description: selected.title });
            }}
            onMove={async (event, newStart, newEnd) => {
              // Drag-to-reschedule: persist through the Delta Sync
              // store (sleep -> wake time shift, workout -> start shift).
              const dur = eventDuration(event);
              if (event.source === "sleep") {
                await updateSleepLog(event.id, {
                  sleep_minutes: dur,
                  logged_at: localDateTime(event.dateKey, newEnd),
                });
              } else if (event.source === "activity") {
                await updateActivityLog(event.id, {
                  duration_minutes: dur,
                  logged_at: localDateTime(event.dateKey, newStart),
                });
              } else {
                await updateWorkoutLog(event.id, {
                  type: event.title,
                  duration_minutes: dur,
                  logged_at: localDateTime(event.dateKey, newStart),
                });
              }
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

      {/* ------- right inspector (desktop only — mobile gets the
          detail + summary inside the timeline scroll flow) ------- */}
      {selected ? (
        <EventDetailPanel
          event={selected}
          onEdit={() => openEditor(selected)}
          onDelete={async () => {
            hapticWarn();
            setSelectedId(null);
            if (selected.source === "sleep") {
              await deleteSleepLog(selected.id);
            } else if (selected.source === "activity") {
              await deleteActivityLog(selected.id);
            } else {
              await deleteWorkoutLog(selected.id);
            }
            toast({ title: "Block deleted", description: selected.title });
          }}
          className="hidden lg:flex lg:w-[300px] xl:w-[320px] shrink-0 border-t lg:border-t-0"
        />
      ) : (
        <DaySummaryPanel
          dateKey={dateKey}
          className="hidden lg:flex lg:w-[300px] xl:w-[320px] shrink-0 border-t lg:border-t-0"
        />
      )}

      {/* add / edit dialog */}
      <EventDialog
        open={dialog.open}
        event={dialog.event}
        dateKey={dateKey}
        onClose={() => setDialog({ open: false, event: null })}
      />

      {/* Phase 10 — gym-session editor */}
      <WorkoutSheet
        open={!!workoutEdit}
        editing={workoutEdit}
        dateKey={dateKey}
        onClose={() => setWorkoutEdit(null)}
      />
    </div>
  );
}

/* ---------------- small pieces ---------------- */

/** Phase 11 — the charcoal "day mapped" card from the reference
 *  home screen: thick sunny-yellow progress ring on charcoal, a
 *  tiered headline ("Excellent!" at ≥70%) and the tracked total.
 *  Coverage = tracked minutes against a 16h waking span — honest
 *  about being a mapping metric, not a completion promise. */
function ProgressHeroCard({
  trackedMin,
  blocks,
}: {
  trackedMin: number;
  blocks: number;
}) {
  const span = 16 * 60;
  const pct = Math.max(0, Math.min(1, trackedMin / span));
  const pctLabel = Math.round(pct * 100);
  const headline =
    pct >= 0.7
      ? "Excellent!"
      : pct >= 0.35
        ? "Taking shape…"
        : trackedMin > 0
          ? "Good start!"
          : "Nothing tracked yet";
  const sub =
    trackedMin > 0
      ? `${fmtDuration(trackedMin)} mapped · ${blocks} ${blocks === 1 ? "block" : "blocks"}`
      : "Plan your first block";
  const r = 25.5;
  const c = 2 * Math.PI * r;
  return (
    <section
      className="relative flex items-center gap-3.5 overflow-hidden rounded-[24px] px-4 py-3 sm:w-[228px]"
      style={{
        background: "var(--df-progress-card-fill)",
        border: "0.5px solid var(--df-progress-card-edge)",
        boxShadow: "var(--df-progress-card-shadow)",
      }}
      aria-label="Share of the day mapped"
    >
      <svg
        width="60"
        height="60"
        viewBox="0 0 60 60"
        role="img"
        aria-label={`${pctLabel}% of a 16-hour waking day mapped`}
        className="shrink-0"
      >
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke="var(--df-progress-ring-track)"
          strokeWidth="9"
        />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke="var(--df-progress-ring)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(c * pct).toFixed(2)} ${c.toFixed(2)}`}
          transform="rotate(-90 30 30)"
        />
        <text
          x="30"
          y="31"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fill="var(--df-progress-card-ink)"
        >
          {pctLabel}%
        </text>
      </svg>
      <div className="min-w-0">
        <p
          className="truncate text-[13px] font-extrabold leading-tight"
          style={{ color: "var(--df-progress-card-ink)" }}
        >
          {pct >= 0.7 ? (
            <DoodleCrown className="mr-1 inline-block h-4 w-5 -translate-y-0.5 -rotate-6 align-baseline" />
          ) : trackedMin > 0 ? (
            <DoodleSparkle className="mr-1 inline-block h-3.5 w-3.5 -translate-y-px align-baseline" />
          ) : null}
          {headline}
        </p>
        <p
          className="mt-0.5 text-[10.5px] font-medium leading-tight"
          style={{ color: "var(--df-progress-card-ink-soft)" }}
        >
          {sub}
        </p>
      </div>
    </section>
  );
}

/** Phase 11 — "Up next": the reference home's horizontal
 *  Today's-Schedule rail. Pastel-washed cards with the circular
 *  white-ringed category medallions; the edge fade signals the
 *  rail scrolls. Tap = select + scroll the block into view. */
function UpNextRail({
  events,
  onSelect,
}: {
  events: TrackEvent[];
  onSelect: (id: string) => void;
}) {
  if (events.length === 0) return null;
  return (
    <div className="mx-4 mt-2.5 sm:mx-5" aria-label="Up next today">
      <div className="flex items-baseline justify-between px-0.5 pb-1.5">
        <p
          className="relative text-[12.5px] font-extrabold leading-none"
          style={{ color: "var(--df-text-primary)" }}
        >
          Up next
          {/* hand-drawn squiggle — the notebook underline */}
          <SquiggleUnderline className="pointer-events-none absolute -bottom-[5px] left-0 h-[7px] w-[58px]" />
        </p>
        <p
          className="text-[10.5px] font-semibold leading-none"
          style={{ color: "var(--df-text-muted)" }}
        >
          {events.length} {events.length === 1 ? "block" : "blocks"} to go
        </p>
      </div>
      <div
        className="df-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="list"
        aria-label="Remaining blocks today"
      >
        {events.map((event) => {
          const cat = categoryById(LOGGABLE_CATEGORIES, event.categoryId);
          return (
            <button
              key={event.id}
              role="listitem"
              onClick={() => onSelect(event.id)}
              className="df-press flex w-[172px] shrink-0 items-center gap-2.5 rounded-[16px] px-3 py-2.5 text-left"
              style={{
                background: `color-mix(in srgb, ${cat.colorHex} 14%, var(--df-card-fill))`,
                border: `0.5px solid color-mix(in srgb, ${cat.colorHex} 30%, transparent)`,
              }}
              aria-label={`${event.title}, ${cat.name}, ${fmtRange(event)}`}
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${cat.colorHex} 26%, var(--df-card-fill))`,
                  border: "2px solid var(--df-white)",
                  boxShadow: `0 0 0 2px color-mix(in srgb, ${cat.colorHex} 32%, transparent)`,
                  color: `color-mix(in srgb, ${cat.colorHex} 62%, var(--df-text-primary))`,
                }}
                aria-hidden="true"
              >
                <CategoryIcon name={cat.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[11.5px] font-bold leading-tight"
                  style={{ color: "var(--df-text-primary)" }}
                >
                  {event.title}
                </span>
                <span
                  className="mt-0.5 block truncate text-[9.5px] font-medium leading-tight"
                  style={{ color: "var(--df-text-muted)" }}
                >
                  {fmtRange(event)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
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
  selected,
  dateKey,
  zones,
  onSelect,
  onEdit,
  onDelete,
  onMove,
  scrollRef,
}: {
  events: TrackEvent[];
  water: { id: string; time: string; ml: number }[];
  glassMl: number;
  isToday: boolean;
  selectedId: string | null;
  selected: TrackEvent | null;
  dateKey: string;
  zones: TimelineZone[];
  onSelect: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (event: TrackEvent, newStart: string, newEnd: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const placed = useMemo(() => placeSegments(events), [events]);
  const { toast } = useToast();
  const hourLines = useMemo(() => {
    const out: number[] = [];
    for (let h = 0; h <= 24; h++) out.push(h);
    return out;
  }, []);
  const nowMin = nowMinutes();

  // T1c: translucent circadian bands behind the grid — green Peaks,
  // orange Dip (colors from the palette data single-source).
  const zoneBands = (extraClass: string) =>
    zones.map((z) => {
      const color = z.kind === "peak" ? CIRCADIAN_COLORS.peak : CIRCADIAN_COLORS.dip;
      const top = z.startMin * PX_PER_MIN;
      const height = Math.max((z.endMin - z.startMin) * PX_PER_MIN, 8);
      return (
        <div
          key={`${z.kind}-${z.startMin}`}
          aria-hidden="true"
          className={`absolute ${extraClass}`}
          style={{
            top,
            height,
            left: 46,
            right: 0,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            borderTop: `1px dashed color-mix(in srgb, ${color} 45%, transparent)`,
            borderBottom: `1px dashed color-mix(in srgb, ${color} 45%, transparent)`,
          }}
        />
      );
    });

  /** Zone chip for a block — mobile list affordance (T1c). */
  const zoneChipFor = (event: TrackEvent) => {
    const startMin = toMinutes(event.start);
    const hit = zones.find(
      (z) => startMin >= z.startMin && startMin < z.endMin
    );
    if (!hit) return null;
    const color = hit.kind === "peak" ? CIRCADIAN_COLORS.peak : CIRCADIAN_COLORS.dip;
    return (
      <span
        className="rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          border: `0.5px solid color-mix(in srgb, ${color} 45%, transparent)`,
        }}
      >
        {hit.kind === "peak" ? "Peak" : "Dip"}
      </span>
    );
  };

  return (
    <>
      {/* ------- MOBILE / TABLET (< lg): one scroll flow —
          event list, selected block detail, then the day
          summary (goals, hydration, stats) — everything
          reachable, nothing clipped (2026-09 iPhone QA fix:
          this used to be its own ~260px nested scroller wedged
          under the fixed hero/controls, which read as cramped
          and left a large void above the dock; the column is
          the single scroll surface now). ------- */}
      <div className="flex flex-col gap-3 px-4 pb-6 pt-1 lg:hidden">
        <div className="df-mobile-event-list flex flex-col gap-2" role="list" aria-label="Day timeline">
          {events.length === 0 ? (
            <div className="df-card mt-3 p-5 text-center">
              <DoodleNotebook className="mx-auto h-14 w-14 -rotate-3" />
              <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--df-text-primary)" }}>Nothing tracked yet</p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--df-text-secondary)" }}>Tap Log above — work, meals, a workout, anything at all.</p>
            </div>
          ) : (
            events.map((event) => {
              const cat = categoryById(LOGGABLE_CATEGORIES, event.categoryId);
              return (
                <button
                  key={event.id}
                  data-seg-id={event.id}
                  onClick={() => onSelect(event.id)}
                  className="df-mobile-event df-card df-lift flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left df-press"
                  style={{
                    background: `color-mix(in srgb, ${cat.colorHex} 12%, var(--df-card-fill))`,
                    outline: selectedId === event.id ? "1.5px solid var(--df-accent)" : "none",
                  }}
                  aria-pressed={selectedId === event.id}
                  aria-label={`${event.title}, ${cat.name}, ${fmtRange(event)}, ${fmtDuration(eventDuration(event))}`}
                >
                  {/* circular category medallion — the reference's
                      photo-cutout circle, white-ringed + softly tinted */}
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-full"
                    style={{
                      background: `color-mix(in srgb, ${cat.colorHex} 26%, var(--df-card-fill))`,
                      border: "2px solid var(--df-white)",
                      boxShadow: `0 0 0 2px color-mix(in srgb, ${cat.colorHex} 32%, transparent)`,
                      color: `color-mix(in srgb, ${cat.colorHex} 62%, var(--df-text-primary))`,
                    }}
                    aria-hidden="true"
                  >
                    <CategoryIcon name={cat.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold" style={{ color: "var(--df-text-primary)" }}>{event.title}</span>
                      {zoneChipFor(event)}
                    </span>
                    <span className="mt-1 block truncate text-[10.5px]" style={{ color: "var(--df-text-muted)" }}>{cat.name} · {fmtRange(event)}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] font-semibold tabular-nums" style={{ color: "var(--df-text-secondary)" }}>{fmtDuration(eventDuration(event))}</span>
                </button>
              );
            })
          )}
        </div>

        {/* selected block detail — inline, above the summary */}
        {selected && (
          <div className="df-card p-4" aria-label="Block details">
            <EventDetailPanel
              event={selected}
              onEdit={onEdit}
              onDelete={onDelete}
              variant="embedded"
            />
          </div>
        )}

        {/* day summary — goals, hydration quick-log, stats */}
        <DaySummaryContent dateKey={dateKey} />
      </div>

      {/* ------- DESKTOP (≥ lg): proportional 24h grid ------- */}
      <div
        ref={scrollRef}
        className="df-desktop-timeline df-scroll df-edge-fade hidden flex-1 overflow-y-auto px-4 pb-8 sm:px-5 lg:block"
        role="list"
        aria-label="Day timeline"
      >
      <div className="relative pt-1" style={{ height: DAY_SPAN * PX_PER_MIN + 30 }}>
        {/* circadian zone bands (T1c) — behind everything */}
        <div aria-hidden="true" className="absolute inset-0">
          {zoneBands("z-0")}
        </div>

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

        {/* hour labels every 2 hours — future hours dim to a
            READABLE future tone (2026-09 fix: they previously used
            the 7%-alpha grid-line token as a text color and were
            invisible on the white surface) */}
        <div aria-hidden="true">
          {hourLines
            .filter((h) => h % 2 === 0 && h < 24)
            .map((h) => (
              <div
                key={h}
                className="absolute right-[calc(100%-44px)] text-[11px] font-medium tabular-nums"
                style={{
                  top: h * 60 * PX_PER_MIN - 8,
                  color:
                    isToday && h * 60 > nowMin
                      ? "var(--df-hour-label-future)"
                      : "var(--df-hour-label)",
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
                background: `color-mix(in srgb, ${WATER} 26%, transparent)`,
                border: `1px solid color-mix(in srgb, ${WATER} 65%, transparent)`,
              }}
            >
              <Droplet className="h-[10px] w-[10px]" style={{ color: "var(--df-water-ink)", fill: WATER }} />
            </span>
          </div>
        ))}

        {/* activity cards */}
        {placed.map(({ seg, top, height }, i) => (
          <motion.div
            key={seg.key}
            role="listitem"
            data-seg-id={seg.event.id}
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
              zones={zones}
              onClick={() => onSelect(seg.event.id)}
              onMove={onMove}
            />
          </motion.div>
        ))}

        {/* empty state */}
        {placed.length === 0 && (
          <div
            className="absolute left-[46px] right-0 top-[300px] df-card p-5 text-center"
            style={{ borderColor: "var(--df-card-border)" }}
          >
            <DoodleNotebook className="mx-auto h-14 w-14 rotate-2" />
            <p className="text-[13px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
              Nothing tracked yet
            </p>
            <p className="text-[11.5px] mt-1" style={{ color: "var(--df-text-secondary)" }}>
              Tap <b>Log</b> above to map anything — work, meals, a workout, sleep — or drag a
              block into a green peak zone to schedule it there.
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
  zones,
  onClick,
  onMove,
}: {
  event: TrackEvent;
  segmentLabel?: string;
  selected: boolean;
  zones: TimelineZone[];
  onClick: () => void;
  onMove: (event: TrackEvent, newStart: string, newEnd: string) => void;
}) {
  const data = useDayflowData();
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();
  const cat = categoryById(data.categories, event.categoryId);
  const dur = eventDuration(event);
  const cardH = Math.max(dur * PX_PER_MIN - 2, MIN_CARD_H);
  const compact = cardH < 44;

  // T1c drag: vertical drag reschedules the block; dropping into a
  // Peak zone fires the flow-state haptic + a visual confirmation.
  // Taps below motion's drag epsilon still register as clicks.
  const minutesToClock = (m: number) =>
    `${pad2(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad2(m % 60)}`;

  const handleDragEnd = (_: unknown, info: { offset: { y: number } }) => {
    const deltaMin = Math.round(info.offset.y / PX_PER_MIN / 5) * 5; // 5-min snap
    if (Math.abs(deltaMin) < 5) return; // treat as a tap/select
    const startMin = toMinutes(event.start);
    const durM = eventDuration(event);
    // Sleep blocks are anchored by their END (wake) time.
    const isSleep = event.categoryId === "sleep";
    const base = isSleep ? toMinutes(event.end) : startMin;
    const newBase = Math.max(0, Math.min(1439, base + deltaMin));
    const newStart = isSleep ? newBase - durM : newBase;
    const newEnd = isSleep ? newBase : newBase + durM;
    const landedPeak = zones.some(
      (z) =>
        z.kind === "peak" &&
        Math.max(0, newStart) >= z.startMin &&
        Math.max(0, newStart) < z.endMin
    );
    onMove(event, minutesToClock(newStart), minutesToClock(newEnd));
    if (landedPeak) {
      // Flow-state confirmation (PRD §4.2): haptic + visual tick.
      triggerHaptic();
      toast({
        title: "Scheduled into a Peak zone",
        description: `${event.title} now rides your ${isSleep ? "wake" : "start"} at ${minutesToClock(newBase)}`,
      });
    }
  };

  return (
    <motion.button
      onClick={onClick}
      drag={reducedMotion ? false : "y"}
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.18}
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: 1.015, zIndex: 30 }}
      style={{
        cursor: "grab",
        touchAction: "none",
        /* Lively Pastel: every card rides a soft wash of its own
           category pastel over the cream base (16% keeps slate ink
           well past AA on the composite). */
        background: `color-mix(in srgb, ${cat.colorHex} 16%, var(--df-card-fill))`,
      }}
      className={`df-card df-lift w-full h-full text-left flex flex-col overflow-hidden df-press relative ${
        compact ? "py-[3px] px-3" : "py-2 px-3.5"
      }`}
      aria-pressed={selected}
      aria-label={`${event.title}, ${cat.name}, ${fmtRange(event)}, ${fmtDuration(dur)}. Drag vertically to reschedule.`}
    >
      {/* selection outline — on the wrapper (motion.button) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          outline: selected ? "1.5px solid var(--df-accent)" : "none",
          outlineOffset: "1px",
        }}
      />
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
    </motion.button>
  );
}

/* ---------------- week timeline ---------------- */

function WeekTimeline({ dateKey }: { dateKey: string }) {
  const data = useDayflowData();
  const week = useMemo(() => weekOf(dateKey), [dateKey]);
  // Week-at-a-glance rollup (2026-09 iPhone QA fix): with a light
  // week, the 7-column grid ended mid-screen and left a large blank
  // void above the dock — the rollup fills that space with actual
  // signal (tracked time, active days, blocks, category mix).
  const rollup = useMemo(() => {
    let totalMin = 0;
    let blocks = 0;
    const activeDays = new Set<string>();
    const byCat = new Map<string, number>();
    for (const d of week) {
      for (const e of eventsForDay(data.events, d.dateKey)) {
        const min = eventDuration(e);
        totalMin += min;
        blocks++;
        activeDays.add(d.dateKey);
        byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + min);
      }
    }
    const mix = Array.from(byCat.entries())
      .map(([id, min]) => {
        const cat = categoryById(data.categories, id);
        return { name: cat.name, colorHex: cat.colorHex, min };
      })
      .sort((a, b) => b.min - a.min);
    return { totalMin, blocks, activeDays: activeDays.size, mix };
  }, [week, data.events, data.categories]);
  return (
    <div className="px-4 pb-6 sm:px-5 lg:flex-1 lg:overflow-y-auto lg:pb-8">
      {/* 2026-09 iPhone QA fix: seven 47px columns truncated every
          block title to "Home Pu…". On phones the grid now rides a
          horizontal scroller with a 78px floor per day (blocks keep
          ~2 readable lines); desktop keeps the full-width grid. */}
      <div className="df-scroll overflow-x-auto pb-1 lg:overflow-visible">
      <div className="grid grid-cols-[repeat(7,minmax(78px,1fr))] gap-2 lg:grid-cols-7">
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
                    className="text-[10px] rounded-[14px] py-2 text-center"
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

      {/* week at a glance — totals + category mix bar */}
      <div
        className="mt-4 rounded-[16px] p-3.5"
        style={{
          background: "var(--df-chip-fill)",
          border: "0.5px solid var(--df-chip-border)",
        }}
        aria-label="Week at a glance"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--df-text-secondary)" }}>
            This week
          </p>
          <p className="text-[10.5px] font-semibold tabular-nums" style={{ color: "var(--df-text-muted)" }}>
            {rollup.activeDays} active {rollup.activeDays === 1 ? "day" : "days"} · {rollup.blocks} {rollup.blocks === 1 ? "block" : "blocks"}
          </p>
        </div>
        <p className="mt-1.5 text-[20px] font-extrabold leading-none tracking-tight" style={{ color: "var(--df-text-primary)" }}>
          {fmtDuration(rollup.totalMin)}
          <span className="ml-1.5 text-[11px] font-semibold" style={{ color: "var(--df-text-muted)" }}>
            tracked
          </span>
        </p>
        {rollup.mix.length > 0 && (
          <div className="mt-2.5">
            <div
              className="flex h-[8px] gap-[2px] overflow-hidden rounded-full"
              role="img"
              aria-label={`Category mix: ${rollup.mix.map((m) => `${m.name} ${fmtDuration(m.min)}`).join(", ")}`}
            >
              {rollup.mix.map((m) => (
                <span
                  key={m.name}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${Math.max((m.min / Math.max(rollup.totalMin, 1)) * 100, 4)}%`,
                    background: m.colorHex,
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {rollup.mix.slice(0, 4).map((m) => (
                <span key={m.name} className="flex items-center gap-1.5 text-[10.5px] font-medium" style={{ color: "var(--df-text-secondary)" }}>
                  <span className="size-2 rounded-full" style={{ background: m.colorHex }} aria-hidden="true" />
                  {m.name} · {fmtDuration(m.min)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- right panel: day summary ---------------- */

/**
 * Desktop right-rail wrapper. Mobile renders the same content
 * inside the timeline scroll flow (DaySummaryContent) — the
 * aside styling only applies here.
 */
function DaySummaryPanel({ dateKey, className }: { dateKey: string; className?: string }) {
  return (
    <aside
      className={`df-scroll overflow-y-auto px-4 py-4 ${className ?? ""}`}
      aria-label="Day summary"
      style={{
        background: "var(--df-right-panel-fill)",
        borderLeft: "0.5px solid var(--df-right-panel-border)",
      }}
    >
      <DaySummaryContent dateKey={dateKey} />
    </aside>
  );
}

/** Goals + hydration + stats + donut — shared by the desktop
 *  right rail and the mobile scroll flow. */
function DaySummaryContent({ dateKey }: { dateKey: string }) {
  const data = useDayflowData();
  const addHydrationLog = useDayflowStore((s) => s.addHydrationLog);
  const deleteHydrationLog = useDayflowStore((s) => s.deleteHydrationLog);
  const { toast } = useToast();
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
    triggerHaptic();
    // 2026-09 fix: toast reflects what actually happened — a dead
    // session no-ops in the store and must not claim success.
    void addHydrationLog({ amount_ml: data.profile.waterGlassMl }).then((id) => {
      if (!id) {
        toast({
          title: "Water didn't log",
          description: "Your session looks expired — reload the app and try again.",
        });
      }
    });
  };

  return (
    <div aria-label="Day summary">
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
                className="rounded-[14px] px-2.5 py-2"
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
          className="mt-2 rounded-[16px] p-3"
          style={{
            background: `color-mix(in srgb, ${WATER} 10%, transparent)`,
            border: `0.5px solid color-mix(in srgb, ${WATER} 38%, transparent)`,
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
                  style={{ color: filled ? "var(--df-water-ink)" : "var(--df-text-muted)", opacity: filled ? 1 : 0.35, fill: filled ? WATER : "transparent" }}
                />
              );
            })}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              onClick={logWater}
              className="df-press h-7 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1"
              style={{
                background: `color-mix(in srgb, ${WATER} 24%, transparent)`,
                border: `1px solid color-mix(in srgb, ${WATER} 55%, transparent)`,
                color: "var(--df-text-primary)",
              }}
              aria-label="Log a glass of water"
            >
              <Droplet className="h-3 w-3" style={{ fill: WATER, color: "var(--df-water-ink)" }} />
              Add glass
            </button>
            {dayWater.length > 0 && (
              <button
                onClick={() => {
                  const last = dayWater[dayWater.length - 1];
                  void deleteHydrationLog(last.id);
                }}
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
    </div>
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

/**
 * Block detail. variant="panel" (default) renders the desktop
 * right-rail aside; variant="embedded" renders borderless for
 * the mobile inline card (no scroll container, no side fill).
 */
function EventDetailPanel({
  event,
  onEdit,
  onDelete,
  className,
  variant = "panel",
}: {
  event: TrackEvent;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
  variant?: "panel" | "embedded";
}) {
  const data = useDayflowData();
  const cat = categoryById(data.categories, event.categoryId);
  const dur = eventDuration(event);
  const embedded = variant === "embedded";

  if (embedded) {
    return (
      <div aria-label="Block details">
        <DetailBody event={event} cat={cat} dur={dur} onEdit={onEdit} onDelete={onDelete} />
      </div>
    );
  }

  return (
    <aside
      className={`df-scroll overflow-y-auto px-4 py-4 ${className ?? ""}`}
      aria-label="Block details"
      style={{
        background: "var(--df-right-panel-fill)",
        borderLeft: "0.5px solid var(--df-right-panel-border)",
      }}
    >
      <DetailBody event={event} cat={cat} dur={dur} onEdit={onEdit} onDelete={onDelete} />
    </aside>
  );
}

function DetailBody({
  event,
  cat,
  dur,
  onEdit,
  onDelete,
}: {
  event: TrackEvent;
  cat: { name: string; colorHex: string };
  dur: number;
  onEdit: () => void;
  onDelete: () => void;
}) {

  return (
    <div>
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
          className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold tabular-nums"
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
          className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold tabular-nums"
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
          className="df-press h-9 px-3.5 rounded-full text-[12px] font-semibold flex items-center gap-1.5"
          style={{
            background: "color-mix(in srgb, var(--df-destructive) 12%, transparent)",
            border: "0.5px solid color-mix(in srgb, var(--df-destructive) 35%, transparent)",
            color: "var(--df-destructive-text)",
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
  // Placeholders stay in the grid (2026-09 fix: they used to be
  // filtered out, so the 1st always landed in column 1 and every
  // month's weekday alignment was wrong).
  const cells: { offset: number; dayNum: number; placeholder: boolean }[] = [];
  for (let i = 0; i < startDow; i++) cells.push({ offset: 99, dayNum: 0, placeholder: true });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ offset: d - today, dayNum: d, placeholder: false });
  }
  return cells;
}
