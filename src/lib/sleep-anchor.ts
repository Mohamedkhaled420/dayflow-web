// ============================================================
// Focus Triad — sleep wake-anchor (Phase 24)
// ------------------------------------------------------------
// Sleep rows are anchored by their WAKE time (sleep_logs.logged_at
// IS the wake timestamp; sleepToEvent walks backwards by
// sleep_minutes). Every path that creates a sleep row WITHOUT an
// explicit wake time used to stamp "now" — so a ring drag at 2 AM
// produced a 7:51 PM → 2:06 AM block, and an afternoon drag put
// "last night's" sleep in the middle of the day.
//
// This helper picks the most plausible wake moment for "the sleep
// I'm logging right now":
//   • 04:00–12:00 local  → the user just woke up: wake = now.
//   • 12:00–24:00 local  → they're logging LAST night after the
//     fact: wake = the most recent occurrence of their target wake
//     time that is already in the past (today's if it has passed,
//     otherwise yesterday's).
//   • 00:00–04:00 local  → mid-night: treat as a just-ended nap
//     (wake = now) — any historical anchor would be ≥ 16 h stale.
//
// The target wake clock comes from the profile chronobiology:
// targetWakeMinutes (onboarding-set, minutes) wins, then
// naturalWakeTime ("HH:MM" from the chronotype quiz), then 08:00.
// ============================================================

export interface WakeSource {
  targetWakeMinutes?: number | null;
  naturalWakeTime?: string | null;
}

/** "HH:MM" clock for a Date (local). */
const clockOf = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Parse "HH:MM" (or "H:MM") into minutes-of-day; null when absent. */
export const clockToMinutes = (clock?: string | null): number | null => {
  if (!clock) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return (h % 24) * 60 + min;
};

/** Minutes-of-day of the user's target wake (chronobiology), 08:00 default. */
export function targetWakeMinutesOf(src?: WakeSource | null): number {
  const explicit = typeof src?.targetWakeMinutes === "number" ? src.targetWakeMinutes : null;
  if (explicit != null && explicit >= 0 && explicit < 1440) return explicit;
  const natural = clockToMinutes(src?.naturalWakeTime);
  if (natural != null) return natural;
  return 8 * 60;
}

/** The wake Date a new sleep row should carry, given "now". Pure —
 *  callers pass the live clock so tests can pin any hour. */
export function sleepWakeAnchor(now: Date, src?: WakeSource | null): Date {
  const h = now.getHours() + now.getMinutes() / 60;

  if (h >= 4 && h < 12) return now; // just woke up
  if (h < 4) return now; // mid-night nap / still-up logging

  // Afternoon or evening: the most recent PAST occurrence of the
  // target wake time. Today's if it already passed, else yesterday's
  // (covers late-sleep targets like 13:00 logged at 12:30).
  const wakeMin = targetWakeMinutesOf(src);
  const candidate = new Date(now);
  candidate.setHours(Math.floor(wakeMin / 60), wakeMin % 60, 0, 0);
  if (candidate.getTime() > now.getTime()) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}

/** Format a minutes-of-day as a 12-hour clock ("3:00 AM"). */
export const fmtMinutes12 = (mins: number): string => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
};

/** Bedtime (minutes-of-day, may be negative → previous day) for a
 *  wake anchor + duration. */
export const bedtimeOf = (wake: Date, minutes: number): number =>
  wake.getHours() * 60 + wake.getMinutes() - minutes;

/** Pretty range for a wake anchor + sleep minutes:
 *  "3:00 AM – 10:00 AM". */
export const sleepRangeLabel = (wake: Date, minutes: number): string =>
  `${fmtMinutes12(bedtimeOf(wake, minutes))} – ${fmtMinutes12(
    wake.getHours() * 60 + wake.getMinutes()
  )}`;

export { clockOf };
