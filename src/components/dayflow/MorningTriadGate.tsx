"use client";

// ============================================================
// Dayflow AI — Morning Triad gate (PRD §4.9, Phase 5 T1d)
// ------------------------------------------------------------
// When the profile says occupational status is NOT
// 'employed_structured' AND enforceMorningAnchor is on, the
// Focus (Timeline) tab stays gated behind the morning anchor:
//   1. Hydration check-in — at least 250 ml logged today
//   2. Light exposure confirmation
// Completion for the day is kept in localStorage keyed by the
// dateKey, so the gate re-arms tomorrow without any server
// round-trip (the hydration proof itself IS server-backed via
// hydration_logs / Delta Sync).
// ============================================================

import { useMemo, useState } from "react";
import { Check, Droplet, Sun } from "lucide-react";
import { z } from "zod";
import { Sheet } from "@/components/ui/Sheet";
import { useDayflowStore } from "@/store/useDayflowStore";
import { keyForOffset } from "@/lib/seed";
import { triggerHaptic } from "@/lib/haptics";
import { CATEGORY_COLORS } from "@/styles/palette";

export const MORNING_TRIAD_STORAGE_KEY = "dayflow-morning-triad-v1";

export interface MorningTriadRecord {
  dateKey: string;
  lightConfirmed: boolean;
}

/** F-5b (Phase 8 / S1): storage is untrusted input — validate the
 *  shape instead of casting the parsed JSON. */
const MorningTriadSchema = z.object({
  dateKey: z.string(),
  lightConfirmed: z.boolean(),
});

/** Read today's completion record (SSR-safe). */
export function readMorningTriad(): MorningTriadRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MORNING_TRIAD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = MorningTriadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data.dateKey === keyForOffset(0) ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Persist today's completion record. */
export function writeMorningTriad(record: MorningTriadRecord): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MORNING_TRIAD_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* storage full / private mode — the gate just re-arms */
  }
}

const REQUIRED_ML = 250;

export function MorningTriadGate({
  open,
  onUnlocked,
  onClose,
}: {
  open: boolean;
  /** Called once both anchors are logged (unlock Focus for the day). */
  onUnlocked: () => void;
  /** Called when the user dismisses without completing (stays gated). */
  onClose: () => void;
}) {
  const hydrationLogs = useDayflowStore((s) => s.hydrationLogs);
  const addHydrationLog = useDayflowStore((s) => s.addHydrationLog);
  const [light, setLight] = useState(false);
  const [logging, setLogging] = useState(false);

  const todayMl = useMemo(() => {
    const todayKey = keyForOffset(0);
    return hydrationLogs
      .filter((r) => {
        const d = new Date(r.logged_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return key === todayKey;
      })
      .reduce((sum, r) => sum + r.amount_ml, 0);
  }, [hydrationLogs]);

  const hydrated = todayMl >= REQUIRED_ML;
  const complete = hydrated && light;

  const logWater = async () => {
    triggerHaptic();
    setLogging(true);
    try {
      await addHydrationLog({ amount_ml: REQUIRED_ML });
    } finally {
      setLogging(false);
    }
  };

  const finish = () => {
    triggerHaptic();
    writeMorningTriad({ dateKey: keyForOffset(0), lightConfirmed: true });
    setLight(false);
    onUnlocked();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Morning check-in"
      grabHandleLabel="Dismiss morning check-in"
    >
      <div className="px-1 pb-4 pt-1">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-10 place-items-center rounded-(--radius-panel)"
            style={{
              background: `color-mix(in srgb, ${CATEGORY_COLORS.water} 20%, transparent)`,
              border: `0.5px solid color-mix(in srgb, ${CATEGORY_COLORS.water} 45%, transparent)`,
            }}
          >
            <Sun className="size-5" style={{ color: "var(--df-accent)" }} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-(--df-text-primary)">
              Anchor your morning first
            </h2>
            <p className="mt-0.5 text-xs text-(--df-text-muted)">
              The morning triad protects your focus window — two taps and you&apos;re in.
            </p>
          </div>
        </div>

        {/* 1 — hydration */}
        <button
          type="button"
          onClick={logWater}
          disabled={hydrated || logging}
          className="df-press mt-5 flex min-h-11 w-full items-center gap-3 rounded-(--radius-panel) px-3.5 py-2.5 text-left disabled:opacity-70"
          style={{
            background: hydrated
              ? `color-mix(in srgb, ${CATEGORY_COLORS.water} 16%, transparent)`
              : "var(--df-chip-fill)",
            border: `0.5px solid ${
              hydrated
                ? `color-mix(in srgb, ${CATEGORY_COLORS.water} 50%, transparent)`
                : "var(--df-chip-border)"
            }`,
          }}
          aria-pressed={hydrated}
        >
          <Droplet
            className="size-4 shrink-0"
            style={{ color: hydrated ? "var(--df-water-ink)" : "var(--df-text-muted)", fill: hydrated ? CATEGORY_COLORS.water : "transparent" }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-(--df-text-primary)">
              {hydrated ? "Hydration logged" : "Log a glass of water"}
            </span>
            <span className="mt-0.5 block text-[11px] text-(--df-text-muted)">
              {hydrated
                ? `${todayMl} ml today — anchor complete`
                : `${todayMl} ml today · ${REQUIRED_ML} ml unlocks the gate`}
            </span>
          </span>
          {hydrated ? (
            <Check className="size-4 shrink-0" style={{ color: "var(--df-summary-value)" }} />
          ) : (
            <Droplet className="size-3.5 shrink-0 opacity-40" style={{ color: CATEGORY_COLORS.water }} />
          )}
        </button>

        {/* 2 — light exposure */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic();
            setLight((v) => !v);
          }}
          aria-pressed={light}
          className="df-press mt-2.5 flex min-h-11 w-full items-center gap-3 rounded-(--radius-panel) px-3.5 py-2.5 text-left"
          style={{
            background: light
              ? "color-mix(in srgb, var(--df-accent) 14%, transparent)"
              : "var(--df-chip-fill)",
            border: light
              ? "0.5px solid color-mix(in srgb, var(--df-accent) 50%, transparent)"
              : "0.5px solid var(--df-chip-border)",
          }}
        >
          <Sun
            className="size-4 shrink-0"
            style={{ color: light ? "var(--df-accent)" : "var(--df-text-muted)" }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-(--df-text-primary)">
              I&apos;ve seen morning light
            </span>
            <span className="mt-0.5 block text-[11px] text-(--df-text-muted)">
              Outside or by a window — 2 minutes counts
            </span>
          </span>
          <span
            aria-hidden="true"
            className="grid size-5 shrink-0 place-items-center rounded-[6px]"
            style={{
              border: "1.5px solid " + (light ? "var(--df-accent)" : "var(--df-chip-border)"),
              background: light ? "var(--df-accent)" : "transparent",
            }}
          >
            {light && <Check className="size-3.5" style={{ color: "var(--df-white)" }} />}
          </span>
        </button>

        <button
          type="button"
          onClick={finish}
          disabled={!complete}
          className="df-press df-btn-primary mt-5 min-h-11 w-full rounded-(--radius-pill) text-sm font-semibold disabled:opacity-40"
        >
          Unlock Focus
        </button>
        <button
          type="button"
          onClick={onClose}
          className="df-press mt-2 min-h-11 w-full rounded-(--radius-pill) text-xs font-medium text-(--df-text-muted)"
        >
          Later — I&apos;ll stay out of Focus for now
        </button>
      </div>
    </Sheet>
  );
}
