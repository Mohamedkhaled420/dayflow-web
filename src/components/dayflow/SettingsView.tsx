"use client";

// ============================================================
// Dayflow AI — Settings sheet (reference "Dayflow (4).html" #set)
// ------------------------------------------------------------
// The full-bleed sheet that slides up over the whole app: the
// profile card (big seal avatar + name + "Your rhythm" picker +
// the seal grid), the goals card (hold-to-repeat steppers, glass
// size, the morning check), the app card (appearance, the living
// sky with its live preview slider, haptics), the connect card
// (Team Mode, install, Apple Shortcuts) and the data card
// (export, sign out, reset). One scroll, no tabs — the reference
// trade of depth for calm.
//
// Every control writes REAL state: profile identity/metabolism/
// chronobiology/occupation JSONB sections through the Delta Sync
// store, next-themes for appearance, and the localStorage flags
// SkySync + the haptics engine read. Nothing is a demo stub.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useDayflowData } from "@/lib/viewmodel";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useToast } from "@/hooks/use-toast";
import { haptic, hapticSelect } from "@/lib/haptics";
import type { TabId } from "@/components/dayflow/AppShell";
import { InstallAppCard } from "@/components/dayflow/InstallAppCard";
import { ShortcutsSetupCard } from "@/components/dayflow/ShortcutsSetupCard";
import {
  SKY_CHANGE_EVENT,
  SKY_OFF_KEY,
  SKY_PREVIEW_KEY,
} from "@/components/dayflow/SkySync";
import { HAPTICS_OFF_KEY } from "@/lib/haptics";
import type { Json } from "@/types/supabase";

/* ---------------- the seal system (reference SIG) ---------------- */

/** avatar emoji → [seal name, pastel tint token] */
const SEAL_SIG: Record<string, [string, string]> = {
  "🌊": ["Tide Rider", "var(--df-p-blue)"],
  "💪": ["Iron Will", "var(--df-p-rose)"],
  "🔥": ["Ember", "var(--df-p-powder)"],
  "🏃": ["Fleet Foot", "var(--df-p-celadon)"],
  "🧘": ["Still Mind", "var(--df-p-mauve)"],
  "🥗": ["Green Gauge", "var(--df-p-marine)"],
  "🛏️": ["Dream Keeper", "var(--df-p-aqua)"],
  "💧": ["Dew Drop", "var(--df-p-frost)"],
  "🧠": ["Deep Thinker", "var(--df-p-orchid)"],
  "🚴": ["Pedal Sage", "var(--df-p-lemon)"],
  "⚡": ["Live Wire", "var(--df-p-powder)"],
  "🌱": ["Sprout", "var(--df-p-celadon)"],
  "☕": ["Slow Brew", "var(--df-p-rose)"],
  "🌙": ["Night Owl", "var(--df-p-mauve)"],
  "💻": ["Flow State", "var(--df-p-blue)"],
  "🪐": ["Wanderer", "var(--df-p-orchid)"],
};

const AVATARS = Object.keys(SEAL_SIG);

/** "Your rhythm" (reference PER) — role label + wake target. */
const RHYTHMS: {
  label: string;
  emoji: string;
  desc: string;
  wake: number;
  color: string;
}[] = [
  { label: "Early riser", emoji: "☀️", desc: "Up with the sun, done by noon", wake: 360, color: "var(--df-p-powder)" },
  { label: "Steady", emoji: "⚖️", desc: "Same shape every day", wake: 450, color: "var(--df-p-celadon)" },
  { label: "Balancer", emoji: "🌗", desc: "Mornings for work, evenings for life", wake: 480, color: "var(--df-p-blue)" },
  { label: "Late start", emoji: "🌆", desc: "Finds focus after lunch", wake: 540, color: "var(--df-p-mauve)" },
  { label: "Night owl", emoji: "🌙", desc: "Alive when the stars are", wake: 630, color: "var(--df-p-orchid)" },
];

