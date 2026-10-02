"use client";

// EventDialog — add / edit / delete a tracked block (workout, work
// session, meal, sleep…). Replaces the native app's automatic capture:
// on the web you log blocks by hand, which also makes them yours.
//
// Phase 12b — the "Log a block — Apple-style redesign" reference,
// matched 1:1: aurora-backed glass sheet, expanding category pills
// that tint the whole form, spotlight fields, the big duration with
// round steppers, a draggable 24-hour track, Start/End buttons that
// open an iOS wheel picker, a sliding-thumb quick control + Now,
// recent-block pills and the gradient CTA that draws its checkmark.
//
// Apple-design behaviors kept from before:
// - Phone: bottom sheet with a grab handle — drag it down to dismiss
//   (1:1 tracking, release-velocity handoff, rubber-band at the top).
// - Desktop: centered material that "materializes" — spring scale+fade.
// - Escape closes the wheel first, then the sheet; body scroll locks.
//
// The form state lives in a keyed inner component so opening the
// dialog for create/edit remounts it with fresh values — no
// setState-in-effect syncing.

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "motion/react";
import {
  Activity,
  Briefcase,
  Coffee,
  Moon,
  Sparkles,
  User,
  Utensils,
  X,
} from "lucide-react";
import { LOGGABLE_CATEGORIES, localDateTime } from "@/lib/viewmodel";
import { useDayflowStore } from "@/store/useDayflowStore";
import { keyForOffset } from "@/lib/seed";
import { toMinutes, eventDuration } from "@/lib/compute";
import {
  Aurora,
  CategoryStrip,
  CountedField,
  DayTrack,
  DurationRow,
  FormActions,
  NumField,
  QuickDuration,
  SpotField,
  TimePair,
  TrackTicks,
  WheelPicker,
  fmtDur,
  minutesToHM,
  nowMinutes,
  type FormCategory,
} from "@/components/dayflow/FormControls";
import { useToast } from "@/hooks/use-toast";
import { useIsPhone } from "@/hooks/use-media-query";
import { hapticSuccess, hapticWarn, haptic } from "@/lib/haptics";
import { useKeyboardTracking } from "@/components/ui/Sheet";
import { useDockHideRequest } from "@/hooks/use-dock-visibility";
import { springSheet } from "@/lib/motion";
import type { Category, TrackEvent } from "@/lib/types";

/** Category-specific title suggestions — the reference's placeholders. */
const PLACEHOLDERS: Record<string, string> = {
  work: "Deep work — sprint planning",
  personal: "Inbox zero and errands",
  fitness: "Zone 2 run",
  meals: "Slow breakfast",
  sleep: "Night sleep",
  leisure: "Reading on the balcony",
};

/** "Something else…" pseudo-category (0011 "log anything"): selecting
 *  the chip reveals a freeform input whose value is slugified into a
 *  custom activity_logs category ("Biology revision" -> "biology-revision").
 *  Rendering resolves the slug through categoryById's pastel fallback. */
const CUSTOM_ID = "__custom";

const slugifyCategory = (s: string): string => {
  const slug = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "custom";
};

/** Reverse of slugify for prefilling the edit form — "biology-revision"
 *  -> "Biology Revision". */
const prettifyCategory = (slug: string): string =>
  slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();

/** Strip icons (the reference's glyph set, via lucide). */
const STRIP_ICONS: Record<string, React.ReactNode> = {
  work: <Briefcase />,
  personal: <User />,
  fitness: <Activity />,
  meals: <Utensils />,
  sleep: <Moon />,
  leisure: <Coffee />,
};

/** Short labels for the strip — "Personal work" is too long to expand. */
const SHORT_LABELS: Record<string, string> = {
  personal: "Personal",
};

/** Phase 12 — smart defaults per category when CREATING a block:
 *  sleep wants tonight 23:00 × 8h, meals are ~45 min, workouts an
 *  hour. Applied only on chip switch in create mode — never on edit,
 *  so a prefill is never clobbered. */
const CATEGORY_DEFAULTS: Record<string, { start?: number; dur: number }> = {
  sleep: { start: 23 * 60, dur: 480 },
  meals: { dur: 45 },
  fitness: { dur: 60 },
};

