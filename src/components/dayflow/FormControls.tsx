"use client";

// FormControls — the Apple-style log-form kit (Phase 12b).
// A faithful React translation of the "Log a block — Apple-style
// redesign" reference: a question, expanding category pills, glass
// fields with a cursor spotlight, a big hero value, a 24-hour track
// you drag, Start/End buttons that open an iOS wheel picker, a
// sliding-thumb quick segmented control, counted notes and a
// gradient CTA that draws its checkmark. The whole sheet is tinted
// by the selected category through the --dff-c custom property.
//
// Shared by EventDialog (log a block), MealCaptureSheet (log a
// meal) and WorkoutSheet (log a workout). All colors resolve from
// --df-f-* tokens (theme.css) + the runtime --dff-c accent —
// never a raw literal here.
//
//   Aurora          the three drifting blobs behind the glass.
//   CategoryStrip   icon pills that expand their label when picked
//                   (drag or arrow keys to switch, pop on pick).
//   SpotField       input with the cursor-following spotlight.
//   CountedField    note with the live "0/140" counter inside.
//   NumField        numeric input with a unit suffix.
//   DurationRow     the big "1h" + round −/+ steppers.
//   DayTrack        the 24-hour track — drag to set the start
//                   (block mode keeps the length, point mode is a
//                   pill for instant logs). Overnight wraps.
//   TrackTicks      12 AM · 6 AM · 12 PM · 6 PM · 12 AM.
//   TimePair        Start/End field-buttons (roll animation,
//                   "Tomorrow" badge) that open the WheelPicker.
//   QuickDuration   segmented control with a sliding thumb + Now.
//   WheelPicker     the 3-wheel (hour/minute/AM-PM) time picker.
//   FormActions     Cancel/Delete ghost + the gradient Go with a
//                   drawn checkmark on success.

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

const DAY = 24 * 60;
const MIN_BLOCK = 5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** snap to 5-minute increments — fine enough for sleep, coarse for speed */
export const snap5 = (v: number) => Math.round(v / 5) * 5;

const pad = (n: number) => String(n).padStart(2, "0");

/** minutes → "HH:MM" */
export const minutesToHM = (min: number): string =>
  `${pad(Math.floor((((min % DAY) + DAY) % DAY) / 60))}:${pad(min % 60)}`;

/** "HH:MM" → minutes */
export const hmToMinutes = (hm: string): number =>
  (Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))) % DAY;

/** minutes-of-day right now, snapped to 5 */
export const nowMinutes = (): number =>
  snap5(new Date().getHours() * 60 + new Date().getMinutes()) % DAY;

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

/** the cursor spotlight — every .dff-field tracks its pointer */
export const spotlightMove = (e: React.PointerEvent<HTMLElement>) => {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
};

// ---------------------------------------------------------- aurora ----

