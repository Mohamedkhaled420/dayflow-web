// ============================================================
// Dayflow AI — circadian math (PRD §4.2, Phase 5 T1c)
// ------------------------------------------------------------
// MCTQ-style heuristics over the profile's chronobiology
// section. Given the natural wake time and the target sleep
// duration, the three classic windows are derived:
//
//   morningFocusPeak   — wake +2h  … +4.5h   (deep-focus gold)
//   afternoonDip       — wake +6h  … +7.5h   (post-lunch trough)
//   secondaryMotorPeak — wake +9h  … +11h    (body coordination)
//
// Chronotype (derived from the wake time, PRD §4.1 defaults to
// "intermediate") shifts the whole schedule ±30 min, and a short
// target sleep (< 7 h) deepens + lengthens the afternoon dip —
// the documented homeostatic-pressure effect. Onboarding's
// computePeaks heuristic stays the single writer of
// chronobiology.calculatedPeaks; this module is the read-side
// single source for every consumer (Timeline overlay, coach ctx).
// ============================================================

export type Chronotype =
  | "extreme_lark"
  | "moderate_lark"
  | "intermediate"
  | "moderate_owl"
  | "extreme_owl";

export interface CircadianWindow {
  /** "HH:MM" 24h start. */
  start: string;
  /** "HH:MM" 24h end. */
  end: string;
}

export interface CircadianZones {
  chronotype: Chronotype;
  morningFocusPeak: CircadianWindow;
  afternoonDip: CircadianWindow;
  secondaryMotorPeak: CircadianWindow;
}

/** Minutes since local midnight for an "HH:MM" clock string. */
export const clockToMinutes = (hm: string): number => {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Wrap minutes-of-day into an "HH:MM" clock string. */
export const minutesToClock = (mins: number): string => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** MCTQ-style chronotype from the natural wake time (§4.1). */
export function deriveChronotype(wake: string): Chronotype {
  const mins = clockToMinutes(wake);
  if (mins <= 300) return "extreme_lark"; // ≤ 05:00
  if (mins <= 390) return "moderate_lark"; // ≤ 06:30
  if (mins <= 480) return "intermediate"; // ≤ 08:00
  if (mins <= 570) return "moderate_owl"; // ≤ 09:30
  return "extreme_owl";
}

/** Circadian schedule shift by chronotype (minutes). */
const CHRONO_SHIFT: Record<Chronotype, number> = {
  extreme_lark: -30,
  moderate_lark: -15,
  intermediate: 0,
  moderate_owl: 15,
  extreme_owl: 30,
};

const DEFAULT_WAKE = "07:00";
const DEFAULT_SLEEP_MINUTES = 480;

/**
 * Compute the three circadian windows from the profile inputs.
 * Pure + total: any consumer (Timeline overlay, onboarding writer,
 * tests) gets the same zones for the same inputs.
 */
export function computeCircadianZones(
  naturalWakeTime: string | null | undefined,
  targetSleepDurationMinutes: number | null | undefined
): CircadianZones {
  const wake = clockToMinutes(naturalWakeTime || DEFAULT_WAKE);
  const sleepMinutes =
    typeof targetSleepDurationMinutes === "number" && targetSleepDurationMinutes > 0
      ? targetSleepDurationMinutes
      : DEFAULT_SLEEP_MINUTES;
  const chronotype = deriveChronotype(minutesToClock(wake));
  const shift = CHRONO_SHIFT[chronotype];

  // Homeostatic pressure: short sleepers hit the dip earlier and
  // stay in it longer; long sleepers shake it off quickly.
  const dipStart = sleepMinutes < 420 ? 330 : 360;
  const dipLength = sleepMinutes < 420 ? 120 : sleepMinutes > 540 ? 75 : 90;

  const window = (start: number, duration: number): CircadianWindow => ({
    start: minutesToClock(wake + start + shift),
    end: minutesToClock(wake + start + shift + duration),
  });

  return {
    chronotype,
    morningFocusPeak: window(120, 150), // wake +2h … +4.5h
    afternoonDip: window(dipStart, dipLength), // ~wake +6h … +7.5h
    secondaryMotorPeak: window(540, 120), // wake +9h … +11h
  };
}

export type ZoneKind = "peak" | "dip";

export interface TimelineZone {
  kind: ZoneKind;
  label: string;
  startMin: number;
  endMin: number;
}

/** Flat minute-ranges for the Timeline overlay bands. */
export function zonesForTimeline(zones: CircadianZones): TimelineZone[] {
  return [
    {
      kind: "peak",
      label: "Morning focus peak",
      startMin: clockToMinutes(zones.morningFocusPeak.start),
      endMin: clockToMinutes(zones.morningFocusPeak.end),
    },
    {
      kind: "dip",
      label: "Afternoon dip",
      startMin: clockToMinutes(zones.afternoonDip.start),
      endMin: clockToMinutes(zones.afternoonDip.end),
    },
    {
      kind: "peak",
      label: "Secondary motor peak",
      startMin: clockToMinutes(zones.secondaryMotorPeak.start),
      endMin: clockToMinutes(zones.secondaryMotorPeak.end),
    },
  ];
}

/** True when a minute-of-day sits inside a peak window (drag target). */
export function isMinuteInPeak(zones: CircadianZones, minute: number): boolean {
  return zonesForTimeline(zones).some(
    (z) => z.kind === "peak" && minute >= z.startMin && minute < z.endMin
  );
}
