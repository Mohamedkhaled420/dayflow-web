"use client";

// ============================================================
// Focus Triad — onboarding (reference mockup "Focus Triad (6)" obHTML,
// ported 1:1 + the app's profile data contract)
// ------------------------------------------------------------
// The reference's 4-step flow:
//   0  What should we call you?   (name + live greet preview)
//   1  When do you naturally wake? (energy wheel + slider + −/+)
//   2  What are you building?      (8 multi-select chips)
//   3  Building your day           (spin, status lines, progress)
//
// The profile write keeps the EXACT contract the app reads:
// chronobiology.naturalWakeTime (the middleware's onboarding
// gate — ONLY this survey writes it), chronotype +
// calculatedPeaks via the circadian lib, identity.displayName,
// occupational_context.focusGoals (the picks) + the PRD
// defaults, and the psychology/metabolism baselines.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FocusTriadLogo } from "@/components/brand/FocusTriadLogo";
import { SkySync } from "@/components/focus-triad/SkySync";
import { computeCircadianZones, deriveChronotype } from "@/lib/circadian";
import { haptic } from "@/lib/haptics";

/* ---------------- constants (reference) ---------------- */

const BUILD_OPTIONS = [
  { n: "Career", c: "var(--df-p-blue)", p: <rect x="5" y="5" width="14" height="14" rx="4" /> },
  { n: "Fitness", c: "var(--df-p-rose)", p: <path d="M12 4.5l8 14H4z" /> },
  { n: "Learning", c: "var(--df-p-mauve)", p: <path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" /> },
  {
    n: "Creative",
    c: "var(--df-p-orchid)",
    p: (
      <path d="M12 3c1.2 3.2 2 4 5.5 5.5-3.5 1.5-4.3 2.3-5.5 5.5-1.2-3.2-2-4-5.5-5.5C10 7 10.8 6.2 12 3zM18 14.5c.5 1.4.9 1.8 2.3 2.3-1.4.5-1.8.9-2.3 2.3-.5-1.4-.9-1.8-2.3-2.3 1.4-.5 1.8-.9 2.3-2.3z" />
    ),
  },
  { n: "Calm", c: "var(--df-p-marine)", p: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5z" /> },
  { n: "Family", c: "var(--df-p-powder)", p: <><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" opacity=".65" /></> },
  { n: "Health", c: "var(--df-p-celadon)", p: <path d="M12 4c4 4.5 6 7.3 6 10a6 6 0 0 1-12 0c0-2.7 2-5.5 6-10z" /> },
  { n: "Money", c: "var(--df-p-lemon)", p: <path d="M12 3.5l7.5 4.3v8.4L12 20.5l-7.5-4.3V7.8z" /> },
] as const;

/** the energy wheel arcs (reference OZ) */
const WHEEL = [
  { n: "Warm-up", x: 0, y: 2, c: "var(--df-p-powder)" },
  { n: "Peak", x: 2, y: 5, c: "var(--df-p-rose)" },
  { n: "Steady", x: 5, y: 7, c: "var(--df-p-blue)" },
  { n: "Dip", x: 7, y: 9, c: "var(--dfl-dip)" },
  { n: "Second wind", x: 9, y: 12, c: "var(--df-p-mauve)" },
  { n: "Wind down", x: 12, y: 16, c: "var(--df-p-celadon)" },
] as const;

const BUILD_LINES = (wakeMins: number) => [
  "Reading your rhythm…",
  `Placing deep work at ${tf(wakeMins + 120)}…`,
  "Setting your water and sleep goals…",
  "Waking Dia…",
];

/* 4:00 (240) .. 11:00 (660), 15-minute steps */
const WAKE_MIN = 240;
const WAKE_MAX = 660;

function tf(m: number) {
  const mm = ((m % 1440) + 1440) % 1440;
  return `${Math.floor(mm / 60) % 12 || 12}:${String(mm % 60).padStart(2, "0")} ${mm < 720 ? "AM" : "PM"}`;
}
const toClock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/* the reference's arc math for the wheel */
function wheelPaths() {
  const R = 118;
  const P = (f: number) => [150 - R * Math.cos(Math.PI * f), 150 - R * Math.sin(Math.PI * f)];
  const sg = (x: number, y: number) => {
    const m = P(x);
    const n = P(y);
    return `M${m[0].toFixed(1)} ${m[1].toFixed(1)}A${R} ${R} 0 0 1 ${n[0].toFixed(1)} ${n[1].toFixed(1)}`;
  };
  return { sg };
}

/* ---------------- component ---------------- */

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(0); // 0 name · 1 wake · 2 building · 3 the build screen
  const [name, setName] = useState("");
  const [wake, setWake] = useState(420); // minutes — 7:00 AM
  const [build, setBuild] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [buildLine, setBuildLine] = useState(0);
  const [timezone, setTimezone] = useState("");

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* the build screen: cycling status lines, then save + enter */
  async function runBuild() {
    setBusy(true);
    const lines = BUILD_LINES(wake);
    lines.forEach((_, i) => {
      timers.current.push(setTimeout(() => setBuildLine(i), i * 850));
    });
    timers.current.push(
      setTimeout(() => {
        void finish();
      }, 3600),
    );
  }

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  async function finish() {
    setError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
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
      const wakeClock = toClock(wake);
      const zones = computeCircadianZones(wakeClock, 480);

      const identity = {
        ...((existing?.identity as Record<string, unknown> | null) ?? {}),
        displayName: name.trim() || user.email?.split("@")[0] || "Focus Triad user",
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        createdAt:
          (existing?.identity as { createdAt?: string } | null)?.createdAt ?? now,
      };
      const chronobiology = {
        ...((existing?.chronobiology as Record<string, unknown> | null) ?? {}),
        chronotype: deriveChronotype(wakeClock),
        naturalWakeTime: wakeClock,
        targetSleepDurationMinutes: 480,
        calculatedPeaks: {
          morningFocusPeak: zones.morningFocusPeak,
          afternoonDip: zones.afternoonDip,
          secondaryMotorPeak: zones.secondaryMotorPeak,
        },
      };
      const occupational_context = {
        ...((existing?.occupational_context as Record<string, unknown> | null) ?? {}),
        status: "employed_structured",
        dailyCareerTargetMinutes: 180,
        dailyPersonalCraftMinutes: 60,
        focusGoals: build,
        hardShutdownTime: "22:30",
        enforceMorningAnchor: false,
        allowedFocusBlockLength: 45,
      };
      const psychology = {
        archetype: "questioner",
        taskInitiationFriction: "moderate",
        failureSpiralSensitivity: false,
        dashboardDensity: "minimal_zen",
        notificationAggression: "gentle_passive",
      };
      const metabolism = {
        weightKg: 70,
        heightCm: 170,
        biologicalSex: "unspecified",
        dailyWaterBaseMl: 2450,
        proteinTargetGrams: 112,
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

      setBuildLine(4); // welcome beat before the route
      timers.current.push(
        setTimeout(() => {
          haptic([10, 40, 10]);
          router.replace("/");
          router.refresh();
        }, 420),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your profile. Please try again.",
      );
      setBusy(false);
      setStep(2);
    }
  }

  /* step navigation ("Build my day" validates the picks itself) */
  function next() {
    setError("");
    if (step === 0) {
      if (!name.trim()) {
        setError("Tell us what to call you.");
        haptic(30);
        return;
      }
      haptic(6);
      setStep(1);
      return;
    }
    if (step === 1) {
      haptic(6);
      setStep(2);
    }
  }

  function back() {
    setError("");
    if (step > 0 && step < 3) setStep(step - 1);
  }

  const peak = useMemo(() => `${tf(wake + 120)} to ${tf(wake + 300)}`, [wake]);

  /* the wheel svg */
  const wheel = useMemo(() => {
    const { sg } = wheelPaths();
    return (
      <svg viewBox="0 0 300 168" aria-hidden="true">
        {WHEEL.map((w, k) => (
          <path
            key={w.n}
            className={w.n === "Peak" ? "pk" : ""}
            style={{ animationDelay: `${k * 0.08}s` }}
            d={sg(w.x / 16 + 0.006, w.y / 16 - 0.006)}
            stroke={w.c}
          />
        ))}
        <circle r="9" fill="var(--color-accent-recovery)">
          <animateMotion dur="6s" repeatCount="indefinite" path={sg(0, 1)} />
        </circle>
      </svg>
    );
  }, []);

  /* auth + prefill effect (kept separate from render) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!authData.user) {
        router.replace("/auth");
        return;
      }
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (!profile || cancelled) return;

      const ident = profile.identity as { displayName?: string } | null;
      if (ident?.displayName) setName(ident.displayName);

      const chrono = profile.chronobiology as { naturalWakeTime?: string } | null;
      if (chrono?.naturalWakeTime) {
        const [h, m] = chrono.naturalWakeTime.split(":").map(Number);
        const mins = (h || 0) * 60 + (m || 0);
        if (mins >= WAKE_MIN && mins <= WAKE_MAX) setWake(Math.round(mins / 15) * 15);
      }

      const occ = profile.occupational_context as { focusGoals?: string[] } | null;
      if (Array.isArray(occ?.focusGoals)) {
        setBuild(occ!.focusGoals!.filter((g) => BUILD_OPTIONS.some((b) => b.n === g)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="dfl">
      <SkySync />
      <div className="dfl-body">
        {step === 3 ? (
          /* ---------- the build screen ---------- */
          <div className="dfl-bd">
            <FocusTriadLogo spin className="dfl-lgx" />
            <h1>Building your day</h1>
            <p className="dfl-bt">
              {buildLine === 4
                ? `Welcome, ${name.trim() || "friend"}. Your day is ready.`
                : BUILD_LINES(wake)[Math.min(buildLine, 3)]}
            </p>
            <div className="dfl-bp">
              <i />
            </div>
            <div className="dfl-bs2">
              <span>Peak focus {peak}</span>
              <span>{build.slice(0, 3).join(" · ") || "Your goals"}</span>
            </div>
            {error ? (
              <p className="dfl-err" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {/* ---------- header: back + progress logo ---------- */}
            <div className="dfl-obh">
              <button type="button" className="dfl-back" onClick={back} aria-label="Back">
                ‹
              </button>
              <FocusTriadLogo progress={step + 1} className="dfl-lgp" />
              <span style={{ width: 44 }} />
            </div>

            {step === 0 && (
              <div className="dfl-ob">
                <h1>What should we call you?</h1>
                <p className="dfl-sub">Your coach uses this to greet you.</p>
                <input
                  className="dfl-in dfl-big"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={24}
                  autoComplete="given-name"
                  aria-label="Name"
                  autoFocus
                />
                <p className="dfl-greet">{name.trim() ? `Nice to meet you, ${name.trim()}.` : "\u00A0"}</p>
              </div>
            )}

            {step === 1 && (
              <div className="dfl-ob">
                <h1>When do you naturally wake?</h1>
                <p className="dfl-sub">We place deep work where your energy peaks.</p>
                <div className="dfl-wz">
                  {wheel}
                  <div className="dfl-wb">
                    <b>{tf(wake)}</b>
                    <span>wake time</span>
                  </div>
                </div>
                <input
                  className="dfl-range"
                  type="range"
                  min={WAKE_MIN}
                  max={WAKE_MAX}
                  step={15}
                  value={wake}
                  onChange={(e) => setWake(Number(e.target.value))}
                  aria-label="Wake time"
                />
                <div className="dfl-wk">
                  <button
                    type="button"
                    className="dfl-stp"
                    onClick={() => {
                      setWake((w) => Math.max(WAKE_MIN, w - 15));
                      haptic(4);
                    }}
                    aria-label="Earlier"
                  >
                    −
                  </button>
                  <p className="dfl-pkl">
                    Peak focus <b>{peak}</b>
                  </p>
                  <button
                    type="button"
                    className="dfl-stp"
                    onClick={() => {
                      setWake((w) => Math.min(WAKE_MAX, w + 15));
                      haptic(4);
                    }}
                    aria-label="Later"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="dfl-ob">
                <h1>What are you building?</h1>
                <p className="dfl-sub">Pick any. You can change this later.</p>
                <div className="dfl-bl">
                  {BUILD_OPTIONS.map((b) => {
                    const on = build.includes(b.n);
                    return (
                      <button
                        key={b.n}
                        type="button"
                        className={on ? "on" : ""}
                        style={{ "--c": b.c } as React.CSSProperties}
                        onClick={() => {
                          setBuild((cur) =>
                            cur.includes(b.n) ? cur.filter((x) => x !== b.n) : [...cur, b.n],
                          );
                          haptic(6);
                        }}
                      >
                        <svg viewBox="0 0 24 24">{b.p}</svg>
                        {b.n}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="dfl-err sh" role="alert" key={`err-${error}`}>
              {error}
            </div>

            {/* dock */}
            <div className="dfl-dock">
              <div className="dfl-dockc">
                {step < 2 ? (
                  <button type="button" className="dfl-btn" onClick={next}>
                    <span>Continue</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`dfl-btn${busy ? " ld" : ""}`}
                    onClick={() => {
                      if (busy) return;
                      if (!build.length) {
                        setError("Pick at least one.");
                        haptic(30);
                        return;
                      }
                      setStep(3);
                      void runBuild();
                    }}
                    disabled={busy}
                  >
                    <span>Build my day</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
