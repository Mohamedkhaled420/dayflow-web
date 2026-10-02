"use client";

// FormControls — the Apple-style log-form kit (Phase 12 form redesign).
// Born from the "Log a block" reference: forms stop being grids of
// labeled inputs and become a question, a hero value, and a 24-hour
// timeline you drag. Shared by EventDialog (log a block),
// MealCaptureSheet (log a meal) and WorkoutSheet (log a workout).
//
//   TimeRail      the 24-hour scrubber — 12 AM → 12 AM tick labels,
//                 a draggable block (or a point marker for instant
//                 logs), edge handles to resize, a live "now" line.
//                 Pointer capture keeps the drag alive outside the
//                 rail; snaps to 5 minutes; keyboard slider a11y.
//   DurationHero  the big "1h" — minus/plus steppers around a large
//                 tabular value, quick chips underneath.
//   CountedNote   note field with a live "0/140" counter.
//   TimeRow       the iOS-settings row: label left, time input right.
//   NumRow        same row shape for a numeric value + unit.
//
// All colors resolve from --df-* tokens (rail tokens in theme.css)
// plus the caller's category color, which arrives as a prop from
// styles/palette — never a raw literal here.

import { useRef, useState } from "react";
import { Clock, Minus, Plus } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

const DAY = 24 * 60;
const MIN_BLOCK = 5;
const MAX_BLOCK = DAY - MIN_BLOCK;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** snap to 5-minute increments — fine enough for sleep, coarse for speed */
const snap5 = (v: number) => Math.round(v / 5) * 5;

const pad = (n: number) => String(n).padStart(2, "0");

/** minutes → "HH:MM" */
export const minutesToHM = (min: number): string =>
  `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** minutes-of-day right now */
export const nowMinutes = (): number =>
  new Date().getHours() * 60 + new Date().getMinutes();

/** minutes → "45m" / "1h" / "1h 30m" */
export const fmtDur = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

/** minutes → "9:30 AM" */
export const fmtClock = (min: number): string => {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m % 60)} ${h24 < 12 ? "AM" : "PM"}`;
};

const RAIL_LABELS = ["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"];

type DragMode = "move" | "resize-start" | "resize-end" | "point";

interface TimeRailProps {
  /** block start, minutes after midnight (0–1439) */
  startMin: number;
  /** block length in minutes — omit for a point marker (instant logs) */
  durationMin?: number;
  onChange: (startMin: number) => void;
  /** present to enable dragging the block's edges to resize it */
  onDurationChange?: (durationMin: number) => void;
  /** category color (hex from styles/palette) */
  color: string;
  /** target day is today → draw the live "now" line */
  isToday?: boolean;
  /** where "now" sits (defaults to a fresh reading) */
  nowMin?: number;
  ariaLabel?: string;
}

