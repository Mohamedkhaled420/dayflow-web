"use client";

// RoutineSheet — the AI routine builder (Phase 10).
//
// Two steps on top of /api/ai/workout-plan:
//
//   brief   goal / level / days / equipment / focus chips + optional
//           constraint notes. The brief ships with compact training
//           history (most-logged exercises, weekly volume) so plans
//           are personalized, not generic.
//   plan    the generated session, rendered like a coach wrote it:
//           title + focus line, "why this works" science card with
//           principle chips, warm-up, numbered exercise cards with
//           sets × reps / rest / RPE / cue notes / last-session
//           lines, cooldown, and a sticky footer — Start workout
//           (hands the plan to the gym logger pre-filled), Regenerate,
//           Tweak brief.
//
// Model attribution is honest (house rule): an "AI" plan shows the
// model that answered; the deterministic template floor shows
// "Coach template" instead of pretending.
//
// Shell + form discipline mirrors WorkoutSheet (keyed inner form,
// phone bottom sheet / desktop centered modal, df-* design system).

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Clock,
  Dumbbell,
  FlaskConical,
  Play,
  RefreshCw,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useToast } from "@/hooks/use-toast";
import { useIsPhone } from "@/hooks/use-media-query";
import { hapticSuccess, triggerHaptic } from "@/lib/haptics";
import { springSoft } from "@/lib/motion";
import { useDockHideRequest } from "@/hooks/use-dock-visibility";
import { useKeyboardTracking } from "@/components/ui/Sheet";
import { CATEGORY_COLORS } from "@/styles/palette";
import { ExerciseThumb } from "@/components/dayflow/workout/ExerciseThumb";
import { exerciseById } from "@/lib/exercise-db";
import {
  exerciseSummaries,
  fmtDaysAgo,
  parseExercises,
  recentExerciseNames,
  workoutStats,
  type ExerciseSummary,
} from "@/lib/workout";
import {
  ROUTINE_EQUIPMENT,
  ROUTINE_EQUIPMENT_LABELS,
  ROUTINE_FOCUS,
  ROUTINE_FOCUS_LABELS,
  ROUTINE_GOALS,
  ROUTINE_GOAL_LABELS,
  ROUTINE_LEVELS,
  ROUTINE_LEVEL_LABELS,
  planRestLabel,
  planSchemeLabel,
  type RoutineEquipment,
  type RoutineFocus,
  type RoutineGoal,
  type RoutineLevel,
  type RoutinePlan,
  type RoutinePlanReply,
} from "@/lib/routine";

const FITNESS = CATEGORY_COLORS.fitness;

const label = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Cycling status lines while the model thinks. */
const BUSY_HINTS = [
  "Reading your training history…",
  "Balancing volume and frequency…",
  "Applying progressive overload…",
  "Picking exercises that fit your gear…",
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Hands the plan to the gym logger (DailyView opens WorkoutSheet). */
  onStart: (plan: RoutinePlan) => void;
}

export function RoutineSheet({ open, onClose, onStart }: Props) {
  const isPhone = useIsPhone();
  // Overlay owns the bottom band while open (dock-avoidance Rule B):
  // the 92dvh phone sheet + its sticky CTA must never stack glass on
  // glass with the dock — the CTA band colliding with the nav bar is
  // exactly the reported mobile bug.
  useDockHideRequest("overlay:routine-sheet", open);
  return (
    <AnimatePresence>
      {open && <RoutineBuilder key="routine-builder" onClose={onClose} onStart={onStart} isPhone={isPhone} />}
    </AnimatePresence>
  );
}

