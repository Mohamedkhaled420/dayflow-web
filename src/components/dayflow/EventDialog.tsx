"use client";

// EventDialog — add / edit / delete a tracked block (workout, work
// session, meal, sleep…). Replaces the native app's automatic capture:
// on the web you log blocks by hand, which also makes them yours.
//
// Apple-design behaviors (from emilkowalski/skills apple-design):
// - Phone: bottom sheet with a grab handle — drag it down to dismiss
//   (1:1 tracking, release-velocity handoff, rubber-band at the top).
// - Desktop: centered material that "materializes" — spring scale+fade
//   from the direction it will exit (symmetric paths).
// - Escape closes; body scroll is locked while open; haptics confirm
//   commits on the same frame as the visual change.
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
import { Check, ChevronDown, Clock, Sparkles, Trash2, X } from "lucide-react";
import { CategoryIcon } from "@/components/dayflow/category-icons";
import { DoodleSparkle } from "@/components/dayflow/doodles";
import { LOGGABLE_CATEGORIES, localDateTime } from "@/lib/viewmodel";
import {
  useDayflowStore,
} from "@/store/useDayflowStore";
import { keyForOffset } from "@/lib/seed";
import { toMinutes, eventDuration } from "@/lib/compute";
import { useToast } from "@/hooks/use-toast";
import { useIsPhone } from "@/hooks/use-media-query";
import { hapticSuccess, hapticWarn, triggerHaptic } from "@/lib/haptics";
import { useKeyboardTracking } from "@/components/ui/Sheet";
import { useDockHideRequest } from "@/hooks/use-dock-visibility";
import { springSheet, springSoft } from "@/lib/motion";
import type { Category, TrackEvent } from "@/lib/types";