export function TimeRail({
  startMin,
  durationMin,
  onChange,
  onDurationChange,
  color,
  isToday,
  nowMin,
  ariaLabel = "Time of day",
}: TimeRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode | null>(null);
  /** minutes between the pointer and the block start when a move begins */
  const grabOffsetRef = useRef(0);

  const blockMode = durationMin != null && onDurationChange != null;
  const start = clamp(Math.round(startMin), 0, DAY - 1);
  const dur = blockMode ? clamp(Math.round(durationMin!), MIN_BLOCK, MAX_BLOCK) : 0;
  const end = start + dur; // linear — may run past 24 h (overnight wrap)

  /** pointer x → snapped minute-of-day */
  const xToMin = (clientX: number): number => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const frac = clamp((clientX - rect.left) / rect.width, 0, 1);
    return snap5(frac * DAY);
  };

  const applyDrag = (mode: DragMode, pointerMin: number) => {
    if (mode === "point") {
      onChange(clamp(pointerMin, 0, DAY - 1));
      return;
    }
    if (mode === "move") {
      onChange(clamp(pointerMin - grabOffsetRef.current, 0, DAY - 1));
      return;
    }
    if (mode === "resize-end") {
      onDurationChange!(clamp(pointerMin - start, MIN_BLOCK, MAX_BLOCK));
      return;
    }
    // resize-start: the END stays put, the start chases the pointer
    onDurationChange!(clamp(end - pointerMin, MIN_BLOCK, MAX_BLOCK));
    onChange(clamp(pointerMin, 0, Math.max(0, end - MIN_BLOCK)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointerMin = xToMin(e.clientX);

    let mode: DragMode;
    if (blockMode) {
      const pxPerMin = rect.width / DAY;
      const leftPx = start * pxPerMin;
      const rightPx = end > DAY ? rect.width : end * pxPerMin;
      const EDGE = 12; // px hit zone around each edge
      if (Math.abs(e.clientX - rect.left - leftPx) <= EDGE && e.clientX - rect.left < rightPx - EDGE) {
        mode = "resize-start";
      } else if (Math.abs(e.clientX - rect.left - rightPx) <= EDGE) {
        mode = "resize-end";
      } else if (e.clientX - rect.left > leftPx && e.clientX - rect.left < rightPx) {
        mode = "move";
        grabOffsetRef.current = pointerMin - start;
      } else {
        // tap outside the block → jump it here, keep dragging from there
        onChange(clamp(pointerMin, 0, DAY - 1));
        mode = "move";
        grabOffsetRef.current = 0;
      }
    } else {
      onChange(clamp(pointerMin, 0, DAY - 1));
      mode = "point";
    }
    setDrag(mode);
    blockRef.current?.focus({ preventScroll: true });
    railRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    applyDrag(drag, xToMin(e.clientX));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    if (railRef.current?.hasPointerCapture(e.pointerId)) {
      railRef.current.releasePointerCapture(e.pointerId);
    }
    setDrag(null);
    triggerHaptic();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 60 : 15;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      onChange(clamp(start - step, 0, DAY - 1));
      e.preventDefault();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      onChange(clamp(start + step, 0, DAY - 1));
      e.preventDefault();
    } else if (e.key === "Home") {
      onChange(0);
      e.preventDefault();
    } else if (e.key === "End") {
      onChange(DAY - 5);
      e.preventDefault();
    }
  };

  const pct = (min: number) => `${(clamp(min, 0, DAY) / DAY) * 100}%`;
  // main segment + wrapped tail for overnight blocks
  const mainW = Math.min(dur, DAY - start);
  const wrapW = Math.max(0, end - DAY);
  const now = nowMin ?? nowMinutes();
  const handleActive = drag === "move" || drag === "point";

  const blockStyle: React.CSSProperties = {
    background: `color-mix(in srgb, ${color} 32%, transparent)`,
    border: `1.5px solid color-mix(in srgb, ${color} 62%, transparent)`,
    boxShadow:
      handleActive
        ? `0 3px 12px color-mix(in srgb, ${color} 45%, transparent)`
        : `0 1px 4px color-mix(in srgb, ${color} 18%, transparent)`,
  };

  return (
    <div className="select-none" style={{ touchAction: "none" }}>
      {/* tick labels — 12 AM · 6 AM · 12 PM · 6 PM · 12 AM */}
      <div className="relative mb-1 h-[14px]">
        {RAIL_LABELS.map((l, i) => (
          <span
            key={i}
            className="absolute text-[9.5px] font-bold tracking-[0.04em]"
            style={{
              left: `${i * 25}%`,
              transform:
                i === 0 ? "none" : i === RAIL_LABELS.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
              color: "var(--df-text-muted)",
            }}
          >
            {l}
          </span>
        ))}
      </div>

      {/* the rail */}
      <div
        ref={railRef}
        role="group"
        aria-label={ariaLabel}
        className="relative h-10 cursor-pointer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* track */}
        <div
          className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full"
          style={{ background: "var(--df-rail-track)" }}
        />
        {/* hour ticks — taller every 6 h */}
        {Array.from({ length: 25 }, (_, i) => (
          <div
            key={i}
            className="absolute top-1/2 w-px -translate-y-1/2 -translate-x-1/2"
            style={{
              left: `${(i / 24) * 100}%`,
              height: i % 6 === 0 ? 12 : 7,
              background: i % 6 === 0 ? "var(--df-rail-tick-major)" : "var(--df-rail-tick)",
            }}
          />
        ))}

        {/* now line */}
        {isToday && (
          <div
            className="absolute top-1/2 z-20 h-[18px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: pct(now), background: "var(--df-rail-now)" }}
            aria-hidden="true"
          />
        )}

        {blockMode ? (
          <>
            {/* wrapped tail (past-midnight part of an overnight block) */}
            {wrapW > 0 && (
              <div
                className="absolute top-1/2 h-[30px] -translate-y-1/2 rounded-[10px]"
                style={{ ...blockStyle, left: 0, width: pct(wrapW), opacity: 0.55 }}
                aria-hidden="true"
              />
            )}
            {/* the block — slider semantics for the keyboard */}
            <div
              ref={blockRef}
              role="slider"
              tabIndex={0}
              aria-label="Start time"
              aria-valuemin={0}
              aria-valuemax={DAY - 1}
              aria-valuenow={start}
              aria-valuetext={fmtClock(start)}
              aria-orientation="horizontal"
              onKeyDown={onKeyDown}
              className="absolute top-1/2 h-[30px] -translate-y-1/2 cursor-grab rounded-[10px] active:cursor-grabbing"
              style={{ ...blockStyle, left: pct(start), width: pct(mainW) }}
            >
              {/* move grip */}
              <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
                <span className="flex items-center gap-[3px]">
                  <span className="h-[10px] w-[2px] rounded-full" style={{ background: `color-mix(in srgb, ${color} 70%, transparent)` }} />
                  <span className="h-[10px] w-[2px] rounded-full" style={{ background: `color-mix(in srgb, ${color} 70%, transparent)` }} />
                </span>
              </span>
              {/* edge handles (visual affordance — hit-testing lives on the rail) */}
              {dur >= 30 && (
                <>
                  <span
                    className="absolute inset-y-0 left-0 w-3 cursor-ew-resize"
                    aria-hidden="true"
                  >
                    <span className="absolute left-[3px] top-1/2 h-[12px] w-[2px] -translate-y-1/2 rounded-full" style={{ background: `color-mix(in srgb, ${color} 80%, transparent)` }} />
                  </span>
                  <span
                    className="absolute inset-y-0 right-0 w-3 cursor-ew-resize"
                    aria-hidden="true"
                  >
                    <span className="absolute right-[3px] top-1/2 h-[12px] w-[2px] -translate-y-1/2 rounded-full" style={{ background: `color-mix(in srgb, ${color} 80%, transparent)` }} />
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          /* point marker — a single draggable pill */
          <div
            ref={blockRef}
            role="slider"
            tabIndex={0}
            aria-label="Time"
            aria-valuemin={0}
            aria-valuemax={DAY - 1}
            aria-valuenow={start}
            aria-valuetext={fmtClock(start)}
            aria-orientation="horizontal"
            onKeyDown={onKeyDown}
            className="absolute top-1/2 z-10 h-[28px] w-[12px] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full active:cursor-grabbing"
            style={{
              background: color,
              border: `2px solid var(--df-rail-handle-ring)`,
              boxShadow: "var(--df-rail-handle-shadow)",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------ duration hero ----

interface DurationHeroProps {
  value: number;
  onChange: (minutes: number) => void;
  /** quick-pick chips, minutes (default 15m…2h) */
  chips?: number[];
  ariaLabel?: string;
}

/** The big "1h" — steppers around a hero value, quick chips beneath. */
export function DurationHero({
  value,
  onChange,
  chips = [15, 30, 45, 60, 90, 120],
  ariaLabel = "Duration",
}: DurationHeroProps) {
  const step = (dir: 1 | -1) => onChange(clamp(value + dir * 15, MIN_BLOCK, MAX_BLOCK));

  return (
    <div role="group" aria-label={ariaLabel}>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Decrease duration by 15 minutes"
          className="df-press grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{
            background: "var(--df-chip-fill)",
            border: "0.5px solid var(--df-chip-border)",
            color: "var(--df-text-secondary)",
          }}
        >
          <Minus className="h-4 w-4" strokeWidth={2.4} />
        </button>
        <div className="min-w-[104px] text-center" aria-live="polite">
          <span
            className="text-[26px] font-bold leading-none tracking-tight tabular-nums"
            style={{ color: "var(--df-text-primary)" }}
          >
            {fmtDur(value)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Increase duration by 15 minutes"
          className="df-press grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{
            background: "var(--df-chip-fill)",
            border: "0.5px solid var(--df-chip-border)",
            color: "var(--df-text-secondary)",
          }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
        {chips.map((m) => {
          const active = value === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              aria-pressed={active}
              className="df-press h-8 rounded-full px-3 text-[11.5px] font-bold tabular-nums"
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
              {fmtDur(m)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------- counted note ----

interface CountedNoteProps {
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  ariaLabel?: string;
  rows?: number;
}

/** Note field with a live "0/140" counter (the reference's counter). */
export function CountedNote({
  value,
  onChange,
  max,
  placeholder,
  ariaLabel = "Note",
  rows = 2,
}: CountedNoteProps) {
  return (
    <div>
      <div className="df-input-glass rounded-[16px] px-4 py-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, max))}
          placeholder={placeholder}
          aria-label={ariaLabel}
          rows={rows}
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-[var(--df-text-muted)]"
          style={{ color: "var(--df-text-primary)" }}
        />
      </div>
      <div
        className="mt-1 text-right text-[10.5px] font-semibold tabular-nums"
        style={{
          color:
            value.length >= max ? "var(--df-destructive-text)" : "var(--df-text-muted)",
        }}
        aria-live="off"
      >
        {value.length}/{max}
      </div>
    </div>
  );
}

/** Standalone counter for existing inputs — "0/200" aligned right. */
export function CharCounter({ len, max }: { len: number; max: number }) {
  return (
    <span
      className="text-[10.5px] font-semibold tabular-nums"
      style={{
        color: len >= max ? "var(--df-destructive-text)" : "var(--df-text-muted)",
      }}
    >
      {len}/{max}
    </span>
  );
}

// ------------------------------------------------------- rows ----

/** iOS-settings row: label left, native time input right ("Start time"). */
export function TimeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="df-input-glass flex h-12 items-center justify-between rounded-[14px] px-4">
      <span className="text-[12.5px] font-semibold" style={{ color: "var(--df-text-secondary)" }}>
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" style={{ color: "var(--df-text-muted)" }} aria-hidden="true" />
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-[104px] bg-transparent text-right text-[15px] font-bold tabular-nums outline-none [color-scheme:light] dark:[color-scheme:dark]"
          style={{ color: "var(--df-text-primary)" }}
        />
      </span>
    </div>
  );
}

/** Same row shape for a numeric value with a unit ("Calories · kcal"). */
export function NumRow({
  label,
  unit,
  value,
  onChange,
  placeholder = "—",
  maxLen = 5,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLen?: number;
}) {
  return (
    <div className="df-input-glass flex h-12 items-center justify-between rounded-[14px] px-4">
      <span className="text-[12.5px] font-semibold" style={{ color: "var(--df-text-secondary)" }}>
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, maxLen))}
          inputMode="numeric"
          placeholder={placeholder}
          aria-label={`${label} in ${unit}`}
          className="w-[72px] bg-transparent text-right text-[15px] font-bold tabular-nums outline-none placeholder:text-[var(--df-text-muted)]"
          style={{ color: "var(--df-text-primary)" }}
        />
        <span className="text-[10.5px] font-semibold" style={{ color: "var(--df-text-muted)" }}>
          {unit}
        </span>
      </span>
    </div>
  );
}
