"use client";

// DailyView — the day at a glance: per-category activity grid
// (when you worked, trained, ate, slept) plus an auto-written
// daily recap you can copy anywhere. Ported from the native
// "Daily" view; the standup card becomes a personal recap.

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Copy, Plus, ScanLine, Sparkles, TriangleAlert, Utensils, X } from "lucide-react";
import { useDayflowData } from "@/lib/viewmodel";
import { LOGGABLE_CATEGORIES } from "@/lib/viewmodel";
import { keyForOffset, keyToDate } from "@/lib/seed";
import {
  fmtDuration,
  goalsForDay,
  minutesForCategory,
  nutritionForDay,
  recapForDay,
  toMinutes,
  waterTotal,
  eventsForDay,
} from "@/lib/compute";
import { useDayflowStore, type MealLogRow } from "@/store/useDayflowStore";
import { MealCaptureSheet } from "@/components/dayflow/MealCaptureSheet";
import { SleepSection } from "@/components/dayflow/SleepSection";
import { OptimizationSection } from "@/components/dayflow/OptimizationSection";
import { WorkoutSheet, type WorkoutEditTarget, type WorkoutPrefill } from "@/components/dayflow/workout/WorkoutSheet";
import { TrainingSection } from "@/components/dayflow/workout/TrainingSection";
import { RoutineSheet } from "@/components/dayflow/workout/RoutineSheet";
import { DoodleSun } from "@/components/dayflow/doodles";
import { planToSession, type RoutinePlan } from "@/lib/routine";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_COLORS, MACRO_COLORS } from "@/styles/palette";
import { DEFAULT_NUTRITION_TARGETS, type NutritionTargets } from "@/lib/food-db";

const GRID_START = 5 * 60; // 5 AM
const GRID_END = 23 * 60 + 30; // 11:30 PM
const SLOT = 30;
const SLOTS = (GRID_END - GRID_START) / SLOT; // 37

