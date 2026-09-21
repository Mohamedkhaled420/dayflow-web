"use client";

// ============================================================
// Dayflow AI — Coach Notes sheet (journal/coach surface)
// ------------------------------------------------------------
// The actionable tail of coach replies (NOTE lines) and the logs
// the coach offered to record (LOG lines) live HERE, not in the
// chat flow — the conversation stays conversational while the
// "do this / log this" part becomes a durable, one-tap surface:
//
//   note text      → the coach's concrete next step
//   action chips   → one-tap writes through the REAL stores
//                    (water / workout / sleep / journal)
//   dismiss        → done with it, removed on this device
//
// Coach proposes, the user disposes — actions only write after
// an explicit tap (same pattern as the HabitsView workout
// generator's "Log Workout"). Notes persist on-device only
// (localStorage, capped), matching the coach-turns privacy
// model: nothing about the coach chat ever hits a server table.
//
// Layout: bottom sheet on mobile, right rail on ≥sm. Rendered
// inside the ChatView container so it stays within the app
// window frame. a11y: role="dialog", Escape closes, scrim click
// closes, every control is a named button.
// ============================================================

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpen,
  Check,
  Droplets,
  Moon,
  StickyNote,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { triggerHaptic, hapticSelect } from "@/lib/haptics";
import { useDockHideRequest } from "@/hooks/use-dock-visibility";
import type { CoachLogAction } from "@/lib/coach-protocol";
import { coachActionLabel } from "@/lib/coach-protocol";

export interface CoachNote {
  id: number;
  /** The actionable statement (NOTE line). */
  text: string;
  mode: "journal" | "workout";
  createdAt: string;
  /** LOG lines the coach offered alongside the note. */
  actions: CoachLogAction[];
  /** Indexes into `actions` the user already logged. */
  appliedIdx: number[];
}

const ACTION_META: Record<
  CoachLogAction["kind"],
  { icon: typeof Droplets; verb: string }
> = {
  water: { icon: Droplets, verb: "Log" },
  workout: { icon: Zap, verb: "Log" },
  sleep: { icon: Moon, verb: "Log" },
  journal: { icon: BookOpen, verb: "Save" },
};