const PLACEHOLDERS: Record<string, string> = {
  work: "Deep work — sprint planning",
  personal: "Side project — portfolio site",
  fitness: "Gym — upper body push",
  meals: "Lunch with the team",
  sleep: "Sleep",
  leisure: "Reading, a walk, gaming…",
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

const pad = (n: number) => String(n).padStart(2, "0");

const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Phase 11 — the reference add-schedule time grid: on-the-hour
 *  start pills, 06:00 → 22:00. */
const QUICK_START_TIMES: string[] = Array.from({ length: 17 }, (_, i) =>
  `${pad(6 + i)}:00`
);

/** "HH:MM" + minutes → "HH:MM", wrapping past midnight. */
const addMinutes = (hm: string, minutes: number): string => {
  const total =
    (Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + minutes) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

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

  // Escape dismisses (wayfinding — never trap the user).
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
            className={
              isPhone
                ? "w-full rounded-t-[24px] overflow-hidden df-material"
                : "w-full max-w-[420px] rounded-2xl p-5 df-material"
            }
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

  const initialStart = event?.start ?? nowHM();
  const startM = toMinutes(initialStart);
  const endM = (startM + 60) % (24 * 60);

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
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(
    event?.end ?? `${pad(Math.floor(endM / 60))}:${pad(endM % 60)}`
  );
  // Sleep -> resting heart rate; Workout -> active calories.
  // (The old free-text notes had no server column — PRD §2 tables —
  // until activity_logs gave generic blocks one, 0011.)
  const [metric, setMetric] = useState("");
  // Generic activity blocks carry an optional freeform note.
  const [notes, setNotes] = useState(
    event?.source === "activity" ? (event.notes ?? "") : ""
  );
  // Phone: the 17-pill "Start at…" grid starts COLLAPSED — with every
  // category now loggable the sheet grew past one screen on 390px,
  // pushing the note + Log button under the fold.
  const [timesOpen, setTimesOpen] = useState(false);

  const validCat: Category | undefined = timeCategories.find((c) => c.id === categoryId);
  const isSleep = categoryId === "sleep";
  const isFitness = categoryId === "fitness";
  const isCustom = categoryId === CUSTOM_ID;
  const overnight = end !== start && toMinutes(end) <= toMinutes(start);
  const duration = start && end ? eventDuration({ start, end } as TrackEvent) : 0;
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
    duration < 24 * 60 &&
    (metric.trim() === "" || (Number(metric) >= 0 && Number.isFinite(Number(metric))));

  /** Delete the row behind an edited event from ITS source table. */
  const deleteOriginal = async (ev: TrackEvent) => {
    if (ev.source === "sleep") await deleteSleepLog(ev.id);
    else if (ev.source === "activity") await deleteActivityLog(ev.id);
    else await deleteWorkoutLog(ev.id);
  };

  const save = async () => {
    if (!valid) return;
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
      toast({
        title: event ? "Sleep updated" : "Sleep logged",
        description: `${range} · ${Math.floor(duration / 60)}h ${duration % 60 ? `${duration % 60}m` : ""}`,
      });
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
      toast({ title: event ? "Workout updated" : "Workout logged", description: `${title.trim()} · ${range}` });
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
      toast({
        title: event ? "Block updated" : "Block logged",
        description: `${title.trim()} · ${range}`,
      });
    }
    triggerHaptic();
    onClose();
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

  if (!isPhone) {
    return (
      <>
        <FormHeader event={event} onClose={onClose} />
        <FormBody
          event={event}
          timeCategories={timeCategories}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          title={title}
          setTitle={setTitle}
          start={start}
          setStart={setStart}
          end={end}
          setEnd={setEnd}
          metric={metric}
          setMetric={setMetric}
          notes={notes}
          setNotes={setNotes}
          isSleep={isSleep}
          isFitness={isFitness}
          isCustom={isCustom}
          customCategory={customCategory}
          setCustomCategory={setCustomCategory}
          titleLabel={
            isFitness ? "Workout" : isCustom ? "Activity" : validCat?.name ?? "Activity"
          }
          duration={duration}
          overnight={overnight}
          valid={valid}
          save={save}
          remove={remove}
          onClose={onClose}
          compactTimes={isPhone}
          timesOpen={timesOpen}
          setTimesOpen={setTimesOpen}
        />
      </>
    );
  }

  // Phone: bottom sheet — the header zone is the drag handle; the body
  // scrolls if it grows past the sheet.
  return (
    <div className="flex max-h-[calc(88dvh-var(--keyboard-height,0px))] flex-col">
      <div
        className="shrink-0 pt-2.5 pb-1 px-5"
        onPointerDown={draggable ? onDragStart : undefined}
        style={draggable ? { touchAction: "none" } : undefined}
      >
        <div className="mx-auto mb-2.5 h-[5px] w-9 rounded-full" style={{ background: "var(--df-chip-border)" }} />
        <FormHeader event={event} onClose={onClose} />
      </div>
      <div className="df-scroll overflow-y-auto px-5 pb-[max(18px,var(--safe-area-bottom,0px))]">
        <FormBody
          event={event}
          timeCategories={timeCategories}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          title={title}
          setTitle={setTitle}
          start={start}
          setStart={setStart}
          end={end}
          setEnd={setEnd}
          metric={metric}
          setMetric={setMetric}
          notes={notes}
          setNotes={setNotes}
          isSleep={isSleep}
          isFitness={isFitness}
          isCustom={isCustom}
          customCategory={customCategory}
          setCustomCategory={setCustomCategory}
          titleLabel={
            isFitness ? "Workout" : isCustom ? "Activity" : validCat?.name ?? "Activity"
          }
          duration={duration}
          overnight={overnight}
          valid={valid}
          save={save}
          remove={remove}
          onClose={onClose}
          compactTimes={isPhone}
          timesOpen={timesOpen}
          setTimesOpen={setTimesOpen}
        />
      </div>
    </div>
  );
}

function FormHeader({ event, onClose }: { event: TrackEvent | null; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[16px] font-bold tracking-tight" style={{ color: "var(--df-text-primary)" }}>
          <DoodleSparkle className="mr-1.5 inline-block h-4 w-4 -rotate-6 align-baseline" />
          {event ? "Edit block" : "Log a block"}
        </h2>
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--df-text-muted)" }}>
          {event ? "Update the details of this entry." : "What did you spend time on?"}
        </p>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="df-press shrink-0 -mt-0.5 h-8 w-8 rounded-full grid place-items-center"
        style={{
          background: "var(--df-chip-fill)",
          border: "0.5px solid var(--df-chip-border)",
          color: "var(--df-text-secondary)",
        }}
      >
        <X className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}

interface FormBodyProps {
  event: TrackEvent | null;
  timeCategories: Category[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
  /** Resting HR (sleep) or active calories (workout). */
  metric: string;
  setMetric: (v: string) => void;
  /** Optional freeform note — generic activity blocks only. */
  notes: string;
  setNotes: (v: string) => void;
  isSleep: boolean;
  isFitness: boolean;
  isCustom: boolean;
  customCategory: string;
  setCustomCategory: (v: string) => void;
  /** Title field label — "Workout", "Meals", "Activity"… follows the chip. */
  titleLabel: string;
  duration: number;
  overnight: boolean;
  valid: boolean;
  save: () => void;
  remove: () => void;
  onClose: () => void;
  /** Phone: collapse the quick-start grid behind a toggle. */
  compactTimes: boolean;
  timesOpen: boolean;
  setTimesOpen: (v: boolean) => void;
}

function FormBody(p: FormBodyProps) {
  return (
    <>
      {/* category chips — every TIME category is loggable (0011),
          plus the freeform "Something else…" chip. */}
      <div className="mt-4">
        <label
          className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Category
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {p.timeCategories.map((c) => {
            const active = c.id === p.categoryId;
            return (
              <button
                key={c.id}
                onClick={() => p.setCategoryId(c.id)}
                className="df-press df-glass-chip rounded-full h-9 pl-2.5 pr-3 flex items-center gap-1.5 text-[12px] font-semibold"
                style={{
                  background: active
                    ? `color-mix(in srgb, ${c.colorHex} 22%, transparent)`
                    : "var(--df-chip-fill)",
                  border: active
                    ? `1.5px solid color-mix(in srgb, ${c.colorHex} 65%, transparent)`
                    : "0.5px solid var(--df-chip-border)",
                  color: "var(--df-text-primary)",
                }}
                aria-pressed={active}
              >
                <CategoryIcon name={c.icon} className="h-3.5 w-3.5" style={{ color: c.colorHex }} />
                {c.name}
              </button>
            );
          })}
          <button
            onClick={() => p.setCategoryId(CUSTOM_ID)}
            className="df-press df-glass-chip rounded-full h-9 pl-2.5 pr-3 flex items-center gap-1.5 text-[12px] font-semibold"
            style={{
              background: p.isCustom
                ? "color-mix(in srgb, var(--df-accent) 20%, transparent)"
                : "var(--df-chip-fill)",
              border: p.isCustom
                ? "1.5px solid color-mix(in srgb, var(--df-accent) 60%, transparent)"
                : "0.5px solid var(--df-chip-border)",
              color: "var(--df-text-primary)",
            }}
            aria-pressed={p.isCustom}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--df-accent)" }} />
            Something else…
          </button>
        </div>
      </div>

      {/* custom category name — revealed by the "Something else…" chip */}
      {p.isCustom && (
        <div className="mt-3.5">
          <label
            className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
            style={{ color: "var(--df-text-secondary)" }}
          >
            Category name
          </label>
          <div className="df-input-glass mt-1.5 rounded-full px-4 min-h-12 flex items-center">
            <input
              value={p.customCategory}
              onChange={(e) => p.setCustomCategory(e.target.value)}
              placeholder="e.g. Study, Gaming, Errands"
              aria-label="Custom category name"
              maxLength={24}
              className="w-full bg-transparent outline-none text-base placeholder:text-[var(--df-text-muted)]"
              style={{ color: "var(--df-text-primary)" }}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* title — sleep blocks are titled server-side, everyone else
          describes what they actually did */}
      {!p.isSleep && (
      <div className="mt-3.5">
        <label
          className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          {p.titleLabel}
        </label>
        <div className="df-input-glass mt-1.5 rounded-full px-4 min-h-12 flex items-center">
          <input
            value={p.title}
            onChange={(e) => p.setTitle(e.target.value)}
            placeholder={PLACEHOLDERS[p.categoryId] ?? "What did you do?"}
            aria-label={`${p.titleLabel} description`}
            className="w-full bg-transparent outline-none text-base placeholder:text-[var(--df-text-muted)]"
            style={{ color: "var(--df-text-primary)" }}
            autoFocus={!p.isCustom}
          />
        </div>
      </div>
      )}

      {/* times */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        {(
          [
            { label: "Start", value: p.start, set: p.setStart },
            { label: "End", value: p.end, set: p.setEnd },
          ] as const
        ).map((f) => (
          <div key={f.label}>
            <label
              className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
              style={{ color: "var(--df-text-secondary)" }}
            >
              {f.label}
            </label>
            <div className="df-input-glass mt-1.5 rounded-full px-4 h-11 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--df-text-muted)" }} />
              <input
                type="time"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                aria-label={`${f.label} time`}
                className="w-full bg-transparent outline-none text-base [color-scheme:light] dark:[color-scheme:dark]"
                style={{ color: "var(--df-text-primary)" }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* duration hint */}
      <div
        className="mt-2 text-[11px] flex items-center gap-1.5"
        style={{ color: "var(--df-text-muted)" }}
        aria-live="polite"
      >
        <Clock className="h-3 w-3" />
        {p.duration > 0 && (
          <>
            {p.duration >= 60
              ? `${Math.floor(p.duration / 60)}h ${p.duration % 60 ? `${p.duration % 60}m` : ""}`
              : `${p.duration}m`}
            {p.overnight && " · crosses midnight (e.g. sleep)"}
          </>
        )}
        {p.duration <= 0 && "End must be after start (or before it for overnight sleep)"}
      </div>

      {/* quick start times (Phase 11) — the reference add-schedule
          time grid: on-the-hour pills from 06:00 to 22:00. Picking
          one sets the START and keeps the current duration; the
          active pill rides the mint signature. Phones start it
          COLLAPSED (17 pills is half a screen) behind the toggle. */}
      <div className="mt-3">
        {p.compactTimes ? (
          <button
            type="button"
            onClick={() => p.setTimesOpen(!p.timesOpen)}
            aria-expanded={p.timesOpen}
            className="df-press -ml-1 flex w-full items-center justify-between px-1 py-0.5"
          >
            <span
              className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
              style={{ color: "var(--df-text-secondary)" }}
            >
              Start at…
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${p.timesOpen ? "rotate-180" : ""}`}
              style={{ color: "var(--df-text-muted)" }}
              aria-hidden="true"
            />
          </button>
        ) : (
          <label
            className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
            style={{ color: "var(--df-text-secondary)" }}
          >
            Start at…
          </label>
        )}
        {(!p.compactTimes || p.timesOpen) && (
        <div
          className="mt-1.5 grid grid-cols-4 gap-1.5"
          role="group"
          aria-label="Quick start times"
        >
          {QUICK_START_TIMES.map((t) => {
            const active = p.start === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  p.setStart(t);
                  if (p.duration > 0) {
                    // keep the block's length when the start moves
                    p.setEnd(addMinutes(t, p.duration));
                  }
                }}
                aria-pressed={active}
                className="df-press h-8 rounded-full text-[11.5px] font-bold tabular-nums"
                style={
                  active
                    ? {
                        background: "var(--df-time-pill-active)",
                        color: "var(--df-time-pill-active-ink)",
                      }
                    : {
                        background: "var(--df-time-pill-fill)",
                        border: "0.5px solid var(--df-time-pill-border)",
                        color: "var(--df-text-primary)",
                      }
                }
              >
                {t}
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* metric — resting HR for sleep, active calories for workouts.
          Generic activity blocks have no metric; they get a note. */}
      {(p.isSleep || p.isFitness) && (
      <div className="mt-3.5">
        <label
          className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          {p.isSleep ? "Resting HR" : "Active calories"}{" "}
          <span className="normal-case font-medium opacity-70">
            (optional — {p.isSleep ? "bpm" : "kcal"})
          </span>
        </label>
        <div className="df-input-glass mt-1.5 rounded-full px-4 min-h-12 flex items-center">
          <input
            value={p.metric}
            onChange={(e) => p.setMetric(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder={p.isSleep ? "58" : "320"}
            aria-label={p.isSleep ? "Resting heart rate in bpm" : "Active calories in kcal"}
            className="w-full bg-transparent outline-none text-base tabular-nums placeholder:text-[var(--df-text-muted)]"
            style={{ color: "var(--df-text-primary)" }}
          />
        </div>
      </div>
      )}

      {/* note — generic activity blocks only (activity_logs.notes) */}
      {!p.isSleep && !p.isFitness && (
        <div className="mt-3.5">
          <label
            className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
            style={{ color: "var(--df-text-secondary)" }}
          >
            Note{" "}
            <span className="normal-case font-medium opacity-70">(optional)</span>
          </label>
          <div className="df-input-glass mt-1.5 rounded-[16px] px-4 py-3">
            <textarea
              value={p.notes}
              onChange={(e) => p.setNotes(e.target.value)}
              placeholder="Anything worth remembering about it?"
              aria-label="Note"
              rows={2}
              maxLength={280}
              className="w-full bg-transparent outline-none resize-none text-[15px] leading-relaxed placeholder:text-[var(--df-text-muted)]"
              style={{ color: "var(--df-text-primary)" }}
            />
          </div>
        </div>
      )}

      {/* actions — sticky on phone so Log/Save never sit under the
          dock band; inert on desktop (no scroll ancestor). */}
      <div className="df-sheet-footer sticky bottom-0 mt-4 -mx-5 px-5 pt-2.5 pb-1 flex items-center gap-2">
        {p.event && (
          <button
            onClick={p.remove}
            className="df-press df-btn-capsule h-11 px-3 flex items-center gap-1.5 text-[12px] font-semibold"
            style={{
              background: "color-mix(in srgb, var(--df-destructive) 12%, transparent)",
              border: "0.5px solid color-mix(in srgb, var(--df-destructive) 35%, transparent)",
              color: "var(--df-destructive-text)",
            }}
            aria-label="Delete block"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button onClick={p.onClose} className="df-press df-btn-secondary df-btn-capsule h-11 px-4 text-[12.5px] font-semibold">
          Cancel
        </button>
        <button
          onClick={p.save}
          disabled={!p.valid}
          className="df-press df-btn-primary df-btn-capsule h-11 px-4 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          {p.event ? "Save changes" : "Log block"}
        </button>
      </div>
    </>
  );
}
