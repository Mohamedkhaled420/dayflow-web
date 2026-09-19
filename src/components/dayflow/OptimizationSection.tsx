"use client";

// OptimizationSection — the body-optimization strip on the Daily view.
//
// For people who optimize: cross-links the three levers that actually
// move body composition and performance —
//   FUEL     calories in vs out (TDEE + active burn from training)
//   PROTEIN  total + g/kg body weight + the 2 h post-workout window
// RECOVERY  sleep vs target + hydration (training-day bonus)
//
// Body weight & daily burn live in profile.metabolism (bodyWeightKg /
// tdeeKcal — jsonb, no migration needed) and are editable inline via
// the Calibrate row. Everything else derives from logs the app
// already collects — meals, workouts, sleep, water.

import { useMemo, useState } from "react";
import { Check, Drumstick, Droplets, Flame, Gauge, MoonStar, Pencil } from "lucide-react";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useDayflowData } from "@/lib/viewmodel";
import { fmtDuration, nutritionForDay, sleepMinutes, waterTotal } from "@/lib/compute";
import { CATEGORY_COLORS } from "@/styles/palette";
import { DEFAULT_NUTRITION_TARGETS } from "@/lib/food-db";
import type { Json } from "@/types/supabase";
import { triggerHaptic, hapticSuccess } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";

const MEALS = CATEGORY_COLORS.meals;
const FITNESS = CATEGORY_COLORS.fitness;
const SLEEP = CATEGORY_COLORS.sleep;
const WATER = CATEGORY_COLORS.water;

const pad = (n: number) => String(n).padStart(2, "0");
const dayKeyOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtKcal = (n: number) => Math.round(n).toLocaleString("en-US");

