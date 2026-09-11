"use client";

// ============================================================
// Dayflow AI — Diagnostic Onboarding (Phase 2 / PRD §4.1)
// ------------------------------------------------------------
// 3-step survey (<90s): Identity → Chronobiology (MCTQ-style) →
// Goals. Final submit UPDATEs the profiles row with the four
// JSONB sections (chronobiology / occupational_context /
// psychology / metabolism) + identity. Skipped questions fall
// back to PRD §4.1 defaults (intermediate chronotype).
//
// Styling: ONLY tokens from src/styles/theme.css, composed via
// the GlassPanel + Segmented primitives (DESIGN.md contract).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Check,
  Compass,
  Laptop,
  Leaf,
  MapPin,
  Moon,
  Rocket,
  Sun,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Segmented } from "@/components/ui/Segmented";
import { createClient } from "@/utils/supabase/client";
import { enrollPasskey, passkeysSupported } from "@/lib/passkeys";

// ---------- constants ----------

const SLEEP_OPTIONS = [
  { id: "420", label: "7h" },
  { id: "450", label: "7.5h" },
  { id: "480", label: "8h" },
  { id: "540", label: "9h" },
] as const;

const CAREER_OPTIONS = [
  { id: "120", label: "2h" },
  { id: "180", label: "3h" },
  { id: "240", label: "4h" },
  { id: "300", label: "5h" },
] as const;

const CRAFT_OPTIONS = [
  { id: "30", label: "30m" },
  { id: "60", label: "1h" },
  { id: "90", label: "90m" },
  { id: "120", label: "2h" },
] as const;

const STATUS_OPTIONS = [
  { id: "employed_structured", label: "Structured job", icon: Briefcase },
  { id: "freelance_flexible", label: "Freelance", icon: Laptop },
  { id: "self_directed_job_seeker", label: "Job seeker", icon: Compass },
  { id: "founder_builder", label: "Founder", icon: Rocket },
  { id: "sabbatical", label: "Sabbatical", icon: Leaf },
] as const;

type StatusId = (typeof STATUS_OPTIONS)[number]["id"];

type Chronotype =
  | "extreme_lark"
  | "moderate_lark"
  | "intermediate"
  | "moderate_owl"
  | "extreme_owl";

const CHRONOTYPE_LABELS: Record<Chronotype, string> = {
  extreme_lark: "Extreme lark",
  moderate_lark: "Moderate lark",
  intermediate: "Intermediate",
  moderate_owl: "Moderate owl",
  extreme_owl: "Extreme owl",
};

const STEP_META = [
  {
    eyebrow: "IDENTITY",
    title: "Let's meet you",
    sub: "The basics — this takes under a minute.",
  },
  {
    eyebrow: "CHRONOBIOLOGY",
    title: "When does your body wake?",
    sub: "MCTQ-style: your natural rhythm, not your alarm.",
  },
  {
    eyebrow: "GOALS",
    title: "What are you building?",
    sub: "Daily targets we'll protect on your timeline.",
  },
] as const;

// ---------- chronobiology derivation ----------

/** MCTQ-style heuristic on natural wake time (PRD §4.1: default intermediate). */
function deriveChronotype(wake: string): Chronotype {
  const [h, m] = wake.split(":").map(Number);
  const mins = (h || 0) * 60 + (m || 0);
  if (mins <= 300) return "extreme_lark"; // ≤ 05:00
  if (mins <= 390) return "moderate_lark"; // ≤ 06:30
  if (mins <= 480) return "intermediate"; // ≤ 08:00
  if (mins <= 570) return "moderate_owl"; // ≤ 09:30
  return "extreme_owl";
}

/** Circadian offsets shift ±30min by chronotype. */
const CHRONO_SHIFT: Record<Chronotype, number> = {
  extreme_lark: -30,
  moderate_lark: -15,
  intermediate: 0,
  moderate_owl: 15,
  extreme_owl: 30,
};

const fmtClock = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Calculated peaks (PRD §3 chronobiology.calculatedPeaks): classic
 * circadian windows offset from NATURAL wake, shifted by chronotype.
 * Documented heuristic — Phase 3's scheduler may refine with logged data.
 */