/** Recent blocks — the reference's pill row (localStorage, max 4). */
const RECENTS_KEY = "dayflow:recent-blocks";
interface RecentBlock {
  cat: string;
  title: string;
  dur: number;
}
const loadRecents = (): RecentBlock[] => {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentBlock[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
};

const DAY = 24 * 60;

interface Props {
  open: boolean;
  onClose: () => void;
  /** when present the dialog edits this event instead of creating one */
  event?: TrackEvent | null;
  dateKey?: string;
}

export function EventDialog({ open, onClose, event, dateKey }: Props) {
  const isPhone = useIsPhone();
  const reducedMotion = useReducedMotion();
  const dragControls = useDragControls();
  // Overlay owns the bottom band while open (dock-avoidance Rule B):
  // the phone sheet's action row must not stack glass with the dock.
  useDockHideRequest("overlay:event-dialog", open);
  // A drag that ends above the sheet leaves a stray click on the scrim
  // (release point can sit outside the sheet). Track drags and swallow
  // that click so a rubber-banded sheet stays open.
  const didDragRef = useRef(false);

  // Lock body scroll while the sheet is open, like a native modal task.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [open]);

  // Escape dismisses (wayfinding — never trap the user). The wheel
  // picker owns its own capture-phase Escape; it closes first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Flick down (velocity) or a big drag commits the dismissal.
  const onDragEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    if (info.velocity.y > 550 || info.offset.y > 130) onClose();
    // The compatibility click fires a few ms after release — clear the
    // flag just after it so a fresh scrim tap isn't swallowed.
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 60);
  };

  const onScrimClick = () => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[60] flex justify-center p-0 sm:p-4 items-end sm:items-center"
          style={{
            background: "var(--df-scrim)",
            backdropFilter: "blur(3px)",
            transform: "translateZ(0)",
            willChange: "transform",
          }}
          onClick={onScrimClick}
          role="dialog"
          aria-modal="true"
          aria-label={event ? "Edit tracked block" : "Log a block"}
        >
          {/* the reference's aurora — drifting blobs behind the glass */}
          <Aurora />
          <motion.div
            initial={
              reducedMotion
                ? { opacity: 0 }
                : isPhone
                  ? { y: "100%", opacity: 0.6 }
                  : { opacity: 0, y: 14, scale: 0.97 }
            }
            animate={
              reducedMotion
                ? { opacity: 1 }
                : isPhone
                  ? { y: 0, opacity: 1 }
                  : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              reducedMotion
                ? { opacity: 0 }
                : isPhone
                  ? { y: "100%", opacity: 0.5 }
                  : { opacity: 0, y: 14, scale: 0.97 }
            }
            transition={reducedMotion ? { duration: 0.18 } : springSheet}
            drag={isPhone && !reducedMotion ? "y" : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.06, bottom: 0.6 }}
            dragMomentum={false}
            onDragStart={() => {
              didDragRef.current = true;
            }}
            onDragEnd={onDragEnd}
            className={isPhone ? "dff-sheet dff-phone" : "dff-sheet"}
            style={
              isPhone
                ? {
                    /* Keyboard lift: EventForm already tracks the shared
                       --keyboard-height — apply it so the sheet (and its
                       action row) rides above the software keyboard. */
                    marginBottom: "var(--keyboard-height, 0px)",
                    /* Standalone (pinned) fix: reserve the notch band at
                       the TOP too — a tall form used to cap at 100dvh and
                       put its drag handle + header under the status bar. */
                    maxHeight:
                      "calc(100dvh - var(--keyboard-height, 0px) - max(var(--safe-area-top, 0px), 8px))",
                    transition:
                      "margin-bottom 220ms cubic-bezier(0.32, 0.72, 0, 1)",
                  }
                : undefined
            }
            onClick={(e) => e.stopPropagation()}
          >
            <EventForm
              key={event?.id ?? "create"}
              event={event ?? null}
              dateKey={dateKey}
              onClose={onClose}
              isPhone={isPhone}
              onDragStart={(e) => {
                // cancel the pointerdown's compatibility click — the drag
                // itself decides what happens on release
                e.preventDefault();
                dragControls.start(e);
              }}
              draggable={!reducedMotion && isPhone}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EventForm({
  event,
  dateKey,
  onClose,
  isPhone,
  onDragStart,
  draggable,
}: {
  event: TrackEvent | null;
  dateKey?: string;
  onClose: () => void;
  isPhone: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  draggable: boolean;
}) {
  // Phase 5 T0 + 0011 "log anything": the dialog is the server-backed
  // logger. Blocks map onto the log tables by category — sleep ->
  // sleep_logs, fitness -> workout_logs, EVERYTHING else (work, personal,
  // meals, leisure, freeform customs) -> activity_logs.
  const addSleepLog = useDayflowStore((s) => s.addSleepLog);
  const addWorkoutLog = useDayflowStore((s) => s.addWorkoutLog);
  const addActivityLog = useDayflowStore((s) => s.addActivityLog);
  const updateSleepLog = useDayflowStore((s) => s.updateSleepLog);
  const updateWorkoutLog = useDayflowStore((s) => s.updateWorkoutLog);
  const updateActivityLog = useDayflowStore((s) => s.updateActivityLog);
  const deleteSleepLog = useDayflowStore((s) => s.deleteSleepLog);
  const deleteWorkoutLog = useDayflowStore((s) => s.deleteWorkoutLog);
  const deleteActivityLog = useDayflowStore((s) => s.deleteActivityLog);
  const { toast } = useToast();

  const timeCategories = LOGGABLE_CATEGORIES;

  // Editing a freeform custom block: its categoryId is a slug outside
  // the system set — select the custom chip and prefill its name.
  const editingKnownCat = event
    ? timeCategories.some((c) => c.id === event.categoryId)
    : true;
  const [categoryId, setCategoryId] = useState<string>(
    event
      ? editingKnownCat
        ? event.categoryId
        : CUSTOM_ID
      : timeCategories[0]?.id ?? "sleep"
  );
  const [customCategory, setCustomCategory] = useState(
    event && !editingKnownCat ? prettifyCategory(event.categoryId) : ""
  );
  const [title, setTitle] = useState(event?.title ?? "");
  // Phase 12b: the reference's model — {start, dur}. The end is
  // always derived; minutes-of-day everywhere.
  const [startMin, setStartMin] = useState(() =>
    event ? toMinutes(event.start) : nowMinutes()
  );
  const [durationMin, setDurationMin] = useState(() =>
    event ? eventDuration(event) : 60
  );
  // Sleep -> resting heart rate; Workout -> active calories.
  const [metric, setMetric] = useState("");
  // Generic activity blocks carry an optional freeform note.
  const [notes, setNotes] = useState(
    event?.source === "activity" ? (event.notes ?? "") : ""
  );
  // The wheel picker: which side is being edited ("st" | "en" | null).
  const [wheel, setWheel] = useState<"st" | "en" | null>(null);
  // The Go button's check-draw flourish while the save settles.
  const [done, setDone] = useState(false);
  // Recent blocks (create mode affordance — the reference's pill row).
  const [recents] = useState<RecentBlock[]>(loadRecents);

  const endMin = (startMin + durationMin) % DAY;
  const overnight = startMin + durationMin > DAY;
  const start = minutesToHM(startMin);
  const end = minutesToHM(endMin);
  const todayKey = keyForOffset(0);
  const isToday = (event?.dateKey ?? dateKey ?? todayKey) === todayKey;

  /** Chip select — in create mode each category brings its own
   *  sensible when/how-long defaults (sleep = 23:00 × 8h…). */
  const selectCategory = (id: string) => {
    setCategoryId(id);
    if (!event) {
      const def = CATEGORY_DEFAULTS[id];
      if (def) {
        if (def.start != null) setStartMin(def.start);
        setDurationMin(def.dur);
      }
    }
  };

  const validCat: Category | undefined = timeCategories.find((c) => c.id === categoryId);
  const isSleep = categoryId === "sleep";
  const isFitness = categoryId === "fitness";
  const isCustom = categoryId === CUSTOM_ID;
  const duration = durationMin;
  // The dynamic accent — the selected category tints the whole sheet.
  const accent = isCustom || !validCat ? "var(--df-accent)" : validCat.colorHex;
  // The table this save will write to, from the CURRENT chip selection.
  const writeTarget: "sleep" | "workout" | "activity" = isSleep
    ? "sleep"
    : isFitness
      ? "workout"
      : "activity";
  // Editing a block whose source table differs from the selection = a
  // cross-table move: create the new row first, then drop the old one
  // (never the reverse — a failed delete may duplicate, never lose).
  const crossTableMove = !!event && event.source !== writeTarget;
  const valid =
    (isSleep || title.trim().length > 0) &&
    (!isCustom || customCategory.trim().length > 0) &&
    duration > 0 &&
    duration < DAY &&
    (metric.trim() === "" || (Number(metric) >= 0 && Number.isFinite(Number(metric))));

  // ---- strip items (system cats + "Something else") --------------
  const stripItems: FormCategory[] = [
    ...timeCategories.map((c) => ({
      id: c.id,
      label: SHORT_LABELS[c.id] ?? c.name,
      color: c.colorHex,
      icon: STRIP_ICONS[c.id] ?? <Sparkles />,
    })),
    { id: CUSTOM_ID, label: "Other", color: "var(--df-accent)", icon: <Sparkles /> },
  ];

  const recentsColor = (cat: string): string =>
    timeCategories.find((c) => c.id === cat)?.colorHex ?? "var(--df-accent)";

  const applyRecent = (r: RecentBlock) => {
    haptic(6);
    // plain sets — a recent carries its own duration, so category
    // defaults must not clobber it
    setCategoryId(r.cat);
    setDurationMin(r.dur);
    setTitle(r.title);
  };

  const pushRecent = () => {
    try {
      const ttl = title.trim();
      if (!ttl) return;
      const next = [
        { cat: categoryId === CUSTOM_ID ? "work" : categoryId, title: ttl, dur: duration },
        ...loadRecents().filter((r) => r.title !== ttl),
      ].slice(0, 4);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — recents are a nicety, never a blocker */
    }
  };

  /** Delete the row behind an edited event from ITS source table. */
  const deleteOriginal = async (ev: TrackEvent) => {
    if (ev.source === "sleep") await deleteSleepLog(ev.id);
    else if (ev.source === "activity") await deleteActivityLog(ev.id);
    else await deleteWorkoutLog(ev.id);
  };

  const save = async () => {
    if (!valid || done) return;
    const dayKey = event?.dateKey ?? dateKey ?? keyForOffset(0);
    const metricNum = metric.trim() === "" ? null : Math.round(Number(metric));
    const range = `${start}–${end}`;
    if (writeTarget === "sleep") {
      // Sleep blocks end at the wake time — logged_at IS the wake
      // timestamp, sleep_minutes is the block duration.
      const payload = {
        sleep_minutes: duration,
        resting_heart_rate: metricNum,
        logged_at: localDateTime(dayKey, end),
      };
      if (event && !crossTableMove) await updateSleepLog(event.id, payload);
      else {
        await addSleepLog(payload);
        if (event) await deleteOriginal(event);
      }
    } else if (writeTarget === "workout") {
      const payload = {
        type: title.trim(),
        duration_minutes: duration,
        active_calories: metricNum,
        logged_at: localDateTime(dayKey, start),
      };
      if (event && !crossTableMove) await updateWorkoutLog(event.id, payload);
      else {
        await addWorkoutLog(payload);
        if (event) await deleteOriginal(event);
      }
    } else {
      // Generic block: category (system id or slugified custom name),
      // title, duration and an optional note ride activity_logs.
      const payload = {
        category: isCustom ? slugifyCategory(customCategory) : categoryId,
        title: title.trim(),
        duration_minutes: duration,
        notes: notes.trim() || null,
        logged_at: localDateTime(dayKey, start),
      };
      if (event && !crossTableMove) await updateActivityLog(event.id, payload);
      else {
        await addActivityLog(payload);
        if (event) await deleteOriginal(event);
      }
    }
    if (!event) pushRecent();
    hapticSuccess();
    // the reference's flourish: the check draws itself, then we go.
    // Close FIRST — a toast hiccup must never trap the sheet open.
    setDone(true);
    window.setTimeout(() => {
      onClose();
      if (writeTarget === "sleep") {
        toast({
          title: event ? "Sleep updated" : "Sleep logged",
          description: `${range} · ${fmtDur(duration)}`,
        });
      } else if (writeTarget === "workout") {
        toast({ title: event ? "Workout updated" : "Workout logged", description: `${title.trim() || "Workout"} · ${range}` });
      } else {
        toast({
          title: event ? "Block updated" : "Block logged",
          description: `${title.trim()} · ${range}`,
        });
      }
    }, 700);
  };

  const remove = async () => {
    if (!event) return;
    if (event.source === "sleep") await deleteSleepLog(event.id);
    else if (event.source === "activity") await deleteActivityLog(event.id);
    else await deleteWorkoutLog(event.id);
    toast({ title: "Block deleted", description: event.title });
    hapticWarn();
    onClose();
  };

  // T2b: keep the phone sheet above the software keyboard.
  useKeyboardTracking();

  // ---- wheel commits (the reference's exact math) ----------------
  const onWheelChange = (m: number) => {
    if (wheel === "st") {
      // keep the END fixed — the duration stretches to meet it
      const newDur = ((endMin - m + DAY) % DAY) || durationMin;
      setStartMin(m);
      setDurationMin(newDur);
    } else if (wheel === "en") {
      setDurationMin(((m - startMin + DAY) % DAY) || 15);
    }
  };

  const onNow = () => {
    // pin the END to the current clock — the start slides back
    const n = nowMinutes();
    setStartMin((n - durationMin + DAY) % DAY);
  };

  return (
    <div
      className={`contents${wheel ? " dff-locked" : ""}`}
      style={{ "--dff-c": accent } as React.CSSProperties}
    >
      <header
        className="dff-head"
        onPointerDown={draggable ? onDragStart : undefined}
        style={draggable ? { touchAction: "none" } : undefined}
      >
        <div className="dff-grab" aria-hidden="true" />
        <div>
          <h1 className="dff-title">{event ? "Edit block" : "Log a block"}</h1>
          <div className="dff-sub">
            {event ? "Update the details of this entry." : "What did you spend time on?"}
          </div>
        </div>
        <button
          type="button"
          className="dff-x"
          aria-label="Close"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </header>

      <div className="dff-body">
        <CategoryStrip
          items={stripItems}
          value={categoryId}
          onChange={selectCategory}
        />

        {/* the answer — the header already asked the question; the
            placeholder suggests one per category (the reference). */}
        <SpotField
          value={title}
          onChange={setTitle}
          placeholder={isCustom ? "What was it?" : (PLACEHOLDERS[categoryId] ?? "What did you do?")}
          ariaLabel="Title"
          maxLength={60}
          enterBlur
        />

        {/* custom category name — revealed by "Something else…" */}
        {isCustom && (
          <div className="mt-3">
            <SpotField
              value={customCategory}
              onChange={setCustomCategory}
              placeholder="e.g. Study, Gaming, Errands"
              ariaLabel="Custom category name"
              maxLength={24}
              autoFocus
            />
          </div>
        )}

        {/* recent blocks — one tap re-primes the form */}
        {!event && recents.length > 0 && (
          <div className="dff-recent" aria-label="Recent blocks">
            {recents.map((r, i) => (
              <button
                key={`${r.title}-${i}`}
                type="button"
                style={{ "--dff-rc": recentsColor(r.cat) } as React.CSSProperties}
                onClick={() => applyRecent(r)}
              >
                <i aria-hidden="true" />
                {r.title} · {fmtDur(r.dur)}
              </button>
            ))}
          </div>
        )}

        {/* the when card — hero duration, 24-hour track, wheels */}
        <section className="dff-when" aria-label="Time">
          <DurationRow value={durationMin} onChange={setDurationMin} />
          <div className="dff-note-line" aria-live="polite">
            {overnight ? (
              <>
                <b>Crosses midnight</b> · ends tomorrow
              </>
            ) : (
              ""
            )}
          </div>
          <DayTrack
            startMin={startMin}
            durationMin={durationMin}
            mode="block"
            onChange={setStartMin}
          />
          <TrackTicks />
          <TimePair
            startMin={startMin}
            endMin={endMin}
            endBadge={overnight ? "Tomorrow" : undefined}
            onPickStart={() => setWheel("st")}
            onPickEnd={() => setWheel("en")}
            active={wheel === "st" ? "start" : wheel === "en" ? "end" : null}
          />
          <QuickDuration value={durationMin} onChange={setDurationMin} onNow={onNow} />
        </section>

        {/* metric — resting HR for sleep, active calories for workouts. */}
        {(isSleep || isFitness) && (
          <div className="mt-3">
            <NumField
              value={metric}
              onChange={setMetric}
              unit={isSleep ? "bpm" : "kcal"}
              placeholder={isSleep ? "58" : "320"}
              ariaLabel={isSleep ? "Resting heart rate in bpm" : "Active calories in kcal"}
              maxLen={4}
            />
          </div>
        )}

        {/* note with the live counter — blocks that can save one. */}
        {!isSleep && !isFitness && (
          <CountedField
            value={notes}
            onChange={setNotes}
            max={140}
            placeholder="Add a note (optional)"
            ariaLabel="Note"
          />
        )}
      </div>

      <FormActions
        ghostLabel={event ? "Delete" : "Cancel"}
        ghostClassName={event ? "dff-danger" : undefined}
        onGhost={event ? remove : onClose}
        goLabel={event ? "Save changes" : "Log block"}
        onGo={() => void save()}
        disabled={!valid}
        done={done}
      />

      <WheelPicker
        open={wheel !== null}
        title={wheel === "st" ? "Start time" : "End time"}
        value={wheel === "st" ? startMin : endMin}
        onChange={onWheelChange}
        onClose={() => setWheel(null)}
      />
    </div>
  );
}