export function OptimizationSection({ dateKey }: { dateKey: string }) {
  const data = useDayflowData();
  const mealLogs = useDayflowStore((s) => s.mealLogs);
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const profileRow = useDayflowStore((s) => s.profile);
  const updateProfileSections = useDayflowStore((s) => s.updateProfileSections);
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [tdeeInput, setTdeeInput] = useState("");
  const [saving, setSaving] = useState(false);

  const nutrition = useMemo(
    () => nutritionForDay(mealLogs, dateKey),
    [mealLogs, dateKey]
  );

  const sessions = useMemo(
    () =>
      workoutLogs
        .filter((r) => dayKeyOf(r.logged_at) === dateKey)
        .sort((a, b) => a.logged_at.localeCompare(b.logged_at)),
    [workoutLogs, dateKey]
  );
  const trained = sessions.some(
    (r) =>
      (Array.isArray(r.exercises) && r.exercises.length > 0) ||
      (r.duration_minutes ?? 0) > 0
  );
  const activeBurn = sessions.reduce((s, r) => s + (r.active_calories ?? 0), 0);

  // ---- profile.metabolism (jsonb) — defensive parse like DailyView ----
  const meta = useMemo(() => {
    const m =
      profileRow?.metabolism &&
      typeof profileRow.metabolism === "object" &&
      !Array.isArray(profileRow.metabolism)
        ? (profileRow.metabolism as Record<string, unknown>)
        : {};
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
    return {
      raw: m,
      calorieTarget: num(m.calorieTarget) ?? DEFAULT_NUTRITION_TARGETS.calorieTarget,
      proteinTargetG: num(m.proteinTargetG) ?? DEFAULT_NUTRITION_TARGETS.proteinTargetG,
      bodyWeightKg: num(m.bodyWeightKg),
      tdeeKcal: num(m.tdeeKcal),
    };
  }, [profileRow]);

  const needsCalibration = meta.bodyWeightKg == null || meta.tdeeKcal == null;

  // ---- energy balance ----
  const intake = nutrition.calories;
  const burn = (meta.tdeeKcal ?? meta.calorieTarget) + activeBurn;
  const net = intake - burn;
  const netLabel =
    Math.abs(net) < 100 ? "balanced" : net < 0 ? "deficit" : "surplus";
  const scale = Math.max(intake, burn, 1);

  // ---- protein ----
  const protein = nutrition.protein_g;
  const gPerKg = meta.bodyWeightKg ? protein / meta.bodyWeightKg : null;

  // post-workout protein window: ≥ 25 g within 2 h after the last session
  const postWorkout = useMemo(() => {
    const last = sessions[sessions.length - 1];
    if (!last) return null;
    const startMs = Date.parse(last.logged_at);
    const endMs = startMs + (last.duration_minutes ?? 45) * 60_000;
    const winEnd = endMs + 2 * 3_600_000;
    const best = nutrition.meals
      .filter((m) => {
        const t = Date.parse(m.logged_at);
        return t >= startMs - 15 * 60_000 && t <= winEnd && (m.protein_g ?? 0) >= 25;
      })
      .sort((a, b) => (b.protein_g ?? 0) - (a.protein_g ?? 0))[0];
    if (best) {
      return { state: "done" as const, label: `${best.protein_g} g · ${clock(Date.parse(best.logged_at))}` };
    }
    if (Date.now() < winEnd) {
      return { state: "open" as const, label: `window open until ${clock(winEnd)}` };
    }
    return { state: "missed" as const, label: "window closed for today" };
  }, [sessions, nutrition.meals]);

  // ---- recovery ----
  const sleepMin = sleepMinutes(data.events, dateKey);
  const sleepTarget = data.goals.sleepMinutes;
  const waterMl = waterTotal(data.water, dateKey);
  const waterGoalMl =
    (data.profile.waterGlassMl || 250) * data.goals.waterGlasses +
    (trained ? 500 : 0);

  const openEditor = () => {
    triggerHaptic();
    setWeightInput(meta.bodyWeightKg ? String(Math.round(meta.bodyWeightKg)) : "");
    setTdeeInput(meta.tdeeKcal ? String(Math.round(meta.tdeeKcal)) : "");
    setEditing(true);
  };

  const saveCalibration = async () => {
    const w = Number.parseFloat(weightInput);
    const t = Number.parseFloat(tdeeInput);
    if (!Number.isFinite(w) || w <= 0 || w > 400 || !Number.isFinite(t) || t < 800 || t > 8000) {
      toast({ title: "Check those numbers", description: "Weight in kg (30–400) and daily burn in kcal (800–8000)." });
      return;
    }
    setSaving(true);
    try {
      await updateProfileSections({
        metabolism: {
          ...meta.raw,
          bodyWeightKg: w,
          tdeeKcal: Math.round(t),
        } as unknown as Json,
      });
      hapticSuccess();
      toast({ title: "Calibrated", description: `Energy balance now uses ${Math.round(t)} kcal/day + training burn.` });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="mt-5 rounded-lg p-4"
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label="Body optimization"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="h-4 w-4 shrink-0" style={{ color: FITNESS }} />
          <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
            Body optimization
          </h2>
          <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
            fuel · training · recovery
          </span>
        </div>
        <button
          onClick={needsCalibration ? openEditor : () => setEditing((v) => !v)}
          className="df-press shrink-0 h-7 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1"
          style={{
            background: needsCalibration
              ? `color-mix(in srgb, ${FITNESS} 14%, transparent)`
              : "var(--df-chip-fill)",
            color: needsCalibration ? FITNESS : "var(--df-text-secondary)",
            border: `0.5px solid ${
              needsCalibration
                ? `color-mix(in srgb, ${FITNESS} 40%, transparent)`
                : "var(--df-chip-border)"
            }`,
          }}
        >
          {needsCalibration ? (
            "Calibrate"
          ) : (
            <>
              <Pencil className="h-3 w-3" />
              {editing ? "Close" : `${Math.round(meta.bodyWeightKg!)} kg`}
            </>
          )}
        </button>
      </div>

      {/* calibrate row — body weight + daily burn → energy math unlocks */}
      {editing && (
        <div
          className="mt-3 rounded-md px-3 py-2.5 flex items-end gap-2.5 flex-wrap"
          style={{ background: "var(--df-input-fill)", border: "0.5px solid var(--df-input-border)" }}
        >
          <label className="text-[11px] flex flex-col gap-1" style={{ color: "var(--df-text-secondary)" }}>
            Body weight (kg)
            <input
              type="number"
              inputMode="decimal"
              min={30}
              max={400}
              step={0.5}
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="72"
              className="h-9 w-28 px-2.5 rounded-md text-[13px] tabular-nums"
              style={{
                background: "var(--df-daily-grid-fill)",
                border: "0.5px solid var(--df-chip-border)",
                color: "var(--df-text-primary)",
              }}
            />
          </label>
          <label className="text-[11px] flex flex-col gap-1" style={{ color: "var(--df-text-secondary)" }}>
            Daily burn (kcal)
            <input
              type="number"
              inputMode="numeric"
              min={800}
              max={8000}
              step={10}
              value={tdeeInput}
              onChange={(e) => setTdeeInput(e.target.value)}
              placeholder="2400"
              className="h-9 w-28 px-2.5 rounded-md text-[13px] tabular-nums"
              style={{
                background: "var(--df-daily-grid-fill)",
                border: "0.5px solid var(--df-chip-border)",
                color: "var(--df-text-primary)",
              }}
            />
          </label>
          <button
            onClick={() => void saveCalibration()}
            disabled={saving}
            className="df-press df-btn-primary h-9 px-3.5 text-[12px] font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <p className="w-full text-[10.5px] leading-snug" style={{ color: "var(--df-text-muted)" }}>
            Daily burn = your maintenance (TDEE) before training — Dayflow adds workout
            calories on top automatically. Not sure? Start ~{" "}
            {meta.bodyWeightKg ? Math.round(meta.bodyWeightKg * 31) : 2200} kcal and adjust.
          </p>
        </div>
      )}

      {/* ENERGY */}
      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.07em] flex items-center gap-1.5"
            style={{ color: "var(--df-text-tertiary)" }}
          >
            <Flame className="h-3 w-3" style={{ color: MEALS }} />
            Energy
          </p>
          <p className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--df-text-secondary)" }}>
            {net === 0 ? "—" : `${net > 0 ? "+" : "−"}${fmtKcal(Math.abs(net))} kcal · ${netLabel}`}
          </p>
        </div>
        <div className="mt-1.5 flex flex-col gap-1.5">
          <EnergyBar
            label="Intake"
            value={intake}
            scale={scale}
            color={MEALS}
            suffix={
              meta.tdeeKcal == null && activeBurn === 0 ? ` / ${fmtKcal(meta.calorieTarget)} goal` : ""
            }
          />
          <EnergyBar
            label="Burn"
            value={burn}
            scale={scale}
            color={FITNESS}
            suffix={
              activeBurn > 0
                ? ` · ${fmtKcal(activeBurn)} from ${sessions.length} session${sessions.length > 1 ? "s" : ""}`
                : meta.tdeeKcal == null
                  ? " · set daily burn"
                  : ""
            }
            dashed
          />
        </div>
      </div>

      {/* PROTEIN */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.07em] flex items-center gap-1.5"
            style={{ color: "var(--df-text-tertiary)" }}
          >
            <Drumstick className="h-3 w-3" style={{ color: FITNESS }} />
            Protein
          </p>
          {gPerKg != null && (
            <p className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--df-text-secondary)" }}>
              {gPerKg.toFixed(1)} g/kg
            </p>
          )}
        </div>
        <div
          className="mt-1.5 h-[7px] rounded-full overflow-hidden"
          style={{ background: "var(--df-donut-ring-bg)" }}
          role="progressbar"
          aria-valuenow={Math.round(protein)}
          aria-valuemin={0}
          aria-valuemax={meta.proteinTargetG}
          aria-label={`Protein ${Math.round(protein)} of ${meta.proteinTargetG} grams`}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, (protein / meta.proteinTargetG) * 100)}%`,
              background: FITNESS,
              transition: "width .35s ease",
            }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] tabular-nums" style={{ color: "var(--df-text-muted)" }}>
            {Math.round(protein)} / {meta.proteinTargetG} g
          </p>
          {postWorkout ? (
            <p
              className="text-[11px] flex items-center gap-1 font-semibold"
              style={{
                color:
                  postWorkout.state === "done"
                    ? FITNESS
                    : postWorkout.state === "open"
                      ? MEALS
                      : "var(--df-text-muted)",
              }}
            >
              {postWorkout.state === "done" && <Check className="h-3 w-3" />}
              {postWorkout.state === "done"
                ? `Post-workout ${postWorkout.label}`
                : postWorkout.state === "open"
                  ? `Aim 30–40 g — ${postWorkout.label}`
                  : `Post-workout protein ${postWorkout.label}`}
            </p>
          ) : (
            <p className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
              Spread it across 3–4 meals
            </p>
          )}
        </div>
      </div>

      {/* RECOVERY */}
      <div className="mt-3.5 flex items-center gap-1.5 flex-wrap">
        <p
          className="text-[10.5px] font-bold uppercase tracking-[0.07em] flex items-center gap-1.5 mr-1"
          style={{ color: "var(--df-text-tertiary)" }}
        >
          <MoonStar className="h-3 w-3" style={{ color: SLEEP }} />
          Recovery
        </p>
        <span
          className="text-[11px] px-2 h-5 rounded-full flex items-center font-semibold tabular-nums"
          style={{
            background: `color-mix(in srgb, ${SLEEP} 12%, transparent)`,
            color: SLEEP,
          }}
        >
          {fmtDuration(sleepMin)} sleep · {fmtDuration(sleepTarget)} target
        </span>
        <span
          className="text-[11px] px-2 h-5 rounded-full flex items-center gap-1 font-semibold tabular-nums"
          style={{
            background: `color-mix(in srgb, ${WATER} 12%, transparent)`,
            color: WATER,
          }}
        >
          <Droplets className="h-3 w-3" />
          {(waterMl / 1000).toFixed(1)} L
          {trained && <span className="opacity-70">· +0.5 L training day</span>}
        </span>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
        Science anchors: protein 1.6–2.2 g/kg/day (Morton et al. 2018) · 30–40 g within
        2 h post-training · 7–9 h sleep for recovery &amp; body composition.
      </p>
    </section>
  );
}

function EnergyBar({
  label,
  value,
  scale,
  color,
  suffix,
  dashed,
}: {
  label: string;
  value: number;
  scale: number;
  color: string;
  suffix?: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="w-[48px] shrink-0 text-[11px] font-medium"
        style={{ color: "var(--df-text-secondary)" }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-[7px] rounded-full overflow-hidden"
        style={{ background: "var(--df-donut-ring-bg)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, (value / scale) * 100)}%`,
            background: dashed
              ? `repeating-linear-gradient(90deg, ${color} 0 8px, color-mix(in srgb, ${color} 45%, transparent) 8px 12px)`
              : color,
            transition: "width .35s ease",
          }}
        />
      </div>
      <span
        className="w-[128px] shrink-0 text-right text-[11px] tabular-nums truncate"
        style={{ color: "var(--df-text-muted)" }}
        title={`${fmtKcal(value)} kcal${suffix ?? ""}`}
      >
        {fmtKcal(value)} kcal{suffix}
      </span>
    </div>
  );
}