export function DailyView() {
  const data = useDayflowData();
  const categories = LOGGABLE_CATEGORIES;
  const { toast } = useToast();
  const [dayOffset, setDayOffset] = useState(0);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [mealSheetOpen, setMealSheetOpen] = useState(false);
  const [workoutSheetOpen, setWorkoutSheetOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutEditTarget | null>(null);
  const [routineSheetOpen, setRoutineSheetOpen] = useState(false);
  const [workoutPrefill, setWorkoutPrefill] = useState<WorkoutPrefill | null>(null);

  const mealLogs = useDayflowStore((s) => s.mealLogs);
  const deleteMealLog = useDayflowStore((s) => s.deleteMealLog);
  const profileRow = useDayflowStore((s) => s.profile);

  const dateKey = keyForOffset(dayOffset);
  const date = keyToDate(dateKey);
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const goals = useMemo(() => goalsForDay(data, dateKey), [data, dateKey]);
  const recap = useMemo(() => recapForDay(data, dateKey), [data, dateKey]);
  const nutrition = useMemo(() => nutritionForDay(mealLogs, dateKey), [mealLogs, dateKey]);

  // Targets live in the profile metabolism section when set (Phase 9
  // settings follow-up); otherwise the food-db defaults apply.
  const targets = useMemo<NutritionTargets>(() => {
    const meta =
      profileRow?.metabolism &&
      typeof profileRow.metabolism === "object" &&
      !Array.isArray(profileRow.metabolism)
        ? (profileRow.metabolism as Record<string, unknown>)
        : {};
    const n = (v: unknown, d: number) =>
      typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : d;
    return {
      calorieTarget: n(meta.calorieTarget, DEFAULT_NUTRITION_TARGETS.calorieTarget),
      proteinTargetG: n(meta.proteinTargetG, DEFAULT_NUTRITION_TARGETS.proteinTargetG),
      carbTargetG: n(meta.carbTargetG, DEFAULT_NUTRITION_TARGETS.carbTargetG),
      fatTargetG: n(meta.fatTargetG, DEFAULT_NUTRITION_TARGETS.fatTargetG),
    };
  }, [profileRow]);

  // category rows → set of active 30-min slots
  const rows = useMemo(() => {
    const timeCats = categories.filter((c) => c.kind === "time");
    return timeCats.map((c) => {
      const acts = eventsForDay(data.events, dateKey).filter((e) => e.categoryId === c.id);
      const slots = new Set<number>();
      for (const e of acts) {
        let s = toMinutes(e.start);
        let t = toMinutes(e.end);
        if (t <= s) {
          // overnight (sleep): morning part 0–end and evening part start–24h
          slots.add(0);
          s = GRID_START;
        }
        const from = Math.max(s, GRID_START);
        const to = Math.min(t, GRID_END);
        for (let m = Math.ceil(from / SLOT) * SLOT; m < to; m += SLOT) slots.add(m);
      }
      return { category: c, slots };
    });
  }, [categories, data.events, dateKey]);

  const waterMl = waterTotal(data.water, dateKey);
  const waterGoal = goals.find((g) => g.key === "water")!;

  const recapText = useMemo(() => {
    const done = recap.focus.filter((_, i) => checked[i]);
    const pending = recap.focus.filter((_, i) => !checked[i]);
    return [
      `Dayflow recap — ${dateLabel}`,
      "",
      "Highlights:",
      ...recap.highlights.map((h) => `- ${h}`),
      "",
      "Next up:",
      ...pending.map((p) => `- [ ] ${p}`),
      ...done.map((p) => `- [x] ${p}`),
      "",
      "Watch-outs:",
      ...(recap.watchouts.length ? recap.watchouts.map((w) => `- ${w}`) : ["- None"]),
    ].join("\n");
  }, [recap, checked, dateLabel]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recapText);
      toast({ title: "Daily recap copied" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard was denied." });
    }
  };

  return (
    <div className="df-daily-view df-scroll h-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto px-4 sm:px-6 py-5 lg:mx-auto lg:w-full lg:max-w-[1060px]">
      {/* header */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDayOffset((o) => Math.max(-13, o - 1))}
              disabled={dayOffset <= -13}
              aria-label="Previous day"
              className="df-press w-7 h-7 rounded-full grid place-items-center disabled:opacity-35"
              style={{ color: "var(--df-text-primary)" }}
            >
              ←
            </button>
            <h1
              className="flex items-center gap-2 text-[21px] font-bold tracking-tight"
              style={{ color: "var(--df-text-primary)" }}
            >
              {dateLabel}
              <DoodleSun className="h-5 w-5 rotate-12" />
            </h1>
            <button
              onClick={() => setDayOffset((o) => Math.min(0, o + 1))}
              disabled={dayOffset >= 0}
              aria-label="Next day"
              className="df-press w-7 h-7 rounded-full grid place-items-center disabled:opacity-35"
              style={{ color: "var(--df-text-primary)" }}
            >
              →
            </button>
          </div>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--df-text-secondary)" }}>
            {dayOffset === 0
              ? "Today so far — come back tonight for the full picture."
              : "A full day, broken down by category."}
          </p>
        </div>
        <button
          onClick={copy}
          className="df-press df-btn-secondary h-8 px-3 text-[12px] font-semibold flex items-center gap-1.5"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy recap
        </button>
      </div>

      {/* stat strip */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatTile label="Sleep" value={fmtDuration(goals.find((g) => g.key === "sleep")!.done)} />
        <StatTile label="Work" value={fmtDuration(minutesForCategory(data.events, dateKey, "work"))} />
        <StatTile
          label="Personal"
          value={fmtDuration(minutesForCategory(data.events, dateKey, "personal"))}
        />
        <StatTile label="Fitness" value={fmtDuration(goals.find((g) => g.key === "fitness")!.done)} />
        <StatTile
          label="Water"
          value={`${waterMl ? Math.round((waterMl / (data.profile.waterGlassMl || 250)) * 10) / 10 : 0} gl`}
          sub={`${waterMl} ml`}
        />
        <StatTile
          label="Calories"
          value={`${nutrition.calories}`}
          sub={`of ${targets.calorieTarget} kcal`}
        />
      </div>

      {/* sleep — last night over the flowing string waves */}
      <SleepSection dateKey={dateKey} />

      {/* nutrition — Cal AI-style calories & macros (Phase 9) */}
      <section
        className="mt-5 rounded-[20px] p-4"
        style={{
          background: "var(--df-daily-grid-fill)",
          border: "0.5px solid var(--df-daily-grid-border)",
        }}
        aria-label="Nutrition"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Utensils className="h-4 w-4" style={{ color: CATEGORY_COLORS.meals }} />
            <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
              Nutrition
            </h2>
            <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
              {dayOffset === 0 ? "today" : dateLabel.split(", ")[0]}
            </span>
          </div>
          <button
            onClick={() => setMealSheetOpen(true)}
            className="df-press df-btn-secondary h-8 px-3 text-[12px] font-semibold flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Log meal
          </button>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-5">
          {/* calorie ring */}
          <CalorieRing consumed={nutrition.calories} target={targets.calorieTarget} />

          {/* macro bars */}
          <div className="flex-1 min-w-0 grid gap-2.5">
            <MacroBar
              label="Protein"
              color={MACRO_COLORS.protein}
              value={nutrition.protein_g}
              target={targets.proteinTargetG}
              unit="g"
            />
            <MacroBar
              label="Carbs"
              color={MACRO_COLORS.carbs}
              value={nutrition.carbs_g}
              target={targets.carbTargetG}
              unit="g"
            />
            <MacroBar
              label="Fat"
              color={MACRO_COLORS.fat}
              value={nutrition.fat_g}
              target={targets.fatTargetG}
              unit="g"
            />
          </div>
        </div>

        {/* meals list */}
        <div className="mt-4">
          {nutrition.meals.length === 0 ? (
            <button
              onClick={() => setMealSheetOpen(true)}
              className="df-press w-full rounded-[20px] py-4 flex flex-col items-center gap-1.5"
              style={{
                background: "var(--df-input-fill)",
                border: `1.5px dashed color-mix(in srgb, ${CATEGORY_COLORS.meals} 40%, transparent)`,
              }}
            >
              <ScanLine className="h-5 w-5" style={{ color: CATEGORY_COLORS.meals }} />
              <span className="text-[12px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
                Snap a photo, describe it, or type it in
              </span>
              <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
                AI estimates calories & macros — you confirm before it's logged
              </span>
            </button>
          ) : (
            <div className="flex flex-col gap-1">
              {nutrition.meals.map((m) => (
                <MealRow key={m.id} meal={m} onDelete={() => void deleteMealLog(m.id)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* training — gym logger sessions (Phase 10) */}
      <TrainingSection
        dateKey={dateKey}
        onLogWorkout={() => {
          setEditingWorkout(null);
          setWorkoutPrefill(null);
          setWorkoutSheetOpen(true);
        }}
        onEditWorkout={(row) => {
          setEditingWorkout(row);
          setWorkoutPrefill(null);
          setWorkoutSheetOpen(true);
        }}
        onGenerateRoutine={() => setRoutineSheetOpen(true)}
      />

      {/* body optimization — fuel ↔ training ↔ recovery */}
      <OptimizationSection dateKey={dateKey} />

      <div className="mt-5 grid xl:grid-cols-[1fr_360px] gap-4">
        {/* category activity grid */}
        <section
          className="rounded-[20px] p-4"
          style={{
            background: "var(--df-daily-grid-fill)",
            border: "0.5px solid var(--df-daily-grid-border)",
          }}
          aria-label="Category activity grid"
        >
          <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
            Your day by category
          </h2>
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--df-text-muted)" }}>
            30-minute slots, 5 AM – 11:30 PM
          </p>
          <div className="mt-3 overflow-x-auto df-scroll">
            <div className="min-w-[480px]">
              {/* hour header: label every 2 hours = 4 slots */}
              <div
                className="grid mb-1.5 pl-[110px] text-[10px] font-semibold"
                style={{ gridTemplateColumns: `repeat(${SLOTS}, 16px)`, gap: "3px" }}
              >
                {Array.from({ length: Math.ceil(SLOTS / 4) }, (_, i) => {
                  const h = GRID_START / 60 + i * 2;
                  const span = Math.min(4, SLOTS - i * 4);
                  return (
                    <span
                      key={i}
                      style={{
                        gridColumn: `span ${span}`,
                        textAlign: "center",
                        color: "var(--df-hour-label)",
                      }}
                    >
                      {h >= 24 ? "" : h > 12 ? `${h - 12}p` : `${h}a`}
                    </span>
                  );
                })}
              </div>
              <div className="flex flex-col gap-[3px]">
                {rows.map((row) => (
                  <div key={row.category.id} className="flex items-center gap-2">
                    <span
                      className="w-[110px] shrink-0 text-right text-[11px] font-medium truncate pr-1"
                      style={{ color: "var(--df-text-secondary)" }}
                      title={row.category.name}
                    >
                      {row.category.name}
                    </span>
                    <div
                      className="grid gap-[3px]"
                      style={{ gridTemplateColumns: `repeat(${SLOTS}, 16px)` }}
                    >
                      {Array.from({ length: SLOTS }, (_, i) => {
                        const slotMin = GRID_START + i * SLOT;
                        const active = row.slots.has(slotMin);
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.006, duration: 0.18 }}
                            className="h-4 w-4 rounded-[3px]"
                            style={{
                              background: active
                                ? row.category.colorHex
                                : "var(--df-daily-empty)",
                              border: active
                                ? `0.5px solid color-mix(in srgb, ${row.category.colorHex} 55%, transparent)`
                                : "0.5px solid color-mix(in srgb, var(--df-text-muted) 25%, transparent)",
                            }}
                            title={`${row.category.name} · ${
                              Math.floor(slotMin / 60) > 12
                                ? `${Math.floor(slotMin / 60) - 12}`
                                : `${Math.floor(slotMin / 60)}`
                            }:${slotMin % 60 === 0 ? "00" : "30"} ${
                              slotMin >= 720 ? "PM" : "AM"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="mt-3 flex items-center gap-2 text-[10px]"
                style={{ color: "var(--df-text-muted)" }}
              >
                {/* mirrors the row structure (110px label + gap) so the
                    swatch column-aligns with the slot grid */}
                <span className="w-[110px] shrink-0 pr-1 text-right">water</span>
                <span
                  className="h-3 w-3 rounded-[2px]"
                  style={{
                    background:
                      waterGoal.met ? CATEGORY_COLORS.water : `color-mix(in srgb, ${CATEGORY_COLORS.water} 35%, transparent)`,
                  }}
                />
                <span>
                  {waterGoal.done.toFixed(0)}/{waterGoal.target} glasses {waterGoal.met ? "· goal met" : ""}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* daily recap card */}
        <section
          className="rounded-[20px] p-4 relative overflow-hidden"
          style={{
            border: "0.5px solid var(--df-daily-grid-border)",
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, var(--df-summary-card-fill) 75%, transparent), transparent)",
          }}
          aria-label="Daily recap"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--df-accent)" }} />
            <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
              Recap — {dayOffset === 0 ? "today" : dateLabel.split(", ")[0]}
            </h2>
          </div>

          <RecapSection title="Highlights">
            {recap.highlights.map((h, i) => (
              <Bullet key={i} text={h} />
            ))}
          </RecapSection>

          <RecapSection title="Next up">
            {recap.focus.map((p, i) => (
              <button
                key={i}
                onClick={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
                className="df-press flex items-start gap-2 text-left w-full rounded-[12px] px-1.5 py-1 -mx-1.5"
                aria-pressed={!!checked[i]}
              >
                <CheckCircle2
                  className="h-[15px] w-[15px] mt-[1.5px] shrink-0"
                  style={{
                    color: checked[i] ? "var(--df-accent)" : "var(--df-text-muted)",
                  }}
                />
                <span
                  className="text-[12px] leading-snug"
                  style={{
                    color: checked[i] ? "var(--df-text-muted)" : "var(--df-text-secondary)",
                    textDecoration: checked[i] ? "line-through" : "none",
                  }}
                >
                  {p}
                </span>
              </button>
            ))}
          </RecapSection>

          <RecapSection title="Watch-outs">
            {recap.watchouts.length ? (
              recap.watchouts.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-[12px] px-2 py-1.5"
                  style={{
                    background: "color-mix(in srgb, var(--df-destructive-soft) 12%, transparent)",
                    border: "0.5px solid color-mix(in srgb, var(--df-destructive-soft) 30%, transparent)",
                  }}
                >
                  <TriangleAlert
                    className="h-[15px] w-[15px] mt-[1px] shrink-0"
                    style={{ color: "var(--df-destructive-text)" }}
                  />
                  <span
                    className="text-[12px] leading-snug"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
                    {w}
                  </span>
                </div>
              ))
            ) : (
              <Bullet text="None — every goal within reach." muted />
            )}
          </RecapSection>
        </section>
      </div>

      <MealCaptureSheet open={mealSheetOpen} onClose={() => setMealSheetOpen(false)} dateKey={dateKey} />
      <WorkoutSheet
        open={workoutSheetOpen}
        onClose={() => {
          setWorkoutSheetOpen(false);
          setEditingWorkout(null);
          setWorkoutPrefill(null);
        }}
        dateKey={dateKey}
        editing={editingWorkout}
        prefill={workoutPrefill}
      />
      <RoutineSheet
        open={routineSheetOpen}
        onClose={() => setRoutineSheetOpen(false)}
        onStart={(plan: RoutinePlan) => {
          // hand the routine to the gym logger, prefilled
          setWorkoutPrefill({
            key: crypto.randomUUID(),
            title: plan.title,
            exercises: planToSession(plan),
            durationMinutes: plan.estMinutes,
          });
          setEditingWorkout(null);
          setRoutineSheetOpen(false);
          setWorkoutSheetOpen(true);
        }}
      />
    </div>
  );
}

/** Compact calorie ring: consumed vs target, amber when over. */
function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const pct = Math.min(1, target > 0 ? consumed / target : 0);
  const over = consumed > target;
  const size = 108;
  const thickness = 10;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0 grid place-items-center self-center" role="img" aria-label={`${consumed} of ${target} kcal`}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--df-donut-ring-bg)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? "var(--df-destructive-text)" : CATEGORY_COLORS.meals}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${(c * pct).toFixed(1)} ${c.toFixed(1)}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray .35s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
        <div>
          <div className="text-[17px] font-bold leading-none tabular-nums" style={{ color: "var(--df-summary-value)" }}>
            {/* Over budget, the useful number is HOW FAR over (1014),
                not a clamped 0 — "0 over" reads as broken. */}
            {over ? Math.round(consumed - target) : Math.max(0, target - consumed)}
          </div>
          <div className="text-[9.5px] font-semibold uppercase tracking-wide mt-1" style={{ color: over ? "var(--df-destructive-text)" : "var(--df-text-muted)" }}>
            {over ? "over" : "kcal left"}
          </div>
        </div>
      </div>
    </div>
  );
}

function MacroBar({
  label,
  color,
  value,
  target,
  unit,
}: {
  label: string;
  color: string;
  value: number;
  target: number;
  unit: string;
}) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[52px] shrink-0 text-[11px] font-medium" style={{ color: "var(--df-text-secondary)" }}>
        {label}
      </span>
      <div
        className="flex-1 h-[7px] rounded-full overflow-hidden"
        style={{ background: "var(--df-donut-ring-bg)" }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${label} ${value} of ${target}${unit}`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: color,
            transition: "width .35s ease",
          }}
        />
      </div>
      <span className="w-[72px] shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--df-text-muted)" }}>
        {value}/{target}{unit}
      </span>
    </div>
  );
}

function MealRow({ meal, onDelete }: { meal: MealLogRow; onDelete: () => void }) {
  const time = new Date(meal.logged_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div
      className="group flex items-center gap-2.5 rounded-[12px] px-2 py-1.5"
      style={{ background: "var(--df-input-fill)" }}
    >
      <span
        className="shrink-0 h-7 w-7 rounded-[9px] grid place-items-center"
        style={{
          background: `color-mix(in srgb, ${CATEGORY_COLORS.meals} 15%, transparent)`,
          color: CATEGORY_COLORS.meals,
        }}
      >
        <Utensils className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold truncate" style={{ color: "var(--df-text-primary)" }}>
          {meal.name}
        </span>
        <span className="block text-[10.5px] tabular-nums" style={{ color: "var(--df-text-muted)" }}>
          {time}
          {meal.protein_g != null && ` · P ${meal.protein_g}g`}
          {meal.carbs_g != null && ` C ${meal.carbs_g}g`}
          {meal.fat_g != null && ` F ${meal.fat_g}g`}
          {meal.source === "ai" && " · AI"}
        </span>
      </span>
      <span className="shrink-0 text-[12.5px] font-bold tabular-nums" style={{ color: "var(--df-summary-value)" }}>
        {meal.calories}
      </span>
      <button
        onClick={onDelete}
        aria-label={`Delete ${meal.name}`}
        className="df-press shrink-0 h-7 w-7 rounded-full grid place-items-center opacity-60 hover:opacity-100"
        style={{ color: "var(--df-destructive-text)" }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RecapSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h3
        className="text-[10.5px] font-bold uppercase tracking-[0.07em] mb-1.5"
        style={{ color: "var(--df-text-tertiary)" }}
      >
        {title}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Bullet({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className="mt-[6px] w-[4.5px] h-[4.5px] rounded-full shrink-0"
        style={{ background: muted ? "var(--df-text-muted)" : "var(--df-accent)" }}
      />
      <span
        className="text-[12px] leading-snug"
        style={{
          color: muted ? "var(--df-text-muted)" : "var(--df-text-secondary)",
        }}
      >
        {text}
      </span>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="df-summary-card px-3 py-2.5">
      <div
        className="text-[17px] font-bold leading-none"
        style={{ color: "var(--df-summary-value)" }}
      >
        {value}
      </div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wide mt-1.5"
        style={{ color: "var(--df-text-muted)" }}
      >
        {label}
      </div>
      {sub && (
        <div className="text-[9.5px] mt-0.5 tabular-nums" style={{ color: "var(--df-text-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