function RoutineBuilder({
  onClose,
  onStart,
  isPhone,
}: {
  onClose: () => void;
  onStart: (plan: RoutinePlan) => void;
  isPhone: boolean;
}) {
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();
  // Software-keyboard tracking: writes the shared --keyboard-height
  // variable so the phone shell below rides ABOVE the keyboard
  // (the "Generate" CTA was hidden underneath it while typing).
  useKeyboardTracking();

  // ---- brief state ------------------------------------------------
  const [goal, setGoal] = useState<RoutineGoal>("muscle");
  const [level, setLevel] = useState<RoutineLevel>("intermediate");
  const [days, setDays] = useState(4);
  const [equipment, setEquipment] = useState<RoutineEquipment>("gym");
  const [focus, setFocus] = useState<RoutineFocus>("auto");
  const [notes, setNotes] = useState("");

  const [step, setStep] = useState<"brief" | "plan">("brief");
  const [busy, setBusy] = useState(false);
  const [busyHint, setBusyHint] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<RoutinePlanReply | null>(null);

  // ---- history context (personalization) --------------------------
  const historyCtx = useMemo(() => {
    const recent = recentExerciseNames(workoutLogs, 12).map((r) => r.name);
    const keys = new Set(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })
    );
    const dayKeyOf = (iso: string) => iso.slice(0, 10);
    let weekSessions = 0;
    let weekVolumeKg = 0;
    for (const r of workoutLogs) {
      if (!keys.has(dayKeyOf(r.logged_at))) continue;
      const exs = parseExercises(r.exercises ?? null);
      if (exs.length === 0) continue;
      weekSessions++;
      weekVolumeKg += workoutStats(exs).volumeKg;
    }
    return { recentExercises: recent, weekSessions, weekVolumeKg };
  }, [workoutLogs]);

  /** "Last: 60 kg × 8 · 5 d ago" lines on plan cards. */
  const summaries = useMemo(
    () => exerciseSummaries(workoutLogs),
    [workoutLogs]
  );

  // cycle the busy hint while generating
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setBusyHint((i) => (i + 1) % BUSY_HINTS.length), 2600);
    return () => clearInterval(t);
  }, [busy]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData.session?.access_token ?? null;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token ?? null;
      }
      if (!token) {
        setError("Sign in again — your session expired.");
        return;
      }
      const res = await fetch("/api/ai/workout-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          goal,
          level,
          daysPerWeek: days,
          equipment,
          focus,
          ...(notes.trim() ? { notes: notes.trim().slice(0, 300) } : {}),
          history: historyCtx,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | RoutinePlanReply
        | { code?: string; error?: string }
        | null;
      if (res.ok && body && "plan" in body) {
        setReply(body as RoutinePlanReply);
        setStep("plan");
        hapticSuccess();
        return;
      }
      const errBody = body as { code?: string; error?: string } | null;
      setError(
        errBody?.error ?? "Couldn't build a routine — try again in a moment."
      );
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  };

  const startWorkout = (plan: RoutinePlan) => {
    triggerHaptic();
    toast({
      title: "Routine loaded into the logger",
      description: `${plan.exercises.length} exercises · ${plan.exercises.reduce((n, e) => n + e.sets, 0)} sets — log as you lift`,
    });
    onStart(plan);
  };

  const totalSets = reply ? reply.plan.exercises.reduce((n, e) => n + e.sets, 0) : 0;

  const body = (
    <div className="flex flex-col min-h-0 flex-1">
      {/* header */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span
          className="h-9 w-9 rounded-[12px] grid place-items-center shrink-0"
          style={{
            background: `color-mix(in srgb, ${FITNESS} 15%, transparent)`,
            color: FITNESS,
          }}
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold" style={{ color: "var(--df-text-primary)" }}>
            AI routine builder
          </h2>
          <p className="text-[11px] truncate" style={{ color: "var(--df-text-muted)" }}>
            {step === "plan" && reply
              ? reply.source === "ai"
                ? `Science-based session · ${reply.model ?? "GLM"}`
                : "Science-based session · coach template"
              : "Science-backed sessions, built around your history"}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="df-press df-glass-chip shrink-0 h-8 w-8 grid place-items-center rounded-full"
          style={{ background: "var(--df-chip-fill)", color: "var(--df-text-secondary)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {step === "brief" ? (
        <div className="mt-3 flex flex-col min-h-0 flex-1 overflow-y-auto df-scroll -mx-1 px-1">
          <SectionLabel>Goal</SectionLabel>
          <ChipRow>
            {ROUTINE_GOALS.map((g) => (
              <Chip key={g} active={goal === g} onClick={() => { triggerHaptic(); setGoal(g); }}>
                {ROUTINE_GOAL_LABELS[g]}
              </Chip>
            ))}
          </ChipRow>

          <SectionLabel>Experience</SectionLabel>
          <ChipRow>
            {ROUTINE_LEVELS.map((l) => (
              <Chip key={l} active={level === l} onClick={() => { triggerHaptic(); setLevel(l); }}>
                {ROUTINE_LEVEL_LABELS[l]}
              </Chip>
            ))}
          </ChipRow>

          <SectionLabel>Days per week</SectionLabel>
          <ChipRow>
            {[2, 3, 4, 5, 6].map((d) => (
              <Chip key={d} active={days === d} onClick={() => { triggerHaptic(); setDays(d); }} wide>
                {d}
              </Chip>
            ))}
          </ChipRow>

          <SectionLabel>Equipment</SectionLabel>
          <ChipRow>
            {ROUTINE_EQUIPMENT.map((eq) => (
              <Chip key={eq} active={equipment === eq} onClick={() => { triggerHaptic(); setEquipment(eq); }}>
                {ROUTINE_EQUIPMENT_LABELS[eq]}
              </Chip>
            ))}
          </ChipRow>

          <SectionLabel>Today&apos;s focus</SectionLabel>
          <ChipRow>
            {ROUTINE_FOCUS.map((f) => (
              <Chip key={f} active={focus === f} onClick={() => { triggerHaptic(); setFocus(f); }}>
                {ROUTINE_FOCUS_LABELS[f]}
              </Chip>
            ))}
          </ChipRow>

          <SectionLabel>Anything to work around? <span className="opacity-60 normal-case tracking-normal">optional</span></SectionLabel>
          <div
            className="mt-1.5 rounded-full px-4 min-h-11 py-2.5 df-input-glass"
          >
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 300))}
              placeholder="e.g. left knee, no overhead press, hates running"
              aria-label="Constraints and preferences"
              className="w-full bg-transparent outline-none text-[13.5px]"
              style={{ color: "var(--df-text-primary)" }}
            />
          </div>

          {/* history context */}
          <div
            className="mt-3 rounded-[16px] px-3 py-2 flex items-center gap-2 text-[11px]"
            style={{
              background: "var(--df-input-fill)",
              color: "var(--df-text-muted)",
            }}
          >
            <Dumbbell className="h-3.5 w-3.5 shrink-0" style={{ color: FITNESS }} />
            <span className="truncate">
              {historyCtx.recentExercises.length > 0
                ? `Personalized with your history — ${historyCtx.recentExercises.length} exercises trained, ${historyCtx.weekSessions} session${historyCtx.weekSessions === 1 ? "" : "s"} this week`
                : "No gym history yet — the plan will start you off right"}
            </span>
          </div>

          {error && (
            <div
              className="mt-3 rounded-[14px] px-3 py-2.5 text-[12px]"
              style={{
                background: "color-mix(in srgb, var(--df-destructive-soft) 12%, transparent)",
                border: "0.5px solid color-mix(in srgb, var(--df-destructive-soft) 30%, transparent)",
                color: "var(--df-destructive-text)",
              }}
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="h-1 shrink-0" />

          {/* sticky footer */}
          <div className="df-sheet-footer sticky bottom-0 mt-auto pt-2.5 pb-1 -mx-1 px-1">
            <button
              onClick={() => void generate()}
              disabled={busy}
              className="df-press df-btn-primary df-btn-capsule w-full h-12 text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <motion.span
                    animate={reducedMotion ? undefined : { rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
                    className="grid place-items-center"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </motion.span>
                  {BUSY_HINTS[busyHint]}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate my routine
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        reply && (
          <PlanStep
            reply={reply}
            totalSets={totalSets}
            summaries={summaries}
            onBack={() => setStep("brief")}
            onRegenerate={() => {
              triggerHaptic();
              void generate();
            }}
            onStart={() => startWorkout(reply.plan)}
            busy={busy}
          />
        )
      )}
    </div>
  );

  return (
    <Scrim onClose={onClose}>
      {isPhone ? (
        <motion.div
          initial={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0.6 }}
          animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0.5 }}
          transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
          className="w-full rounded-t-[24px] overflow-hidden df-material flex flex-col"
          style={{
            height: "92dvh",
            /* Keyboard lift (shared --keyboard-height): the sheet
               rides above the software keyboard instead of leaving
               the CTA buried underneath it while typing. maxHeight
               shrinks the panel so it never runs off the top edge. */
            marginBottom: "var(--keyboard-height, 0px)",
            maxHeight: "calc(100dvh - var(--keyboard-height, 0px))",
            transition: "margin-bottom 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="mx-auto mt-2.5 mb-1 h-[5px] w-9 rounded-full shrink-0"
            style={{ background: "var(--df-chip-border)" }}
          />
          <div className="flex flex-col min-h-0 flex-1 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
            {body}
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
          transition={reducedMotion ? { duration: 0.18 } : springSoft}
          className="w-full max-w-[520px] rounded-2xl df-material flex flex-col"
          style={{ height: "min(82dvh, 720px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col min-h-0 flex-1 p-5">{body}</div>
        </motion.div>
      )}
    </Scrim>
  );
}

// ------------------------------------------------------ plan step ----

function PlanStep({
  reply,
  totalSets,
  summaries,
  onBack,
  onRegenerate,
  onStart,
  busy,
}: {
  reply: RoutinePlanReply;
  totalSets: number;
  summaries: ReadonlyMap<string, ExerciseSummary>;
  onBack: () => void;
  onRegenerate: () => void;
  onStart: () => void;
  busy: boolean;
}) {
  const plan = reply.plan;
  return (
    <div className="mt-3 flex flex-col min-h-0 flex-1 overflow-y-auto df-scroll -mx-1 px-1">
      {/* hero */}
      <div
        className="rounded-xl p-4 shrink-0"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${FITNESS} 14%, transparent), color-mix(in srgb, ${FITNESS} 4%, transparent))`,
          border: `0.5px solid color-mix(in srgb, ${FITNESS} 30%, transparent)`,
        }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[10px] font-bold px-2 h-5 rounded-full flex items-center gap-1"
            style={{
              background: `color-mix(in srgb, ${FITNESS} 16%, transparent)`,
              color: FITNESS,
            }}
          >
            <Sparkles className="h-3 w-3" />
            {reply.source === "ai" ? reply.model ?? "AI coach" : "Coach template"}
          </span>
          <span
            className="text-[10px] font-semibold px-2 h-5 rounded-full flex items-center"
            style={{ background: "var(--df-chip-fill)", color: "var(--df-text-secondary)" }}
          >
            {ROUTINE_GOAL_LABELS[plan.goal]}
          </span>
          {plan.focus !== "auto" && (
            <span
              className="text-[10px] font-semibold px-2 h-5 rounded-full flex items-center"
              style={{ background: "var(--df-chip-fill)", color: "var(--df-text-secondary)" }}
            >
              {ROUTINE_FOCUS_LABELS[plan.focus]}
            </span>
          )}
        </div>
        <h3
          className="mt-2 text-[17px] font-bold leading-snug"
          style={{ color: "var(--df-text-primary)" }}
        >
          {plan.title}
        </h3>
        {plan.focusSummary && (
          <p className="text-[12px] mt-0.5" style={{ color: "var(--df-text-secondary)" }}>
            {plan.focusSummary}
          </p>
        )}
        <div
          className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold flex-wrap"
          style={{ color: "var(--df-text-muted)" }}
        >
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />~{plan.estMinutes} min
          </span>
          <span className="opacity-40">·</span>
          <span className="flex items-center gap-1">
            <Dumbbell className="h-3 w-3" />
            {plan.exercises.length} exercises
          </span>
          <span className="opacity-40">·</span>
          <span className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {totalSets} sets
          </span>
        </div>
      </div>

      {/* science card */}
      {plan.science && (
        <div
          className="mt-2.5 rounded-[16px] p-3.5 shrink-0"
          style={{
            background: "var(--df-daily-grid-fill)",
            border: "0.5px solid var(--df-chip-border)",
          }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-[0.06em] flex items-center gap-1.5"
            style={{ color: "var(--df-text-secondary)" }}
          >
            <FlaskConical className="h-3 w-3" style={{ color: FITNESS }} />
            Why this works
          </p>
          <p
            className="mt-1.5 text-[12px] leading-relaxed"
            style={{ color: "var(--df-text-secondary)" }}
          >
            {plan.science}
          </p>
          {plan.principles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plan.principles.map((p) => (
                <span
                  key={p}
                  className="text-[10px] font-semibold px-2 h-5 rounded-full flex items-center"
                  style={{
                    background: `color-mix(in srgb, ${FITNESS} 10%, transparent)`,
                    color: FITNESS,
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* warm-up */}
      {plan.warmup.length > 0 && (
        <MiniList title="Warm-up" items={plan.warmup} accent />
      )}

      {/* exercises */}
      <div className="mt-2.5 flex flex-col gap-2">
        {plan.exercises.map((ex, i) => {
          const last = summaries.get(ex.n);
          return (
            <div
              key={ex.id}
              className="rounded-xl p-3"
              style={{
                background: "var(--df-daily-grid-fill)",
                border:
                  i === 0
                    ? `0.5px solid color-mix(in srgb, ${FITNESS} 40%, transparent)`
                    : "0.5px solid var(--df-chip-border)",
              }}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="shrink-0 h-7 w-7 grid place-items-center rounded-full text-[11.5px] font-bold tabular-nums"
                  style={{
                    background:
                      i === 0
                        ? `color-mix(in srgb, ${FITNESS} 18%, transparent)`
                        : "var(--df-chip-fill)",
                    color: i === 0 ? FITNESS : "var(--df-text-muted)",
                  }}
                >
                  {i + 1}
                </span>
                <ExerciseThumb
                  name={ex.n}
                  bodyPart={exerciseById(ex.id)?.bodyPart ?? null}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[13.5px] font-bold leading-tight"
                    style={{ color: "var(--df-text-primary)" }}
                  >
                    {ex.n}
                  </p>
                  <p
                    className="text-[10.5px] mt-0.5 truncate"
                    style={{ color: "var(--df-text-muted)" }}
                  >
                    {[ex.t, ex.e].filter(Boolean).map(label).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className="text-[13px] font-bold tabular-nums"
                    style={{ color: FITNESS }}
                  >
                    {planSchemeLabel(ex)}
                  </p>
                  <p
                    className="text-[10px] mt-0.5 tabular-nums"
                    style={{ color: "var(--df-text-muted)" }}
                  >
                    Rest {planRestLabel(ex.restSec)}
                    {ex.rpe != null ? ` · RPE ${ex.rpe}` : ""}
                  </p>
                </div>
              </div>
              {ex.note && (
                <p
                  className="mt-1.5 text-[11px] leading-snug italic"
                  style={{ color: "var(--df-text-secondary)" }}
                >
                  {ex.note}
                </p>
              )}
              {last && (
                <p
                  className="mt-1 text-[10.5px] flex items-center gap-1"
                  style={{ color: "var(--df-text-muted)" }}
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  Last: {last.lastLine} · {fmtDaysAgo(last.lastDate)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* cooldown */}
      {plan.cooldown.length > 0 && <MiniList title="Cool-down" items={plan.cooldown} />}

      <p
        className="mt-3 text-[10.5px] leading-relaxed shrink-0"
        style={{ color: "var(--df-text-muted)" }}
      >
        {reply.source === "ai"
          ? "AI-generated plan — adjust loads to how you feel, keep good form, and stop if anything hurts."
          : "Coach template — adjust loads to how you feel, keep good form, and stop if anything hurts."}
      </p>

      <div className="h-1 shrink-0" />

      {/* sticky footer */}
      <div className="df-sheet-footer sticky bottom-0 mt-auto pt-2.5 pb-1 -mx-1 px-1">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="df-press df-btn-secondary df-btn-capsule h-11 px-3.5 text-[12.5px] font-semibold shrink-0"
          >
            Tweak
          </button>
          <button
            onClick={onRegenerate}
            disabled={busy}
            aria-label="Generate another routine"
            className="df-press df-btn-secondary df-btn-capsule h-11 w-11 grid place-items-center shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onStart}
            className="df-press df-btn-primary df-btn-capsule flex-1 h-11 px-4 text-[13px] font-semibold flex items-center justify-center gap-1.5"
          >
            <Play className="h-4 w-4" />
            Start workout
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniList({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div
      className="mt-2.5 rounded-[16px] px-3.5 py-3 shrink-0"
      style={{
        background: "var(--df-input-fill)",
        border: "0.5px solid var(--df-input-border)",
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.06em]"
        style={{ color: accent ? FITNESS : "var(--df-text-secondary)" }}
      >
        {title}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((item, i) => (
          <li
            key={i}
            className="text-[11.5px] flex items-start gap-2"
            style={{ color: "var(--df-text-secondary)" }}
          >
            <span
              className="mt-[5px] h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: accent ? FITNESS : "var(--df-text-muted)" }}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------ controls ----

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-[18px] first:mt-1 text-[10px] font-bold uppercase tracking-[0.06em] shrink-0"
      style={{ color: "var(--df-text-secondary)" }}
    >
      {children}
    </p>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-1.5 shrink-0">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
  wide,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`df-press df-glass-chip h-9 rounded-full text-[12px] font-semibold ${wide ? "min-w-11" : "px-3.5"}`}
      style={
        active
          ? {
              background: `color-mix(in srgb, ${FITNESS} 15%, transparent)`,
              border: `1px solid color-mix(in srgb, ${FITNESS} 45%, transparent)`,
              color: FITNESS,
              boxShadow:
                "inset 0 1px 0 var(--df-glass-sheen), 0 1px 8px color-mix(in srgb, " +
                FITNESS +
                " 22%, transparent)",
            }
          : {
              background: "var(--df-chip-fill)",
              border: "1px solid var(--df-chip-border)",
              color: "var(--df-text-secondary)",
            }
      }
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------- shells ----

function Scrim({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[70] flex justify-center p-0 sm:p-4 items-end sm:items-center"
      style={{
        background: "var(--df-scrim)",
        backdropFilter: "blur(3px)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Build an AI workout routine"
    >
      {children}
    </motion.div>
  );
}