/** Goals (reference GOALS) — hold-to-repeat steppers. */
const GOAL_FIELDS: {
  key: string;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  unit: "hours" | "minutes" | "count";
  /** JSONB section + key the value persists into. */
  section: "occupational_context" | "metabolism" | "chronobiology";
  field: string;
  /** hours fields persist ×60. */
  factor?: number;
}[] = [
  { key: "workMinutes", label: "Work time", help: "Focused job time per day", min: 0, max: 12, step: 0.5, unit: "hours", section: "occupational_context", field: "dailyCareerTargetMinutes", factor: 60 },
  { key: "personalMinutes", label: "Personal work", help: "Side projects & learning per day", min: 0, max: 8, step: 0.5, unit: "hours", section: "occupational_context", field: "dailyPersonalCraftMinutes", factor: 60 },
  { key: "fitnessMinutes", label: "Fitness", help: "Active minutes per day", min: 0, max: 180, step: 15, unit: "minutes", section: "metabolism", field: "fitnessMinutes" },
  { key: "fitnessSessionsPerWeek", label: "Workouts", help: "Sessions per week", min: 0, max: 7, step: 1, unit: "count", section: "metabolism", field: "workoutFrequencyTargetDays" },
  { key: "sleepMinutes", label: "Sleep", help: "Hours per night", min: 4, max: 12, step: 0.5, unit: "hours", section: "chronobiology", field: "targetSleepDurationMinutes", factor: 60 },
  { key: "waterGlasses", label: "Water", help: "Glasses per day", min: 2, max: 16, step: 1, unit: "count", section: "metabolism", field: "dailyWaterBaseMl", factor: 250 },
  { key: "mealsPerDay", label: "Meals", help: "Logged meals per day", min: 1, max: 6, step: 1, unit: "count", section: "metabolism", field: "mealsPerDay" },
];

/** The library fallbacks (viewmodel deriveGoals) — what "Reset
 *  settings" restores by clearing the section keys. */
const GOAL_DEFAULTS: Record<string, number> = {
  workMinutes: 420,
  personalMinutes: 90,
  fitnessMinutes: 45,
  fitnessSessionsPerWeek: 4,
  sleepMinutes: 480,
  waterGlasses: 8,
  mealsPerDay: 3,
};

/* ---------------- shared helpers ---------------- */

/** Merge a patch into a profile JSONB section (kept on the server). */
function mergeSection(value: unknown, patch: Record<string, unknown>): Json {
  const base =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return { ...base, ...patch } as unknown as Json;
}

function asSection(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 7.5 → "7:30 AM" (reference t12). */
function t12(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  const ampm = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

/* ---------------- tiny UI primitives (reference kit) ---------------- */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="dfset-lbl">
      <span>{children}</span>
    </div>
  );
}

/** The iOS switch (reference .sw3). */
function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`dfset-sw${on ? " on" : ""}`}
      onClick={() => {
        hapticSelect();
        onChange(!on);
      }}
    >
      <i />
    </button>
  );
}

/** A row icon chip (reference .ic2) — tinted pastel square. */
const ROW_ICONS: Record<string, React.ReactNode> = {
  goal: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
  rise: (
    <svg viewBox="0 0 24 24">
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M14 8h6v6" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  hap: (
    <svg viewBox="0 0 24 24">
      <path d="M4 12h3l2-6 3 12 2.5-8 2 4h3.5" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24">
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.8 19.5c.7-3.3 3.2-5 6.2-5s5.5 1.7 6.2 5" />
      <circle cx="17.2" cy="9.5" r="2.6" />
      <path d="M15.4 14.6c3-.3 5.3 1.3 5.8 4.4" />
    </svg>
  ),
  inst: (
    <svg viewBox="0 0 24 24">
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M11 18.5h2" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24">
      <path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5z" />
    </svg>
  ),
  data: (
    <svg viewBox="0 0 24 24">
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5V18.5c0 1.7 3.6 3 8 3s8-1.3 8-3V5.5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  ),
};

function RowIcon({ name, tint }: { name: keyof typeof ROW_ICONS; tint: string }) {
  return (
    <span className="dfset-ic" style={{ background: tint }} aria-hidden="true">
      {ROW_ICONS[name]}
    </span>
  );
}

