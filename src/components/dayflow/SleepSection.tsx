"use client";

// SleepSection — last night on the Daily view, wrapped in the
// flowing StringWaves backdrop. Shows duration, bedtime → wake,
// the delta vs the chronobiology target and resting HR when logged.
//
// Empty state is a TWO-TAP quick logger (duration chips + wake time)
// that writes a sleep_logs row straight from here — no detour to the
// timeline. The card reads sleep through the same derived-event
// pipeline (sleepToEvent) the rest of the app uses, so timeline,
// weekly view and coach all see it instantly.

import { useMemo, useState } from "react";
import { Check, HeartPulse, Moon } from "lucide-react";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useDayflowData, localDateTime } from "@/lib/viewmodel";
import { eventDuration, fmtDuration, fmtRange, sleepForDay } from "@/lib/compute";
import { CATEGORY_COLORS } from "@/styles/palette";
import { StringWaves } from "@/components/dayflow/sleep/StringWaves";
import { triggerHaptic, hapticSuccess } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";

const SLEEP = CATEGORY_COLORS.sleep;

/** hours offered as chips in the quick logger */
const DURATION_OPTIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

const pad = (n: number) => String(n).padStart(2, "0");
const dayKeyOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtHoursShort = (h: number) =>
  h % 1 === 0 ? `${h}h` : `${Math.floor(h)}h${Math.round((h % 1) * 60)}`;

export function SleepSection({ dateKey }: { dateKey: string }) {
  const data = useDayflowData();
  const sleepLogs = useDayflowStore((s) => s.sleepLogs);
  const addSleepLog = useDayflowStore((s) => s.addSleepLog);
  const { toast } = useToast();

  const [hours, setHours] = useState<number | null>(null);
  const [wake, setWake] = useState("07:00");
  const [saving, setSaving] = useState(false);

  const sleep = useMemo(
    () => sleepForDay(data.events, dateKey),
    [data.events, dateKey]
  );
  const rhr = useMemo(
    () =>
      sleepLogs.find((r) => dayKeyOf(r.logged_at) === dateKey)?.resting_heart_rate ??
      null,
    [sleepLogs, dateKey]
  );

  const target = data.goals.sleepMinutes;
  const minutes = sleep ? eventDuration(sleep) : 0;
  const met = minutes >= target - 15;
  const delta = target - minutes;

  const save = async () => {
    if (hours == null || saving) return;
    setSaving(true);
    try {
      const id = await addSleepLog({
        sleep_minutes: Math.round(hours * 60),
        logged_at: localDateTime(dateKey, wake),
      });
      if (id) {
        hapticSuccess();
        toast({ title: "Sleep logged", description: `${fmtHoursShort(hours)} — lights out to ${wake}` });
        setHours(null);
      } else {
        toast({ title: "Could not save sleep", description: "Please try again." });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="mt-5 rounded-lg p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${SLEEP} 9%, var(--df-daily-grid-fill)), var(--df-daily-grid-fill) 62%)`,
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label="Sleep"
    >
      {/* flowing string backdrop */}
      <StringWaves />

      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Moon className="h-4 w-4 shrink-0" style={{ color: SLEEP }} />
            <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
              Sleep
            </h2>
            {sleep && (
              <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
                {fmtRange(sleep)}
              </span>
            )}
          </div>
          {sleep && (
            <span
              className="text-[11px] px-2 h-5 rounded-full flex items-center gap-1 shrink-0 font-semibold"
              style={{
                background: met
                  ? `color-mix(in srgb, ${SLEEP} 14%, transparent)`
                  : "var(--df-chip-fill)",
                color: met ? SLEEP : "var(--df-text-secondary)",
              }}
            >
              {met ? <Check className="h-3 w-3" /> : null}
              {met
                ? "target met"
                : `${fmtDuration(delta)} short of ${fmtDuration(target)}`}
            </span>
          )}
        </div>

        {sleep ? (
          <div className="mt-3 flex items-end gap-3 flex-wrap">
            <p
              className="text-[27px] font-bold leading-none tabular-nums"
              style={{ color: "var(--df-text-primary)" }}
            >
              {fmtDuration(minutes)}
            </p>
            <p className="text-[11.5px] pb-0.5" style={{ color: "var(--df-text-muted)" }}>
              of {fmtDuration(target)} target
            </p>
            {rhr != null && (
              <span
                className="ml-auto text-[11px] px-2 h-5 rounded-full flex items-center gap-1 font-semibold"
                style={{
                  background: `color-mix(in srgb, ${SLEEP} 12%, transparent)`,
                  color: SLEEP,
                }}
                title="Resting heart rate at wake"
              >
                <HeartPulse className="h-3 w-3" />
                {rhr} bpm resting
              </span>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
              How long did you sleep?
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    triggerHaptic();
                    setHours(h);
                  }}
                  aria-pressed={hours === h}
                  className="df-press h-8 px-3 rounded-full text-[12px] font-semibold"
                  style={{
                    background: hours === h
                      ? `color-mix(in srgb, ${SLEEP} 18%, transparent)`
                      : "var(--df-chip-fill)",
                    color: hours === h ? SLEEP : "var(--df-text-secondary)",
                    border: `0.5px solid ${
                      hours === h
                        ? `color-mix(in srgb, ${SLEEP} 45%, transparent)`
                        : "var(--df-chip-border)"
                    }`,
                  }}
                >
                  {fmtHoursShort(h)}
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <label
                className="text-[11.5px] flex items-center gap-1.5"
                style={{ color: "var(--df-text-secondary)" }}
              >
                Woke at
                <input
                  type="time"
                  value={wake}
                  onChange={(e) => setWake(e.target.value)}
                  className="h-8 px-2 rounded-md text-[12px] tabular-nums"
                  style={{
                    background: "var(--df-input-fill)",
                    border: "0.5px solid var(--df-input-border)",
                    color: "var(--df-text-primary)",
                  }}
                />
              </label>
              <button
                onClick={() => void save()}
                disabled={hours == null || saving}
                className="df-press df-btn-primary h-8 px-3.5 text-[12px] font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Log sleep"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