/** The three drifting blobs behind the glass sheet. */
export function Aurora() {
  return (
    <div className="dff-aurora" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

// ------------------------------------------------- category strip ----

export interface FormCategory {
  id: string;
  /** short strip label — "Personal", expands when picked */
  label: string;
  /** category color (hex, runtime DATA from styles/palette) */
  color: string;
  /** rendered 20×20 stroke icon */
  icon: React.ReactNode;
}

/**
 * The category radiogroup: icon-only pills that expand their label
 * when picked. Pointer-down picks; a horizontal drag sweeps across
 * pills (8px threshold, one pill per segment width); arrow keys
 * walk the group. Picking pops the icon.
 */
export function CategoryStrip({
  items,
  value,
  onChange,
  ariaLabel = "Category",
}: {
  items: FormCategory[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}) {
  const [nonce, setNonce] = useState(0);
  const dragging = useRef(false);
  const x0 = useRef(0);
  const i0 = useRef(0);
  const moved = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const pick = (i: number) => {
    const item = items[i];
    if (!item || item.id === value) return;
    haptic(6);
    onChange(item.id);
    setNonce((n) => n + 1);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const btn = (e.target as HTMLElement).closest("[data-i]");
    if (!btn) return;
    dragging.current = true;
    moved.current = false;
    x0.current = e.clientX;
    i0.current = Number(btn.getAttribute("data-i"));
    try {
      boxRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone — pick still proceeds */
    }
    pick(i0.current);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    if (Math.abs(e.clientX - x0.current) > 8) moved.current = true;
    if (!moved.current) return;
    const seg = boxRef.current?.getBoundingClientRect().width ?? items.length;
    const sw = seg / items.length;
    pick(clamp(i0.current + Math.round((e.clientX - x0.current) / sw), 0, items.length - 1));
  };

  const end = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[
      e.key
    ];
    if (!d) return;
    e.preventDefault();
    const cur = items.findIndex((c) => c.id === value);
    pick((cur + d + items.length) % items.length);
  };

  return (
    <div
      ref={boxRef}
      className="dff-cats"
      role="radiogroup"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
    >
      {items.map((c, i) => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            className="dff-cat"
            role="radio"
            data-i={i}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            aria-label={c.label}
          >
            {active ? (
              <span key={`pop-${nonce}`} className="dff-pop">
                {c.icon}
              </span>
            ) : (
              c.icon
            )}
            <span>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------- fields ----

/** Input with the cursor-following spotlight and focus ring. */
export function SpotField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLength = 60,
  autoFocus,
  enterBlur,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  maxLength?: number;
  autoFocus?: boolean;
  enterBlur?: boolean;
  inputMode?: "text" | "numeric";
}) {
  return (
    <div className="dff-field" onPointerMove={spotlightMove}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
        autoFocus={autoFocus}
        inputMode={inputMode}
        autoComplete="off"
        enterKeyHint={enterBlur ? "done" : undefined}
        onKeyDown={
          enterBlur
            ? (e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }
            : undefined
        }
      />
    </div>
  );
}

/** Note field with the live "0/140" counter tucked inside. */
export function CountedField({
  value,
  onChange,
  max,
  placeholder,
  ariaLabel = "Note",
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="dff-field dff-note" onPointerMove={spotlightMove}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={max}
        rows={2}
      />
      <span className="dff-count" aria-live="off">
        {value.length}/{max}
      </span>
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

/** Numeric input with a unit suffix — "bpm", "kcal", "g". */
export function NumField({
  value,
  onChange,
  unit,
  placeholder = "—",
  ariaLabel,
  maxLen = 5,
  big,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  placeholder?: string;
  ariaLabel: string;
  maxLen?: number;
  /** render the hero treatment (38px tabular) */
  big?: boolean;
}) {
  return (
    <div
      className={`dff-field dff-num${big ? " dff-hero" : ""}`}
      onPointerMove={spotlightMove}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, maxLen))}
        inputMode="numeric"
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      <span className="dff-unit">{unit}</span>
    </div>
  );
}

// ---------------------------------------------------- duration row ----

/** The big "1h" with round −/+ steppers (15-minute steps). */
export function DurationRow({
  value,
  onChange,
  step = 15,
  min = MIN_BLOCK,
  max = DAY,
}: {
  value: number;
  onChange: (minutes: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="dff-dur" role="group" aria-label="Duration">
      <div className="dff-big" aria-live="polite">
        {fmtDur(value)}
      </div>
      <div className="dff-step">
        <button
          type="button"
          onClick={() => {
            haptic(6);
            onChange(Math.max(min, value - step));
          }}
          aria-label={`Shorten by ${step} minutes`}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            haptic(6);
            onChange(Math.min(max, value + step));
          }}
          aria-label={`Lengthen by ${step} minutes`}
        >
          +
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------- track ----

/**
 * The 24-hour track. Drag anywhere to set the start — block mode
 * keeps the block's length (overnight wraps to a second segment),
 * point mode drags a single pill for instant logs. Tapping jumps.
 * aria-hidden by design: the keyboard path is the Start/End wheels
 * and the −/+ steppers (same as the reference).
 */
export function DayTrack({
  startMin,
  durationMin,
  mode,
  onChange,
  ariaLabel = "Time of day",
}: {
  startMin: number;
  durationMin?: number;
  mode: "block" | "point";
  onChange: (startMin: number) => void;
  ariaLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);

  const start = clamp(Math.round(startMin), 0, DAY - 1);
  const dur = mode === "block" ? clamp(Math.round(durationMin ?? 0), MIN_BLOCK, DAY) : 0;
  const wraps = mode === "block" && start + dur > DAY;

  const setFromX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const frac = clamp((clientX - r.left) / r.width, 0, 1);
    const v = Math.round(frac * 288) * 5 % DAY;
    if (v !== start) {
      haptic(3);
      onChange(v);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    setDrag(true);
    try {
      trackRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture is an optimization — dragging still works */
    }
    setFromX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag) setFromX(e.clientX);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    if (trackRef.current?.hasPointerCapture(e.pointerId)) {
      trackRef.current.releasePointerCapture(e.pointerId);
    }
    setDrag(false);
  };

  const pct = (min: number) => `${(clamp(min, 0, DAY) / DAY) * 100}%`;
  const mainW = mode === "block" ? Math.min(dur, DAY - start) : 0;
  const wrapW = wraps ? start + dur - DAY : 0;
  // point mode — a fixed 24-minute pill centered on the time
  const pointW = 24;
  const pointL = clamp(start - pointW / 2, 0, DAY - pointW);

  return (
    <div
      ref={trackRef}
      className={`dff-track${drag ? " dff-drag" : ""}`}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {mode === "block" ? (
        <>
          <div className="dff-seg" style={{ left: pct(start), width: pct(mainW) }} />
          {wraps && <div className="dff-seg" style={{ left: "0%", width: pct(wrapW) }} />}
        </>
      ) : (
        <div className="dff-seg" style={{ left: pct(pointL), width: pct(pointW) }} />
      )}
    </div>
  );
}

/** 12 AM · 6 AM · 12 PM · 6 PM · 12 AM — under the track. */
export function TrackTicks() {
  return (
    <div className="dff-ticks" aria-hidden="true">
      <span>12 AM</span>
      <span>6 AM</span>
      <span>12 PM</span>
      <span>6 PM</span>
      <span>12 AM</span>
    </div>
  );
}

// ------------------------------------------------------ time pair ----

/** One Start/End-style field-button (label, optional badge, big time). */
export function TimeButton({
  label,
  minutes,
  badge,
  on,
  onClick,
}: {
  label: string;
  minutes: number;
  badge?: string;
  on?: boolean;
  onClick: () => void;
}) {
  const m = ((Math.round(minutes) % DAY) + DAY) % DAY;
  const h = Math.floor(m / 60);
  const t = `${(h + 11) % 12 + 1}:${pad(m % 60)}`;
  const ap = h < 12 ? "AM" : "PM";
  const key = `${t}${ap}`;

  // roll only when the value actually changed (never on first paint).
  // The previous key lives on the element (dataset) so render stays
  // pure; the class lands in a layout effect, before paint.
  const firstRef = useRef(true);
  const tvRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = tvRef.current;
    if (!el) return;
    if (firstRef.current) {
      firstRef.current = false;
      el.setAttribute("data-k", key);
      return;
    }
    if (el.getAttribute("data-k") !== key) {
      el.setAttribute("data-k", key);
      el.classList.add("dff-roll");
    }
  }, [key]);

  return (
    <button
      type="button"
      className={`dff-field dff-tf${on ? " dff-on" : ""}`}
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${label} time, ${fmtClock(m)}${badge ? `, ${badge.toLowerCase()}` : ""}. Tap to change`}
    >
      <span className="dff-tl">
        {label}
        {badge && <u>{badge}</u>}
      </span>
      <span ref={tvRef} className="dff-tv">
        <b key={key}>{t}</b>
        <em>{ap}</em>
      </span>
    </button>
  );
}

/** Start — → End: the two field-buttons with the arrow between. */
export function TimePair({
  startMin,
  endMin,
  endBadge,
  onPickStart,
  onPickEnd,
  active,
}: {
  startMin: number;
  endMin: number;
  endBadge?: string;
  onPickStart: () => void;
  onPickEnd: () => void;
  /** which side the wheel picker is editing ("start" | "end" | null) */
  active?: "start" | "end" | null;
}) {
  return (
    <div className="dff-times">
      <TimeButton label="Start" minutes={startMin} on={active === "start"} onClick={onPickStart} />
      <div className="dff-arr" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
      <TimeButton
        label="End"
        minutes={endMin}
        badge={endBadge}
        on={active === "end"}
        onClick={onPickEnd}
      />
    </div>
  );
}

// ------------------------------------------------------ now pill ----

/** The "Now" pill — pins a time to the current clock. */
export function NowButton({
  onClick,
  ariaLabel = "Set the time to now",
}: {
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className="dff-qnow"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={() => {
        haptic(8);
        onClick();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
      </svg>
      Now
    </button>
  );
}

// ------------------------------------------------ quick duration ----

/**
 * The quick-duration segmented control (sliding thumb) + the "Now"
 * button that pins the END time to the current clock.
 */
export function QuickDuration({
  value,
  onChange,
  onNow,
  chips = [15, 30, 45, 60, 120],
}: {
  value: number;
  onChange: (minutes: number) => void;
  /** set end = now (parent derives the start) */
  onNow: () => void;
  chips?: number[];
}) {
  const qi = chips.indexOf(value);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const x0 = useRef(0);
  const i0 = useRef(0);
  const moved = useRef(false);

  const pick = (i: number) => {
    if (chips[i] === value) return;
    haptic(6);
    onChange(chips[i]);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const btn = (e.target as HTMLElement).closest("[data-i]");
    if (!btn) return;
    dragging.current = true;
    moved.current = false;
    x0.current = e.clientX;
    i0.current = Number(btn.getAttribute("data-i"));
    try {
      boxRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone — pick still proceeds */
    }
    pick(i0.current);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    if (Math.abs(e.clientX - x0.current) > 8) moved.current = true;
    if (!moved.current) return;
    const w = (boxRef.current?.getBoundingClientRect().width ?? 0) / chips.length;
    pick(clamp(i0.current + Math.round((e.clientX - x0.current) / w), 0, chips.length - 1));
  };
  const end = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[
      e.key
    ];
    if (!d) return;
    e.preventDefault();
    const cur = chips.indexOf(value);
    const i = clamp(cur < 0 ? (d > 0 ? 0 : chips.length - 1) : cur + d, 0, chips.length - 1);
    pick(i);
    (boxRef.current?.children[i + 1] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="dff-quick">
      <div
        ref={boxRef}
        className={`dff-qseg${qi > -1 ? " dff-has" : ""}`}
        role="radiogroup"
        aria-label="Quick duration"
        style={qi > -1 ? ({ "--dff-qi": qi } as React.CSSProperties) : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
      >
        <i className="dff-thumb" aria-hidden="true" />
        {chips.map((d, i) => (
          <button
            key={d}
            type="button"
            role="radio"
            data-i={i}
            aria-checked={i === qi}
            tabIndex={i === qi || (qi < 0 && i === 0) ? 0 : -1}
            className={i === qi ? "on" : undefined}
          >
            {fmtDur(d)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="dff-qnow"
        aria-label="Set end time to now"
        title="Set end time to now"
        onClick={() => {
          haptic(8);
          onNow();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
        </svg>
        Now
      </button>
    </div>
  );
}

// --------------------------------------------------- wheel picker ----

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));
const APS = ["AM", "PM"];
const ROW = 40; // px per wheel row

/**
 * The iOS wheel picker: three scroll-snap columns (hour, minute,
 * AM/PM) in a mini bottom sheet inside the form sheet. Scrolling
 * commits live (90 ms debounce, exactly like the reference); rows
 * are click-to-center; arrows nudge; the handle drags it away.
 * The parent owns `open` — Escape should close it before the sheet.
 */
export function WheelPicker({
  open,
  title,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  title: string;
  /** minutes of day being edited */
  value: number;
  /** live commit while scrolling */
  onChange: (minutes: number) => void;
  onClose: () => void;
}) {
  const hRef = useRef<HTMLDivElement>(null);
  const mRef = useRef<HTMLDivElement>(null);
  const pRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const idxOf = (el: HTMLDivElement | null) =>
    el ? clamp(Math.round(el.scrollTop / ROW), 0, el.children.length - 1) : 0;

  // sync selection state for highlight rendering (ref mirror keeps
  // the haptic outside the state updater — strict-mode safe)
  const [sel, setSel] = useState({ h: 0, m: 0, p: 0 });
  const selRef = useRef({ h: 0, m: 0, p: 0 });
  const mark = () => {
    const next = { h: idxOf(hRef.current), m: idxOf(mRef.current), p: idxOf(pRef.current) };
    const prev = selRef.current;
    if (prev.h === next.h && prev.m === next.m && prev.p === next.p) return;
    if (!lockRef.current) haptic(3);
    selRef.current = next;
    setSel(next);
  };

  // opening: jump the wheels to the value, then unlock commits
  useEffect(() => {
    if (!open) return;
    const m = ((value % DAY) + DAY) % DAY;
    const h = Math.floor(m / 60);
    lockRef.current = true;
    if (hRef.current) hRef.current.scrollTop = ((h + 11) % 12) * ROW;
    if (mRef.current) mRef.current.scrollTop = (m % 60) * ROW;
    if (pRef.current) pRef.current.scrollTop = (h < 12 ? 0 : 1) * ROW;
    mark();
    const t = setTimeout(() => {
      lockRef.current = false;
    }, 250);
    return () => clearTimeout(t);
  }, [open]);

  const commit = () => {
    const h12 = idxOf(hRef.current) + 1;
    const minutes =
      ((h12 % 12) + (idxOf(pRef.current) ? 12 : 0)) * 60 + idxOf(mRef.current);
    onChange(minutes % DAY);
  };

  const onScroll = () => {
    mark();
    if (lockRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(commit, 90);
  };
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Escape closes the WHEEL first (capture phase beats the sheet's
  // own window listener, exactly like the reference).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const centerRow = (el: HTMLDivElement, i: number) => {
    el.scrollTo({ top: i * ROW, behavior: "smooth" });
  };

  // drag-down-to-close on the handle (1:1 tracking like reference)
  const dragY0 = useRef<number | null>(null);
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragY0.current = e.clientY;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* drag-to-close still tracks without capture */
    }
    if (panelRef.current) panelRef.current.style.transition = "none";
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragY0.current === null) return;
    const dy = Math.max(0, e.clientY - dragY0.current);
    if (panelRef.current) panelRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onHandleUp = () => {
    if (dragY0.current === null) return;
    const dy = panelRef.current
      ? Number((panelRef.current.style.transform.match(/translateY\((\d+(?:\.\d+)?)px\)/) ?? [0, 0])[1])
      : 0;
    dragY0.current = null;
    if (panelRef.current) {
      panelRef.current.style.transition = "";
      panelRef.current.style.transform = "";
    }
    if (dy > 80) onClose();
  };

  const wheelKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const el = e.currentTarget;
    el.scrollBy({ top: e.key === "ArrowDown" ? ROW : -ROW, behavior: "smooth" });
  };

  return (
    <div className={`dff-wsc${open ? " dff-open" : ""}`} aria-hidden={!open}>
      <div className="dff-wback" onClick={onClose} />
      <div className="dff-wpanel" role="dialog" aria-label="Pick a time" ref={panelRef}>
        <div
          className="dff-wdrag"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <div className="dff-wgrab" />
          <div className="dff-whead">
            <span>{title}</span>
            <button type="button" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
        <div className="dff-wheels">
          <div className="dff-band" aria-hidden="true" />
          <div
            ref={hRef}
            className="dff-wh"
            tabIndex={0}
            aria-label="Hour"
            onScroll={onScroll}
            onKeyDown={wheelKey}
          >
            {HOURS.map((h, i) => (
              <div
                key={h}
                className={i === sel.h ? "sel" : undefined}
                onClick={() => hRef.current && centerRow(hRef.current, i)}
              >
                {h}
              </div>
            ))}
          </div>
          <div
            ref={mRef}
            className="dff-wh"
            tabIndex={0}
            aria-label="Minute"
            onScroll={onScroll}
            onKeyDown={wheelKey}
          >
            {MINUTES.map((mm, i) => (
              <div
                key={mm}
                className={i === sel.m ? "sel" : undefined}
                onClick={() => mRef.current && centerRow(mRef.current, i)}
              >
                {mm}
              </div>
            ))}
          </div>
          <div
            ref={pRef}
            className="dff-wh"
            tabIndex={0}
            aria-label="AM or PM"
            onScroll={onScroll}
            onKeyDown={wheelKey}
          >
            {APS.map((ap, i) => (
              <div
                key={ap}
                className={i === sel.p ? "sel" : undefined}
                onClick={() => pRef.current && centerRow(pRef.current, i)}
              >
                {ap}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------- actions ----

/**
 * The footer: a ghost Cancel (or Delete, in edit mode) and the
 * gradient Go. `done` swaps the label for a checkmark that draws
 * itself — the reference's save flourish.
 */
export function FormActions({
  ghostLabel = "Cancel",
  onGhost,
  goLabel,
  onGo,
  disabled,
  done,
  ghostClassName,
  className,
  style,
}: {
  ghostLabel?: string;
  onGhost: () => void;
  goLabel: string;
  onGo: () => void;
  disabled?: boolean;
  done?: boolean;
  ghostClassName?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`dff-actions${className ? ` ${className}` : ""}`} style={style}>
      <button type="button" className={`dff-btn dff-ghost${ghostClassName ? ` ${ghostClassName}` : ""}`} onClick={onGhost}>
        {ghostLabel}
      </button>
      <button
        type="button"
        className={`dff-btn dff-go${done ? " dff-done" : ""}`}
        onClick={onGo}
        disabled={disabled || done}
      >
        {done ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          goLabel
        )}
      </button>
    </div>
  );
}
