"use client";

// EventDialog — add / edit / delete a tracked block (workout, work
// session, meal, sleep…). Replaces the native app's automatic capture:
// on the web you log blocks by hand, which also makes them yours.
//
// The form state lives in a keyed inner component so opening the
// dialog for create/edit remounts it with fresh values — no
// setState-in-effect syncing.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/components/dayflow/category-icons";
import { useDayflow } from "@/lib/store";
import { keyForOffset } from "@/lib/seed";
import { toMinutes, eventDuration } from "@/lib/compute";
import { useToast } from "@/hooks/use-toast";
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
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(3px)" }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={event ? "Edit tracked block" : "Log a block"}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[420px] rounded-xl p-5"
            style={{
              background: "var(--df-daily-grid-fill)",
              border: "0.5px solid var(--df-daily-grid-border)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.22)",
              backdropFilter: "blur(20px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <EventForm
              key={event?.id ?? "create"}
              event={event ?? null}
              dateKey={dateKey}
              onClose={onClose}
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
}: {
  event: TrackEvent | null;
  dateKey?: string;
  onClose: () => void;
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
    onClose();
  };

  const remove = () => {
    if (!event) return;
    deleteEvent(event.id);
    toast({ title: "Block deleted", description: event.title });
    onClose();
  };

  return (
    <>
      <h2 className="text-[16px] font-bold tracking-tight" style={{ color: "var(--df-text-primary)" }}>
        {event ? "Edit block" : "Log a block"}
      </h2>
      <p className="text-[11.5px] mt-0.5" style={{ color: "var(--df-text-muted)" }}>
        {event ? "Update the details of this entry." : "What did you spend time on?"}
      </p>

      {/* category chips */}
      <div className="mt-4">
        <label
          className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Category
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {timeCategories.map((c) => {
            const active = c.id === categoryId;
            return (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className="df-press rounded-full h-8 pl-2.5 pr-3 flex items-center gap-1.5 text-[12px] font-semibold"
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
          className="mt-1.5 rounded-md px-3 h-10 flex items-center"
          style={{
            background: "var(--df-input-fill)",
            border: "0.5px solid var(--df-input-border)",
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={PLACEHOLDERS[categoryId] ?? "What did you do?"}
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
            { label: "Start", value: start, set: setStart },
            { label: "End", value: end, set: setEnd },
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
              className="mt-1.5 rounded-md px-2.5 h-10 flex items-center gap-2"
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
        {duration > 0 && (
          <>
            {duration >= 60
              ? `${Math.floor(duration / 60)}h ${duration % 60 ? `${duration % 60}m` : ""}`
              : `${duration}m`}
            {overnight && " · crosses midnight (e.g. sleep)"}
          </>
        )}
        {duration <= 0 && "End must be after start (or before it for overnight sleep)"}
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
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
        {event && (
          <button
            onClick={remove}
            className="df-press h-10 px-3 rounded-md flex items-center gap-1.5 text-[12px] font-semibold"
            style={{
              background: "color-mix(in srgb, #FF5950 12%, transparent)",
              border: "0.5px solid color-mix(in srgb, #FF5950 35%, transparent)",
              color: "#E55A3E",
            }}
            aria-label="Delete block"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="df-press df-btn-secondary h-10 px-4 text-[12.5px] font-semibold">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!valid}
          className="df-press df-btn-primary h-10 px-4 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          {event ? "Save changes" : "Log block"}
        </button>
      </div>
    </>
  );
}