/** The chevron (reference CH). */
function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      className={`dfset-chev${open ? " open" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/* ============================================================
   The sheet
   ============================================================ */

export function SettingsView({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  const { toast } = useToast();
  const data = useDayflowData();
  const profileRow = useDayflowStore((s) => s.profile);
  const updateProfileSections = useDayflowStore((s) => s.updateProfileSections);

  // ---- local sheet state ----
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [instOpen, setInstOpen] = useState(false);
  const [scOpen, setScOpen] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [skyOff, setSkyOff] = useState(false);
  const [skyHour, setSkyHour] = useState<number | null>(null);
  const [hapOff, setHapOff] = useState(false);
  const [stampNonce, setStampNonce] = useState(0);
  const router = useRouter();

  // Read the localStorage flags once on mount (SSR-safe) — deferred
  // to a microtask so the effect body performs no synchronous
  // setState (hydration's first paint stays deterministic).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setSkyOff(window.localStorage.getItem(SKY_OFF_KEY) === "1");
        setHapOff(window.localStorage.getItem(HAPTICS_OFF_KEY) === "1");
        const raw = window.localStorage.getItem(SKY_PREVIEW_KEY);
        if (raw !== null) {
          const h = Number(raw);
          if (Number.isFinite(h)) setSkyHour(h);
        }
      } catch {
        /* private mode — switches just won't persist */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape closes the sheet (reference keydown handler).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNavigate("today");
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onNavigate]);

  // ---- profile helpers (Delta Sync JSONB sections) ----
  const identity = asSection(profileRow?.identity);
  const metabolism = asSection(profileRow?.metabolism);
  const chronobiology = asSection(profileRow?.chronobiology);
  const occupation = asSection(profileRow?.occupational_context);

  const emoji = (typeof identity.emoji === "string" && identity.emoji) || "🌊";
  const name = typeof identity.displayName === "string" ? identity.displayName : data.profile.name;
  const role = typeof identity.role === "string" ? identity.role : data.profile.role;
  const glassMl = typeof metabolism.waterGlassMl === "number" ? metabolism.waterGlassMl : 250;
  const wakeMin =
    typeof chronobiology.targetWakeMinutes === "number"
      ? chronobiology.targetWakeMinutes
      : null;
  const anchorOn = occupation.enforceMorningAnchor === true;
  const seal = SEAL_SIG[emoji] ?? SEAL_SIG["🌊"];

  const patchSections = (patch: {
    identity?: Record<string, unknown>;
    metabolism?: Record<string, unknown>;
    chronobiology?: Record<string, unknown>;
    occupational_context?: Record<string, unknown>;
  }) => {
    void updateProfileSections({
      ...(patch.identity
        ? { identity: mergeSection(profileRow?.identity, patch.identity) }
        : {}),
      ...(patch.metabolism
        ? { metabolism: mergeSection(profileRow?.metabolism, patch.metabolism) }
        : {}),
      ...(patch.chronobiology
        ? { chronobiology: mergeSection(profileRow?.chronobiology, patch.chronobiology) }
        : {}),
      ...(patch.occupational_context
        ? {
            occupational_context: mergeSection(
              profileRow?.occupational_context,
              patch.occupational_context
            ),
          }
        : {}),
    });
  };

  /** Set one goal target (stepper taps + hold-repeat). */
  const setGoal = (f: (typeof GOAL_FIELDS)[number], next: number) => {
    const clamped = Math.min(f.max, Math.max(f.min, next));
    const stored = f.factor ? Math.round(clamped * f.factor) : Math.round(clamped);
    patchSections({ [f.section]: { [f.field]: stored } } as Parameters<typeof patchSections>[0]);
  };

  const goalValue = (f: (typeof GOAL_FIELDS)[number]): number => {
    const raw = (data.goals as unknown as Record<string, number>)[f.key];
    return f.factor ? raw / f.factor : raw;
  };

  const goalDisplay = (f: (typeof GOAL_FIELDS)[number]): string => {
    const v = goalValue(f);
    if (f.unit === "hours") return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}h`;
    if (f.unit === "minutes") return `${Math.round(v)}m`;
    return `${Math.round(v)}`;
  };

  // ---- sky + haptics switches ----
  const applySkyChange = () =>
    window.dispatchEvent(new CustomEvent(SKY_CHANGE_EVENT));

  const toggleSky = (next: boolean) => {
    setSkyOff(next);
    try {
      if (next) window.localStorage.setItem(SKY_OFF_KEY, "1");
      else window.localStorage.removeItem(SKY_OFF_KEY);
    } catch {
      /* private mode */
    }
    applySkyChange();
  };

  const previewSky = (h: number | null) => {
    setSkyHour(h);
    try {
      if (h === null) window.localStorage.removeItem(SKY_PREVIEW_KEY);
      else window.localStorage.setItem(SKY_PREVIEW_KEY, String(h));
    } catch {
      /* private mode */
    }
    applySkyChange();
  };

  const toggleHaptics = (off: boolean) => {
    setHapOff(off);
    try {
      if (off) window.localStorage.setItem(HAPTICS_OFF_KEY, "1");
      else window.localStorage.removeItem(HAPTICS_OFF_KEY);
      if (!off) haptic(10);
    } catch {
      /* private mode */
    }
  };

  // ---- sign out (F-3: wipe local BEFORE the session ends) ----
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await useDayflowStore.persist.clearStorage();
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/auth");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  // ---- export (full JSON backup of the synced store) ----
  const exportJson = () =>
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile: useDayflowStore.getState().profile,
        habits: useDayflowStore.getState().habits,
        habitLogs: useDayflowStore.getState().habitLogs,
        hydrationLogs: useDayflowStore.getState().hydrationLogs,
        workoutLogs: useDayflowStore.getState().workoutLogs,
        sleepLogs: useDayflowStore.getState().sleepLogs,
        journalEntries: useDayflowStore.getState().journalEntries,
      },
      null,
      2
    );

  const copyData = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      toast({ title: "Copied", description: "Your data is on the clipboard as JSON." });
    } catch {
      toast({ title: "Copy blocked by the browser" });
    }
  };

  // ---- reset (reference double-tap confirm; keeps name + seal) ----
  const resetSettings = () => {
    if (!resetArmed) {
      setResetArmed(true);
      haptic(18);
      setTimeout(() => setResetArmed(false), 3000);
      return;
    }
    setResetArmed(false);
    // Clear every goal key from the sections — deriveGoals falls
    // back to the library defaults; rhythm + glass + morning
    // check reset too. Name, seal, and logs are untouched.
    const occ = asSection(profileRow?.occupational_context);
    const met = asSection(profileRow?.metabolism);
    const chr = asSection(profileRow?.chronobiology);
    const strip = (src: Record<string, unknown>, keys: string[]) =>
      Object.fromEntries(keys.map((k) => [k, null]));
    void updateProfileSections({
      occupational_context: {
        ...occ,
        ...strip(occ, ["dailyCareerTargetMinutes", "dailyPersonalCraftMinutes"]),
        enforceMorningAnchor: false,
      } as unknown as Json,
      metabolism: {
        ...met,
        ...strip(met, ["fitnessMinutes", "workoutFrequencyTargetDays", "dailyWaterBaseMl", "mealsPerDay"]),
        waterGlassMl: 250,
      } as unknown as Json,
      chronobiology: {
        ...chr,
        ...strip(chr, ["targetSleepDurationMinutes", "targetWakeMinutes"]),
      } as unknown as Json,
      identity: mergeSection(profileRow?.identity, { role: "" }),
    });
    toast({ title: "Settings reset", description: "Goals are back to the defaults." });
  };

  const goalsSummary = `${GOAL_FIELDS.filter((f) => f.unit !== "count")
    .slice(0, 3)
    .map((f) => goalDisplay(f))
    .join(" · ")}…`;

  return (
    <div
      className="dfset-scroll"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="dfset">
        {/* ---------- header ---------- */}
        <div className="dfset-head">
          <h1>Settings</h1>
          <button
            type="button"
            className="dfset-x df-press"
            onClick={() => {
              hapticSelect();
              onNavigate("today");
            }}
            aria-label="Done"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* ---------- profile card ---------- */}
        <section className="dfset-card dfset-pf" aria-label="Your profile">
          <div className="dfset-pr1">
            <button
              type="button"
              className={`dfset-bigav${stampNonce ? "" : ""} df-press`}
              style={{ ["--dfset-sc" as string]: seal[1] }}
              onClick={() => {
                // stamp the seal + hop to the grid (reference stamp())
                haptic([8, 30, 8]);
                setStampNonce((n) => n + 1);
                document
                  .getElementById("dfset-sgrid")
                  ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
              aria-label={`Your seal: ${seal[0]}. Activate to see the seal grid.`}
            >
              <span key={emoji} className="dfset-avstamp">
                {emoji}
              </span>
            </button>
            <div className="dfset-fld">
              <input
                value={name}
                maxLength={24}
                placeholder="Your name"
                aria-label="Your name"
                autoComplete="off"
                onChange={(e) => patchSections({ identity: { displayName: e.target.value } })}
              />
              <div className="dfset-sn" style={{ ["--dfset-sc" as string]: seal[1] }}>
                {seal[0]}
              </div>
            </div>
          </div>

          {/* your rhythm */}
          <div className="dfset-pl2">
            <b>Your rhythm</b>
            <span>Pick the one that sounds most like you</span>
          </div>
          <div className="dfset-per" role="radiogroup" aria-label="Your rhythm">
            {RHYTHMS.map((r) => {
              const on = role === r.label;
              return (
                <button
                  key={r.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={on ? "on" : ""}
                  style={{ ["--dfset-sc" as string]: r.color }}
                  onClick={() => {
                    haptic([8, 30, 8]);
                    patchSections({
                      identity: { role: r.label },
                      chronobiology: { targetWakeMinutes: r.wake },
                    });
                    toast({
                      title: `${r.label} · wake ${t12(r.wake / 60)}`,
                    });
                  }}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                  <b>{r.label}</b>
                  <small>{r.desc}</small>
                </button>
              );
            })}
          </div>

          {/* the seal grid */}
          <div className="dfset-sgrid" id="dfset-sgrid" role="radiogroup" aria-label="Seal">
            {AVATARS.map((a) => {
              const on = a === emoji;
              return (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={SEAL_SIG[a][0]}
                  className={on ? "on" : ""}
                  style={{ ["--dfset-sc" as string]: SEAL_SIG[a][1] }}
                  onClick={() => {
                    haptic([8, 30, 8]);
                    patchSections({ identity: { emoji: a } });
                    setStampNonce((n) => n + 1);
                  }}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------- goals ---------- */}
        <Label>Goals</Label>
        <section className="dfset-card dfset-st" aria-label="Goals">
          <div className={`dfset-accw${goalsOpen ? " ex" : ""}`} id="dfset-a-goals">
            <button
              type="button"
              className="dfset-row"
              onClick={() => {
                hapticSelect();
                setGoalsOpen((v) => !v);
              }}
              aria-expanded={goalsOpen}
            >
              <RowIcon name="goal" tint="var(--df-p-blue)" />
              <div>
                <b>Daily goals</b>
                <small>{goalsSummary}</small>
              </div>
              <Chevron open={goalsOpen} />
            </button>
            <div className="dfset-xp">
              <div>
                {GOAL_FIELDS.map((f) => (
                  <div key={f.key} className="dfset-row dfset-row-sub">
                    <div>
                      <b>{f.label}</b>
                      <small>{f.help}</small>
                    </div>
                    <Stepper
                      value={goalValue(f)}
                      display={goalDisplay(f)}
                      onStep={(d) => setGoal(f, goalValue(f) + d * f.step)}
                    />
                  </div>
                ))}
                {/* glass size */}
                <div className="dfset-row dfset-row-sub">
                  <div>
                    <b>Glass size</b>
                    <small>One tap of water</small>
                  </div>
                  <div className="dfset-seg" role="radiogroup" aria-label="Glass size">
                    {[200, 250, 300, 350].map((ml) => (
                      <button
                        key={ml}
                        type="button"
                        role="radio"
                        aria-checked={glassMl === ml}
                        className={glassMl === ml ? "on" : ""}
                        onClick={() => {
                          hapticSelect();
                          patchSections({ metabolism: { waterGlassMl: ml } });
                        }}
                      >
                        {ml}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* morning check */}
          <div className="dfset-row">
            <RowIcon name="rise" tint="var(--df-p-powder)" />
            <div>
              <b>Morning check</b>
              <small>Hydrate and get light before the Timeline opens</small>
            </div>
            <Switch
              on={anchorOn}
              label="Morning check"
              onChange={(next) =>
                patchSections({ occupational_context: { enforceMorningAnchor: next } })
              }
            />
          </div>
        </section>

        {/* ---------- app ---------- */}
        <Label>App</Label>
        <section className="dfset-card dfset-st" aria-label="App">
          <div className="dfset-row">
            <RowIcon name="sun" tint="var(--df-p-mauve)" />
            <div>
              <b>Appearance</b>
            </div>
            <ThemeSegment />
          </div>

          <div className="dfset-row">
            <RowIcon name="moon" tint="var(--df-p-powder)" />
            <div>
              <b>Time-of-day background</b>
              <small>Shifts from morning to night</small>
            </div>
            <Switch on={!skyOff} label="Time-of-day background" onChange={(next) => toggleSky(!next)} />
          </div>

          <div className="dfset-row">
            <div>
              <b>Preview</b>
              <small>{skyHour === null ? "Now" : t12(skyHour)}</small>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              step={0.25}
              value={skyHour ?? new Date().getHours() + new Date().getMinutes() / 60}
              onChange={(e) => previewSky(Number(e.target.value))}
              aria-label="Preview time of day"
              className="dfset-skyr"
              style={{ accentColor: "var(--df-p-blue)" }}
            />
            <button
              type="button"
              className="dfset-cp df-press"
              onClick={() => {
                hapticSelect();
                previewSky(null);
              }}
            >
              Now
            </button>
          </div>

          <div className="dfset-row">
            <RowIcon name="hap" tint="var(--df-p-celadon)" />
            <div>
              <b>Haptics</b>
              <small>Subtle taps on actions</small>
            </div>
            <Switch on={!hapOff} label="Haptics" onChange={(next) => toggleHaptics(!next)} />
          </div>
        </section>

        {/* ---------- connect ---------- */}
        <Label>Connect</Label>
        <section className="dfset-card dfset-st" aria-label="Connect">
          <Link href="/team" className="dfset-row df-press" style={{ textDecoration: "none" }}>
            <RowIcon name="team" tint="var(--df-p-rose)" />
            <div>
              <b>Team Mode</b>
              <small>Share habit wins with up to five people. Journal stays private.</small>
            </div>
            <Chevron />
          </Link>

          <div className={`dfset-accw${instOpen ? " ex" : ""}`}>
            <button
              type="button"
              className="dfset-row"
              onClick={() => {
                hapticSelect();
                setInstOpen((v) => !v);
              }}
              aria-expanded={instOpen}
            >
              <RowIcon name="inst" tint="var(--df-p-blue)" />
              <div>
                <b>Install app</b>
                <small>Add to your Home Screen</small>
              </div>
              <Chevron open={instOpen} />
            </button>
            <div className="dfset-xp">
              <div className="dfset-instw">
                <InstallAppCard />
              </div>
            </div>
          </div>

          <div className={`dfset-accw${scOpen ? " ex" : ""}`}>
            <button
              type="button"
              className="dfset-row"
              onClick={() => {
                hapticSelect();
                setScOpen((v) => !v);
              }}
              aria-expanded={scOpen}
            >
              <RowIcon name="bolt" tint="var(--df-p-powder)" />
              <div>
                <b>Apple Shortcuts</b>
                <small>Log water, sleep and workouts from anywhere</small>
              </div>
              <Chevron open={scOpen} />
            </button>
            <div className="dfset-xp">
              <div className="dfset-instw">
                <ShortcutsSetupCard />
              </div>
            </div>
          </div>
        </section>

        {/* ---------- data ---------- */}
        <Label>Data</Label>
        <section className="dfset-card dfset-st" aria-label="Data">
          <button type="button" className="dfset-row df-press" onClick={() => void copyData()}>
            <RowIcon name="data" tint="var(--df-p-slate)" />
            <div>
              <b>Copy my data</b>
              <small>Profile, goals and logs as JSON</small>
            </div>
            <Chevron />
          </button>

          <button
            type="button"
            className="dfset-row df-press"
            onClick={() => void signOut()}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            <div>
              <b>{signingOut ? "Signing out…" : "Sign out"}</b>
              <small>Back to the welcome screen</small>
            </div>
          </button>

          <button type="button" className="dfset-row df-press" onClick={resetSettings}>
            <div>
              <b className="dfset-dng">{resetArmed ? "Tap again to confirm" : "Reset settings"}</b>
              <small>Keeps your name, seal and logs</small>
            </div>
          </button>
        </section>

        <p className="dfset-foot">Your data stays yours — synced privately to your account.</p>
      </div>
    </div>
  );
}

/* ============================================================
   Stepper — hold to repeat (reference .stp2 + pointerdown loop)
   ============================================================ */

function Stepper({
  value,
  display,
  onStep,
}: {
  value: number;
  display: string;
  onStep: (dir: 1 | -1) => void;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (holdInterval.current) clearInterval(holdInterval.current);
    holdTimer.current = null;
    holdInterval.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = (dir: 1 | -1) => {
    onStep(dir);
    haptic(3);
    stop();
    holdTimer.current = setTimeout(() => {
      holdInterval.current = setInterval(() => onStep(dir), 110);
    }, 420);
  };

  return (
    <span className="dfset-stp">
      <button
        type="button"
        aria-label="Less"
        onPointerDown={() => start(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
      >
        −
      </button>
      <b>{display}</b>
      <button
        type="button"
        aria-label="More"
        onPointerDown={() => start(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
      >
        +
      </button>
    </span>
  );
}

/* ============================================================
   Appearance segment (next-themes: auto = system)
   ============================================================ */

function ThemeSegment() {
  const { theme, setTheme } = useTheme();
  const options: { id: string; label: string }[] = [
    { id: "system", label: "Auto" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];
  return (
    <div className="dfset-seg" role="radiogroup" aria-label="Appearance">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={(theme ?? "system") === o.id}
          className={(theme ?? "system") === o.id ? "on" : ""}
          onClick={() => {
            hapticSelect();
            setTheme(o.id);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