export function CoachNotesSheet({
  open,
  onClose,
  notes,
  onApply,
  onDismiss,
  onClearAll,
  applyingIdx,
}: {
  open: boolean;
  onClose: () => void;
  notes: CoachNote[];
  onApply: (note: CoachNote, idx: number) => void;
  onDismiss: (note: CoachNote) => void;
  onClearAll: () => void;
  /** "noteId:idx" of the action currently being written. */
  applyingIdx: string | null;
}) {
  // Overlay owns the bottom band while open (dock-avoidance Rule B).
  useDockHideRequest("overlay:coach-notes", open);
  // Escape closes (dialog semantics without a portal library).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  // Move focus to the heading when the sheet opens — keyboard and
  // screen-reader users land somewhere meaningful inside the dialog.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* scrim — click closes (viewport-anchored so an
              auto-scrolled overflow ancestor can never offset it) */}
          <motion.button
            type="button"
            aria-label="Close Coach Notes"
            className="fixed inset-0 z-[55] cursor-default"
            style={{ background: "color-mix(in srgb, var(--df-text-primary) 24%, transparent)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Coach Notes"
            className="df-notes-sheet fixed z-[60] flex min-h-0 flex-col overflow-hidden inset-x-0 bottom-0 max-h-[72%] rounded-t-2xl sm:inset-x-auto sm:inset-y-4 sm:right-4 sm:w-[380px] sm:max-h-none sm:rounded-2xl"
            style={{
              background: "var(--df-card-fill)",
              border: "0.5px solid var(--df-card-border)",
              boxShadow: "0 12px 32px var(--df-panel-shadow)",
            }}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* header */}
            <div
              className="flex shrink-0 items-center gap-2 px-4 py-3"
              style={{ borderBottom: "0.5px solid var(--df-card-border)" }}
            >
              <StickyNote
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--df-accent)" }}
                aria-hidden="true"
              />
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="min-w-0 flex-1 text-[13px] font-semibold outline-none"
                style={{ color: "var(--df-text-primary)" }}
              >
                Coach Notes
                <span
                  className="ml-1.5 text-[10.5px] font-medium tabular-nums"
                  style={{ color: "var(--df-text-muted)" }}
                >
                  {notes.length > 0 ? `· ${notes.length}` : ""}
                </span>
              </h2>
              {notes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    hapticSelect();
                    onClearAll();
                  }}
                  aria-label="Clear all Coach Notes"
                  className="df-press flex h-7 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-semibold"
                  style={{ color: "var(--df-text-muted)" }}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Coach Notes"
                className="df-press grid h-7 w-7 shrink-0 place-items-center rounded-full"
                style={{ color: "var(--df-text-secondary)" }}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {/* list */}
            <div className="df-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {notes.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <p
                    className="text-[12.5px] font-semibold"
                    style={{ color: "var(--df-text-primary)" }}
                  >
                    No notes yet
                  </p>
                  <p
                    className="mt-1.5 text-[11.5px] leading-relaxed"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
                    When the coach ends a reply with a concrete next step — or offers to log
                    water, a workout, sleep, or a journal line — it lands here instead of
                    drowning in the chat.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5" aria-label="Coach notes">
                  {notes.map((note) => (
                    <li
                      key={note.id}
                      className="rounded-[12px] px-3 py-2.5"
                      style={{
                        background: "var(--df-chat-soft-fill)",
                        border: "0.5px solid var(--df-chat-soft-border)",
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <p
                          className="min-w-0 flex-1 text-[12.5px] leading-[1.5]"
                          style={{ color: "var(--df-text-primary)" }}
                        >
                          {note.text}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            hapticSelect();
                            onDismiss(note);
                          }}
                          aria-label="Dismiss this note"
                          className="df-press grid h-6 w-6 shrink-0 place-items-center rounded-full"
                          style={{ color: "var(--df-text-muted)" }}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>

                      {note.actions.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {note.actions.map((action, idx) => {
                            const applied = note.appliedIdx.includes(idx);
                            const busy = applyingIdx === `${note.id}:${idx}`;
                            const meta = ACTION_META[action.kind];
                            const Icon = meta.icon;
                            return (
                              <li key={idx}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (applied || busy) return;
                                    triggerHaptic();
                                    onApply(note, idx);
                                  }}
                                  disabled={applied || busy}
                                  aria-label={`${applied ? "Logged" : "Log"} ${coachActionLabel(action)}`}
                                  className="df-press flex w-full items-center gap-2 rounded-[14px] px-2.5 py-2 text-left text-[11.5px] font-medium disabled:cursor-default"
                                  style={{
                                    background: applied
                                      ? "color-mix(in srgb, var(--df-sync-ok) 14%, transparent)"
                                      : "var(--df-card-fill)",
                                    border: applied
                                      ? "0.5px solid color-mix(in srgb, var(--df-sync-ok) 45%, transparent)"
                                      : "0.5px solid var(--df-chip-border)",
                                    color: "var(--df-text-primary)",
                                  }}
                                >
                                  <Icon
                                    className="h-3.5 w-3.5 shrink-0"
                                    style={{
                                      color: applied ? "var(--df-sync-ok)" : "var(--df-accent)",
                                    }}
                                    aria-hidden="true"
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {coachActionLabel(action)}
                                  </span>
                                  {applied ? (
                                    <span
                                      className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wide"
                                      style={{ color: "var(--df-sync-ok)" }}
                                    >
                                      <Check className="h-3 w-3" aria-hidden="true" />
                                      Logged
                                    </span>
                                  ) : (
                                    <span
                                      className="shrink-0 rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-wide"
                                      style={{
                                        background: "color-mix(in srgb, var(--df-accent) 16%, transparent)",
                                        color: "var(--df-accent-text)",
                                      }}
                                    >
                                      {busy ? "Saving…" : meta.verb}
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <p
                        className="mt-1.5 text-[9.5px] font-medium uppercase tracking-wide"
                        style={{ color: "var(--df-text-muted)" }}
                      >
                        {note.mode === "journal" ? "Journal coach" : "Training coach"} ·{" "}
                        {new Date(note.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* footer — privacy line */}
            <div
              className="shrink-0 px-4 pb-[calc(0.6rem+max(0px,var(--keyboard-height,0px)))] pt-2 text-center text-[9.5px]"
              style={{ color: "var(--df-text-muted)", borderTop: "0.5px solid var(--df-card-border)" }}
            >
              Notes stay on this device. Actions only log when you tap them.
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
