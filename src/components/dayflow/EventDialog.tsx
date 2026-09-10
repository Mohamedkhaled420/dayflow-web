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
} from "framer-motion";
import { Check, Clock, Trash2, X } from "lucide-react";
import { CategoryIcon } from "@/components/dayflow/category-icons";
import { useDayflow } from "@/lib/store";
import { keyForOffset } from "@/lib/seed";
import { toMinutes, eventDuration } from "@/lib/compute";
import { useToast } from "@/hooks/use-toast";
import { useIsPhone } from "@/hooks/use-media-query";
import { hapticSuccess, hapticWarn } from "@/lib/haptics";
import { springSheet, springSoft } from "@/lib/motion";
import type { Category, TrackEvent } from "@/lib/types";

const PLACEHOLDERS: Record<string, string> = {
  work: "Deep work — payments API",
  personal: "Side project — portfolio site",
  fitness: "Gym — upper body push",
  meals: "Lunch — chicken grain bowl",
  sleep: "Sleep",
  water: "Water",
  leisure: "Walk + podcast",
};

const pad = (n: number) => String(n).padStart(2, "0");

const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
          className="fixed inset-0 z-50 flex justify-center p-0 sm:p-4 items-end sm:items-center"
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
  const categories = useDayflow((s) => s.categories);
  const addEvent = useDayflow((s) => s.addEvent);
  const updateEvent = useDayflow((s) => s.updateEvent);
  const deleteEvent = useDayflow((s) => s.deleteEvent);
  const { toast } = useToast();

  const timeCategories = categories
    .filter((c) => c.kind === "time")
    .sort((a, b) => a.order - b.order);

  const initialStart = event?.start ?? nowHM();
  const startM = toMinutes(initialStart);
  const endM = (startM + 60) % (24 * 60);

  const [categoryId, setCategoryId] = useState<string>(
    event?.categoryId ?? timeCategories[0]?.id ?? "work"
  );
  const [title, setTitle] = useState(event?.title ?? "");
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(
    event?.end ?? `${pad(Math.floor(endM / 60))}:${pad(endM % 60)}`
  );
  const [notes, setNotes] = useState(event?.notes ?? "");

  const validCat: Category | undefined = categories.find((c) => c.id === categoryId);
  const overnight = end !== start && toMinutes(end) <= toMinutes(start);
  const duration = start && end ? eventDuration({ start, end } as TrackEvent) : 0;
  const valid = !!validCat && title.trim().length > 0 && duration > 0 && duration < 24 * 60;

  const save = () => {
    if (!valid || !validCat) return;
    const payload = {
      dateKey: event?.dateKey ?? dateKey ?? keyForOffset(0),
      categoryId: validCat.id,
      title: title.trim(),
      start,
      end,
      notes: notes.trim() || undefined,
    };
    if (event) {
      updateEvent(event.id, payload);
      toast({ title: "Block updated", description: `${title.trim()} · ${payload.start}–${payload.end}` });
    } else {
      addEvent(payload);
      toast({ title: "Block logged", description: `${title.trim()} · ${payload.start}–${payload.end}` });
    }
    hapticSuccess();
    onClose();
  };

  const remove = () => {
    if (!event) return;
    deleteEvent(event.id);
    toast({ title: "Block deleted", description: event.title });
    hapticWarn();
    onClose();
  };

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
          notes={notes}
          setNotes={setNotes}
          duration={duration}
          overnight={overnight}
          valid={valid}
          save={save}
          remove={remove}
          onClose={onClose}
        />
      </>
    );
  }

  // Phone: bottom sheet — the header zone is the drag handle; the body
  // scrolls if it grows past the sheet.
  return (
    <div className="flex max-h-[88dvh] flex-col">
      <div
        className="shrink-0 pt-2.5 pb-1 px-5"
        onPointerDown={draggable ? onDragStart : undefined}
        style={draggable ? { touchAction: "none" } : undefined}
      >
        <div className="mx-auto mb-2.5 h-[5px] w-9 rounded-full" style={{ background: "var(--df-chip-border)" }} />
        <FormHeader event={event} onClose={onClose} />
      </div>
      <div className="df-scroll overflow-y-auto px-5 pb-[max(18px,env(safe-area-inset-bottom))]">
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
          notes={notes}
          setNotes={setNotes}
          duration={duration}
          overnight={overnight}
          valid={valid}
          save={save}
          remove={remove}
          onClose={onClose}
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
  notes: string;
  setNotes: (v: string) => void;
  duration: number;
  overnight: boolean;
  valid: boolean;
  save: () => void;
  remove: () => void;
  onClose: () => void;
}

function FormBody(p: FormBodyProps) {
  return (
    <>
      {/* category chips */}
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
                className="df-press rounded-full h-9 pl-2.5 pr-3 flex items-center gap-1.5 text-[12px] font-semibold"
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
        </div>
      </div>

      {/* title */}
      <div className="mt-3.5">
        <label
          className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Title
        </label>
        <div
          className="mt-1.5 rounded-md px-3 h-11 flex items-center"
          style={{
            background: "var(--df-input-fill)",
            border: "0.5px solid var(--df-input-border)",
          }}
        >
          <input
            value={p.title}
            onChange={(e) => p.setTitle(e.target.value)}
            placeholder={PLACEHOLDERS[p.categoryId] ?? "What did you do?"}
            aria-label="Block title"
            className="w-full bg-transparent outline-none text-[13px] placeholder:text-[var(--df-text-muted)]"
            style={{ color: "var(--df-text-primary)" }}
            autoFocus
          />
        </div>
      </div>

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
            <div
              className="mt-1.5 rounded-md px-2.5 h-11 flex items-center gap-2"
              style={{
                background: "var(--df-input-fill)",
                border: "0.5px solid var(--df-input-border)",
              }}
            >
              <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--df-text-muted)" }} />
              <input
                type="time"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                aria-label={`${f.label} time`}
                className="w-full bg-transparent outline-none text-[13px] [color-scheme:light] dark:[color-scheme:dark]"
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

      {/* notes */}
      <div className="mt-3.5">
        <label
          className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Notes <span className="normal-case font-medium opacity-70">(optional)</span>
        </label>
        <textarea
          value={p.notes}
          onChange={(e) => p.setNotes(e.target.value)}
          rows={2}
          placeholder="Sets, pace, what you ate, how it felt…"
          aria-label="Notes"
          className="mt-1.5 w-full rounded-md px-3 py-2 bg-transparent outline-none resize-none text-[12.5px] leading-relaxed placeholder:text-[var(--df-text-muted)]"
          style={{
            color: "var(--df-text-primary)",
            background: "var(--df-input-fill)",
            border: "0.5px solid var(--df-input-border)",
          }}
        />
      </div>

      {/* actions */}
      <div className="mt-4 flex items-center gap-2">
        {p.event && (
          <button
            onClick={p.remove}
            className="df-press h-11 px-3 rounded-md flex items-center gap-1.5 text-[12px] font-semibold"
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
        <button onClick={p.onClose} className="df-press df-btn-secondary h-11 px-4 text-[12.5px] font-semibold">
          Cancel
        </button>
        <button
          onClick={p.save}
          disabled={!p.valid}
          className="df-press df-btn-primary h-11 px-4 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          {p.event ? "Save changes" : "Log block"}
        </button>
      </div>
    </>
  );
}