function computePeaks(wake: string, chronotype: Chronotype) {
  const [h, m] = wake.split(":").map(Number);
  const wakeMins = (h || 0) * 60 + (m || 0);
  const shift = CHRONO_SHIFT[chronotype];
  const window = (start: number, duration: number) => ({
    start: fmtClock(wakeMins + start + shift),
    end: fmtClock(wakeMins + start + shift + duration),
  });
  return {
    morningFocusPeak: window(120, 150), // wake +2h .. +4.5h
    afternoonDip: window(360, 90), // wake +6h .. +7.5h
    secondaryMotorPeak: window(540, 120), // wake +9h .. +11h
  };
}

const inOptions = (n: number, opts: readonly { id: string }[]) =>
  opts.some((o) => Number(o.id) === n);

// ---------- page ----------

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepMinutes, setSleepMinutes] = useState(480);
  const [status, setStatus] = useState<StatusId>("employed_structured");
  const [careerMinutes, setCareerMinutes] = useState(180);
  const [craftMinutes, setCraftMinutes] = useState(60);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // Passkey enrollment offer (Amendment #17): offered at the end of
  // onboarding; skip is always one tap away.
  const [offerPasskey, setOfferPasskey] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyNote, setPasskeyNote] = useState<string | null>(null);

  const chronotype = useMemo(() => deriveChronotype(wakeTime), [wakeTime]);
  const ChronoIcon = chronotype.includes("owl") ? Moon : Sun;

  // Defensive auth + profile prefill (resuming users keep their answers).
  // Timezone is a browser API — read after mount so SSR markup and the
  // hydration pass match exactly (state stays "" on the server).
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/auth");
        return;
      }
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const user = authData.user;
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile) return;

      const identity = profile.identity as { displayName?: string } | null;
      if (identity?.displayName) setDisplayName(identity.displayName);

      const chrono = profile.chronobiology as
        | { naturalWakeTime?: string; targetSleepDurationMinutes?: number }
        | null;
      if (chrono?.naturalWakeTime) setWakeTime(chrono.naturalWakeTime);
      if (
        typeof chrono?.targetSleepDurationMinutes === "number" &&
        inOptions(chrono.targetSleepDurationMinutes, SLEEP_OPTIONS)
      ) {
        setSleepMinutes(chrono.targetSleepDurationMinutes);
      }

      const occ = profile.occupational_context as
        | {
            status?: string;
            dailyCareerTargetMinutes?: number;
            dailyPersonalCraftMinutes?: number;
          }
        | null;
      if (
        occ?.status &&
        STATUS_OPTIONS.some((o) => o.id === occ.status)
      ) {
        setStatus(occ.status as StatusId);
      }
      if (typeof occ?.dailyCareerTargetMinutes === "number" && inOptions(occ.dailyCareerTargetMinutes, CAREER_OPTIONS)) {
        setCareerMinutes(occ.dailyCareerTargetMinutes);
      }
      if (typeof occ?.dailyPersonalCraftMinutes === "number" && inOptions(occ.dailyPersonalCraftMinutes, CRAFT_OPTIONS)) {
        setCraftMinutes(occ.dailyPersonalCraftMinutes);
      }
    })();
  }, [router]);

  async function finish() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/auth");
        return;
      }
      const user = authData.user;

      const { data: existing } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      const now = new Date().toISOString();
      const identity = {
        ...((existing?.identity as Record<string, unknown> | null) ?? {}),
        displayName:
          displayName.trim() || user.email?.split("@")[0] || "Dayflow user",
        timezone: timezone || "UTC",
        createdAt:
          (existing?.identity as { createdAt?: string } | null)?.createdAt ??
          now,
      };
      const chronobiology = {
        ...((existing?.chronobiology as Record<string, unknown> | null) ?? {}),
        chronotype,
        naturalWakeTime: wakeTime,
        targetSleepDurationMinutes: sleepMinutes,
        calculatedPeaks: computePeaks(wakeTime, chronotype),
      };
      const occupational_context = {
        ...((existing?.occupational_context as Record<string, unknown> | null) ?? {}),
        status,
        dailyCareerTargetMinutes: careerMinutes,
        dailyPersonalCraftMinutes: craftMinutes,
        // Skipped-question defaults (PRD §3 shape):
        hardShutdownTime: "22:30",
        enforceMorningAnchor: false,
        allowedFocusBlockLength: 45,
      };
      const psychology = {
        // The survey skips the psychology section — defaults apply.
        archetype: "questioner",
        taskInitiationFriction: "moderate",
        failureSpiralSensitivity: false,
        dashboardDensity: "minimal_zen",
        notificationAggression: "gentle_passive",
      };
      const metabolism = {
        // Placeholder baselines (70kg reference) — refined in settings later.
        weightKg: 70,
        heightCm: 170,
        biologicalSex: "unspecified",
        dailyWaterBaseMl: 2450, // 70kg x 35ml (PRD §3)
        proteinTargetGrams: 112, // 1.6 g/kg floor
        workoutFrequencyTargetDays: 3,
        preferredWorkoutWindow: "afternoon_peak",
      };

      const { error: upsertError } = await supabase.from("profiles").upsert({
        id: user.id,
        identity,
        chronobiology,
        occupational_context,
        psychology,
        metabolism,
      });
      if (upsertError) throw upsertError;

      // Amendment #17: enrollment is offered at the end of
      // onboarding (only when the browser can do passkeys).
      if (passkeysSupported()) {
        setOfferPasskey(true);
        setPending(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save your profile. Please try again."
      );
      setPending(false);
    }
  }

  const enroll = async () => {
    setPasskeyBusy(true);
    setPasskeyNote(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setPasskeyNote("Session expired — finish with email sign-in.");
        return;
      }
      await enrollPasskey(token);
      setPasskeyNote("Face ID enabled — see you tomorrow morning.");
    } catch (e) {
      setPasskeyNote(
        e instanceof Error ? e.message : "Couldn't enable the passkey — you can retry later."
      );
    } finally {
      setPasskeyBusy(false);
    }
  };

  const meta = STEP_META[step];

  if (offerPasskey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-(--color-surface) p-4 font-sans">
        <GlassPanel className="w-full max-w-md p-6 sm:p-8">
          <p className="text-xs font-semibold tracking-[0.22em] text-(--color-accent-focus)">
            DAYFLOW AI
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-(--color-ink)">
            One less password day
          </h1>
          <p className="mt-2 text-sm leading-6 text-(--color-ink-muted)">
            Enable Face ID / a device passkey and tomorrow&apos;s sign-in is a glance.
            You can skip this and use your email any time.
          </p>
          {passkeyNote && (
            <p role="status" className="mt-4 text-sm text-(--color-accent-focus)">
              {passkeyNote}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={enroll}
              disabled={passkeyBusy}
              className="min-h-12 rounded-(--radius-pill) bg-(--color-ink) px-4 text-base font-semibold text-(--color-accent-focus) transition-[transform,opacity] duration-(--duration-press) ease-(--ease-spring-critical) hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {passkeyBusy ? "Waiting for your device…" : "Enable Face ID"}
            </button>
            <button
              type="button"
              onClick={() => {
                router.replace("/");
                router.refresh();
              }}
              className="min-h-11 rounded-(--radius-pill) px-4 text-sm font-medium text-(--color-ink-muted) transition-colors hover:bg-(--color-surface-subtle)"
            >
              Skip for now
            </button>
          </div>
        </GlassPanel>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-(--color-surface) p-4 font-sans">
      <GlassPanel className="w-full max-w-md p-6 sm:p-8">
        <p className="text-xs font-semibold tracking-[0.22em] text-(--color-accent-focus)">
          DAYFLOW AI
        </p>

        {/* progress */}
        <div className="mt-6 flex items-center gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-(--radius-pill) transition-colors duration-200"
              style={{
                background:
                  i <= step
                    ? "var(--color-accent-focus)"
                    : "var(--color-surface-subtle)",
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-(--color-ink-faint)">
          Step {step + 1} of 3
        </p>

        {/* step header */}
        <div className="mt-5">
          <h1 className="text-2xl font-semibold text-(--color-ink)">
            {meta.title}
          </h1>
          <p className="mt-1 text-sm text-(--color-ink-muted)">{meta.sub}</p>
        </div>

        {/* step body */}
        <div key={step} className="df-rise mt-6 flex flex-col gap-5" aria-live="polite">
          {step === 0 && (
            <>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-(--color-ink-muted)">
                  Display name
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex"
                  autoComplete="name"
                  maxLength={40}
                  className="min-h-12 rounded-(--radius-panel) border border-(--hairline) bg-(--color-surface-subtle) px-4 text-base text-(--color-ink) outline-none transition-colors placeholder:text-(--color-ink-faint) focus:border-(--hairline-accent)"
                />
              </label>

              <div className="flex min-h-12 items-center justify-between rounded-(--radius-panel) border border-(--hairline) bg-(--color-surface-subtle) px-4">
                <span className="text-sm text-(--color-ink-muted)">Timezone</span>
                <span className="flex items-center gap-1.5 text-sm text-(--color-ink)">
                  <MapPin className="size-4 text-(--color-accent-focus)" aria-hidden />
                  {timezone || "Detecting…"}
                </span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-(--color-ink-muted)">
                  Natural wake time
                </span>
                <input
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className="min-h-12 rounded-(--radius-panel) border border-(--hairline) bg-(--color-surface-subtle) px-4 text-base text-(--color-ink) outline-none transition-colors focus:border-(--hairline-accent)"
                />
              </label>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-(--color-ink-muted)">
                  Target sleep
                </span>
                <Segmented
                  label="Target sleep duration"
                  options={SLEEP_OPTIONS}
                  value={String(sleepMinutes)}
                  onChange={(id) => setSleepMinutes(Number(id))}
                />
              </div>

              <div className="flex items-center gap-2 rounded-(--radius-pill) border border-(--hairline) bg-(--color-surface-subtle) px-4 py-2.5 text-sm text-(--color-ink-muted)">
                <ChronoIcon className="size-4 shrink-0 text-(--color-accent-recovery)" aria-hidden />
                <span>Derived chronotype:</span>
                <span className="font-medium text-(--color-ink)">
                  {CHRONOTYPE_LABELS[chronotype]}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setWakeTime("07:00");
                  setSleepMinutes(480);
                  setStep(2);
                }}
                className="self-start text-sm font-medium text-(--color-ink-muted) underline decoration-(--hairline) underline-offset-4 transition-opacity duration-(--duration-press) hover:opacity-80"
              >
                Skip — use defaults
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-(--color-ink-muted)">
                  Work status
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {STATUS_OPTIONS.map(({ id, label, icon: Icon }) => (
                    <label
                      key={id}
                      className={[
                        "flex min-h-12 cursor-pointer items-center gap-3 rounded-(--radius-panel) border px-4 py-3 transition-colors duration-(--duration-press)",
                        id === "sabbatical" ? "sm:col-span-2" : "",
                        status === id
                          ? "border-(--hairline-accent) bg-(--color-surface-elevated)"
                          : "border-(--hairline) bg-(--color-surface-subtle)",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="occupation-status"
                        value={id}
                        checked={status === id}
                        onChange={() => setStatus(id)}
                        className="sr-only"
                      />
                      <Icon
                        className={[
                          "size-5 shrink-0",
                          status === id
                            ? "text-(--color-accent-focus)"
                            : "text-(--color-ink-muted)",
                        ].join(" ")}
                        aria-hidden
                      />
                      <span
                        className={[
                          "text-sm",
                          status === id
                            ? "font-medium text-(--color-ink)"
                            : "text-(--color-ink-muted)",
                        ].join(" ")}
                      >
                        {label}
                      </span>
                      {status === id && (
                        <Check
                          className="ml-auto size-4 text-(--color-accent-focus)"
                          aria-hidden
                        />
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-(--color-ink-muted)">
                  Daily career target
                </span>
                <Segmented
                  label="Daily career target"
                  options={CAREER_OPTIONS}
                  value={String(careerMinutes)}
                  onChange={(id) => setCareerMinutes(Number(id))}
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-(--color-ink-muted)">
                  Daily personal craft target
                </span>
                <Segmented
                  label="Daily personal craft target"
                  options={CRAFT_OPTIONS}
                  value={String(craftMinutes)}
                  onChange={(id) => setCraftMinutes(Number(id))}
                />
              </div>
            </>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-(--df-destructive)">
            {error}
          </p>
        ) : null}

        {/* footer */}
        <div className="mt-8 flex items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex min-h-11 items-center gap-1.5 rounded-(--radius-pill) px-4 text-sm font-medium text-(--color-ink-muted) transition-[transform,opacity] duration-(--duration-press) ease-(--ease-spring-critical) hover:opacity-80 active:scale-[0.98]"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={step < 2 ? () => setStep(step + 1) : finish}
            disabled={pending}
            className="ml-auto min-h-12 flex-1 rounded-(--radius-pill) bg-(--color-ink) px-4 text-base font-semibold text-(--color-accent-focus) transition-[transform,opacity] duration-(--duration-press) ease-(--ease-spring-critical) hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:px-10"
          >
            {pending ? "Saving…" : step < 2 ? "Continue" : "Finish setup"}
          </button>
        </div>
      </GlassPanel>
    </main>
  );
}
