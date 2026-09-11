"use client";

// SettingsView — profile, category, and goal customization.
// Everything the native app configures through macOS panes,
// tailored to the life tracker: who you are, what you track,
// and what "on target" means.

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Check,
  Copy,
  Database,
  Download,
  Lock,
  Monitor,
  Moon,
  Sun,
  Target,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useDayflowData } from "@/lib/viewmodel";
import { useDayflowStore } from "@/store/useDayflowStore";
import { dayToMarkdown } from "@/lib/compute";
import { keyForOffset } from "@/lib/seed";
import { useToast } from "@/hooks/use-toast";
import type { TabId } from "@/components/dayflow/AppShell";
import { THEME_SWATCHES } from "@/styles/palette";
import { InstallAppCard } from "@/components/dayflow/InstallAppCard";
import { LogoLoop } from "@/components/brand/LogoLoop";
import { LogoMark } from "@/components/brand/LogoMark";
import { ShortcutsSetupCard } from "@/components/dayflow/ShortcutsSetupCard";

type Section = "profile" | "goals" | "appearance" | "data";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "goals", label: "Goals" },
  { id: "appearance", label: "Appearance" },
  { id: "data", label: "Data" },
];

const AVATARS = [
  "🌊",
  "💪",
  "🔥",
  "🏃",
  "🧘",
  "🥗",
  "🛏️",
  "💧",
  "🧠",
  "🚴",
  "⚡",
  "🌱",
  "☕",
  "🌙",
  "💻",
  "🪐",
];

export function SettingsView({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  const [section, setSection] = useState<Section>("profile");
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  return (
    <div className="df-scroll h-full overflow-y-auto px-4 sm:px-6 py-5">
      <h1 className="text-[21px] font-bold tracking-tight" style={{ color: "var(--df-text-primary)" }}>
        Settings
      </h1>

      {/* section tabs */}
      <div
        className="mt-4 inline-flex rounded-[7px] p-[3px] flex-wrap gap-0.5"
        style={{
          background: "var(--df-segment-track)",
          border: "0.5px solid var(--df-segment-track-border)",
        }}
        role="tablist"
        aria-label="Settings sections"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className="df-press px-3.5 h-[26px] rounded-[5px] text-[12px] font-semibold"
            style={
              section === s.id
                ? {
                    background: "var(--df-control-fill)",
                    border: "0.5px solid var(--df-control-border)",
                    boxShadow: "inset 0 0 0 2px var(--df-control-glow)",
                    color: "var(--df-text-primary)",
                  }
                : { color: "var(--df-segment-inactive)" }
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "profile" && <ProfileSection />}
      {section === "goals" && <GoalsSection />}
      {section === "appearance" && <AppearanceSection theme={theme} setTheme={setTheme} />}
      {section === "data" && (
        <DataSection onNavigate={onNavigate} onToast={toast} />
      )}
    </div>
  );
}

/* ---------------- shared card ---------------- */

function SectionCard({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg p-4 mt-4 ${className ?? ""}`}
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label={title}
    >
      <h2 className="text-[13px] font-bold flex items-center gap-2" style={{ color: "var(--df-text-primary)" }}>
        <span style={{ color: "var(--df-accent)" }}>{icon}</span>
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="text-[10.5px] font-bold uppercase tracking-[0.06em] block"
      style={{ color: "var(--df-text-secondary)" }}
    >
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLength = 60,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  maxLength?: number;
}) {
  return (
    <div
      className="mt-1.5 rounded-md px-3 h-10 flex items-center"
      style={{
        background: "var(--df-input-fill)",
        border: "0.5px solid var(--df-input-border)",
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
        className="w-full bg-transparent outline-none text-[13px] placeholder:text-[var(--df-text-muted)]"
        style={{ color: "var(--df-text-primary)" }}
      />
    </div>
  );
}

/* ---------------- profile ---------------- */

/** Merge a patch into a profile JSONB section (kept on the server). */
function mergeSection(value: unknown, patch: Record<string, unknown>): import("@/types/supabase").Json {
  const base =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return { ...base, ...patch } as unknown as import("@/types/supabase").Json;
}

function ProfileSection() {
  const data = useDayflowData();
  const profileRow = useDayflowStore((s) => s.profile);
  const updateProfileSections = useDayflowStore((s) => s.updateProfileSections);

  // Every legacy profile field now persists into the profiles row's
  // JSONB sections through the Delta Sync store (T0).
  const updateProfile = (patch: { name?: string; emoji?: string; role?: string; waterGlassMl?: number }) => {
    const identity: Record<string, unknown> = {};
    if (patch.name !== undefined) identity.displayName = patch.name;
    if (patch.emoji !== undefined) identity.emoji = patch.emoji;
    if (patch.role !== undefined) identity.role = patch.role;
    const metabolism: Record<string, unknown> = {};
    if (patch.waterGlassMl !== undefined) metabolism.waterGlassMl = patch.waterGlassMl;
    void updateProfileSections({
      ...(Object.keys(identity).length > 0
        ? { identity: mergeSection(profileRow?.identity, identity) }
        : {}),
      ...(Object.keys(metabolism).length > 0
        ? { metabolism: mergeSection(profileRow?.metabolism, metabolism) }
        : {}),
    });
  };

  return (
    <>
      <SectionCard title="Your profile" icon={<UserRound className="h-4 w-4" />}>
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
        The profile personalizes greetings, chat, and exports. Everything stays on your device.
      </p>

      <div className="mt-3 grid sm:grid-cols-[150px_1fr] gap-4">
        {/* avatar */}
        <div>
          <FieldLabel>Avatar</FieldLabel>
          <div
            className="mt-1.5 grid grid-cols-4 gap-1.5 rounded-lg p-2"
            style={{
              background: "var(--df-chip-fill)",
              border: "0.5px solid var(--df-chip-border)",
            }}
          >
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => updateProfile({ emoji: a })}
                aria-label={`Set avatar ${a}`}
                aria-pressed={data.profile.emoji === a}
                className="df-press h-9 rounded-md grid place-items-center text-[19px]"
                style={{
                  background:
                    data.profile.emoji === a ? "var(--df-control-fill)" : "transparent",
                  border:
                    data.profile.emoji === a
                      ? "1.5px solid var(--df-control-border)"
                      : "0.5px solid transparent",
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* name / role / glass size */}
        <div className="flex flex-col gap-3.5">
          <div>
            <FieldLabel>Name</FieldLabel>
            <TextInput
              value={data.profile.name}
              onChange={(name) => updateProfile({ name })}
              placeholder="Your name"
              ariaLabel="Your name"
            />
          </div>
          <div>
            <FieldLabel>Role / tagline</FieldLabel>
            <TextInput
              value={data.profile.role}
              onChange={(role) => updateProfile({ role })}
              placeholder="e.g. Runner, builder, student"
              ariaLabel="Role or tagline"
              maxLength={80}
            />
          </div>
          <div>
            <FieldLabel>Glass size (hydration)</FieldLabel>
            <div className="mt-1.5 flex gap-1.5 flex-wrap">
              {[200, 250, 300, 350].map((ml) => (
                <button
                  key={ml}
                  onClick={() => updateProfile({ waterGlassMl: ml })}
                  aria-pressed={data.profile.waterGlassMl === ml}
                  className="df-press h-9 px-3.5 rounded-md text-[12px] font-semibold"
                  style={{
                    background:
                      data.profile.waterGlassMl === ml
                        ? "var(--df-control-fill)"
                        : "var(--df-chip-fill)",
                    border:
                      data.profile.waterGlassMl === ml
                        ? "1.5px solid var(--df-control-border)"
                        : "0.5px solid var(--df-chip-border)",
                    color: "var(--df-text-primary)",
                  }}
                >
                  {ml} ml
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      </SectionCard>

      {/* Team Mode lives here, not in the dock — the bottom bar is
          capped at exactly five tabs (PRD §9.2). */}
      <TeamModeCard />
      <InstallAppCard />
      <ShortcutsSetupCard />
    </>
  );
}

function TeamModeCard() {
  return (
    <section
      className="rounded-lg p-4 mt-4"
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label="Team Mode"
    >
      <h2
        className="text-[13px] font-bold flex items-center gap-2"
        style={{ color: "var(--df-text-primary)" }}
      >
        <span style={{ color: "var(--df-accent)" }}>
          <Users className="h-4 w-4" />
        </span>
        Team Mode
      </h2>
      <p
        className="mt-2 text-[12.5px] leading-relaxed"
        style={{ color: "var(--df-text-secondary)" }}
      >
        Invite up to five people, share habit wins and streaks in real time, and
        keep your journal private. Everything else in Dayflow stays yours.
      </p>
      <Link
        href="/team"
        className="df-press df-btn-primary mt-3 inline-flex items-center h-9 px-4 text-[12.5px] font-semibold"
      >
        Open Team Mode
      </Link>
    </section>
  );
}

/* ---------------- goals ---------------- */

const GOAL_FIELDS: {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: "hours" | "minutes" | "count";
  help: string;
}[] = [
  { key: "workMinutes", label: "Work time", min: 0, max: 12, step: 0.5, unit: "hours", help: "Focused job time per day" },
  { key: "personalMinutes", label: "Personal work", min: 0, max: 8, step: 0.5, unit: "hours", help: "Side projects & learning per day" },
  { key: "fitnessMinutes", label: "Fitness", min: 0, max: 180, step: 15, unit: "minutes", help: "Active minutes per day" },
  { key: "fitnessSessionsPerWeek", label: "Workouts", min: 0, max: 7, step: 1, unit: "count", help: "Sessions per week" },
  { key: "sleepMinutes", label: "Sleep", min: 4, max: 12, step: 0.5, unit: "hours", help: "Hours per night" },
  { key: "waterGlasses", label: "Water", min: 2, max: 16, step: 1, unit: "count", help: "Glasses per day" },
  { key: "mealsPerDay", label: "Meals", min: 1, max: 6, step: 1, unit: "count", help: "Logged meals per day" },
];

function GoalsSection() {
  const data = useDayflowData();
  const profileRow = useDayflowStore((s) => s.profile);
  const updateProfileSections = useDayflowStore((s) => s.updateProfileSections);

  const toField = (key: string, unit: string) => {
    if (unit === "hours") return (data.goals as unknown as Record<string, number>)[key] / 60;
    return (data.goals as unknown as Record<string, number>)[key];
  };
  const setField = (key: string, unit: string, v: number) => {
    const val = unit === "hours" ? Math.round(v * 60) : Math.round(v);
    // Every target persists into its PRD §3 profile section (T0):
    // career/craft -> occupational_context, sleep -> chronobiology,
    // the rest -> metabolism. Water edits ride dailyWaterBaseMl.
    const occupation: Record<string, unknown> = {};
    const metabolism: Record<string, unknown> = {};
    const chronobiology: Record<string, unknown> = {};
    if (key === "workMinutes") occupation.dailyCareerTargetMinutes = val;
    else if (key === "personalMinutes") occupation.dailyPersonalCraftMinutes = val;
    else if (key === "fitnessMinutes") metabolism.fitnessMinutes = val;
    else if (key === "fitnessSessionsPerWeek") metabolism.workoutFrequencyTargetDays = val;
    else if (key === "sleepMinutes") chronobiology.targetSleepDurationMinutes = val;
    else if (key === "waterGlasses") metabolism.dailyWaterBaseMl = val * 250;
    else if (key === "mealsPerDay") metabolism.mealsPerDay = val;
    void updateProfileSections({
      ...(Object.keys(occupation).length > 0
        ? { occupational_context: mergeSection(profileRow?.occupational_context, occupation) }
        : {}),
      ...(Object.keys(metabolism).length > 0
        ? { metabolism: mergeSection(profileRow?.metabolism, metabolism) }
        : {}),
      ...(Object.keys(chronobiology).length > 0
        ? { chronobiology: mergeSection(profileRow?.chronobiology, chronobiology) }
        : {}),
    });
  };

  const occupation =
    profileRow?.occupational_context &&
    typeof profileRow.occupational_context === "object" &&
    !Array.isArray(profileRow.occupational_context)
      ? (profileRow.occupational_context as { status?: string; enforceMorningAnchor?: boolean })
      : {};
  const anchorOn = occupation.enforceMorningAnchor === true;

  return (
    <SectionCard title="Daily goals" icon={<Target className="h-4 w-4" />}>
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
        These targets drive the goal rings, the Habits grid, streaks, and the daily recap. Small
        sustainable numbers beat ambitious ones you ignore.
      </p>
      <div className="mt-3 flex flex-col gap-4 max-w-[520px]">
        {GOAL_FIELDS.map((f) => {
          const raw = toField(f.key, f.unit);
          const display =
            f.unit === "hours"
              ? `${raw.toFixed(1)}h`
              : f.unit === "minutes"
                ? `${Math.round(raw)}m`
                : `${Math.round(raw)}`;
          return (
            <div key={f.key}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
                  {f.label}
                </span>
                <span
                  className="text-[12px] font-bold tabular-nums"
                  style={{ color: "var(--df-summary-value)" }}
                >
                  {display}
                </span>
              </div>
              <p className="text-[10.5px]" style={{ color: "var(--df-text-muted)" }}>
                {f.help}
              </p>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={raw}
                onChange={(e) => setField(f.key, f.unit, Number(e.target.value))}
                aria-label={`${f.label} goal`}
                className="w-full mt-1.5 accent-[var(--df-accent)]"
                style={{ accentColor: "var(--df-accent)" }}
              />
            </div>
          );
        })}
      </div>

      {/* Morning anchor (PRD §4.9 / T1d) — arms the Focus-tab gate. */}
      <div
        className="mt-4 max-w-[520px] rounded-md px-3.5 py-3"
        style={{
          background: "var(--df-chip-fill)",
          border: "0.5px solid var(--df-chip-border)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
              Morning Triad lock
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--df-text-muted)" }}>
              Gate the Focus tab behind a 250&nbsp;ml hydration check-in + morning-light
              confirmation (PRD §4.9)
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={anchorOn}
            aria-label="Morning Triad lock"
            onClick={() =>
              void updateProfileSections({
                occupational_context: mergeSection(profileRow?.occupational_context, {
                  enforceMorningAnchor: !anchorOn,
                }),
              })
            }
            className="df-press shrink-0 rounded-full transition-colors"
            style={{
              width: 44,
              height: 26,
              padding: 2,
              background: anchorOn ? "var(--df-accent)" : "var(--df-segment-track)",
              border: "0.5px solid " + (anchorOn ? "color-mix(in srgb, var(--df-accent) 60%, transparent)" : "var(--df-chip-border)"),
            }}
          >
            <span
              className="block h-[21px] w-[21px] rounded-full transition-transform"
              style={{
                background: "var(--df-white)",
                transform: anchorOn ? "translateX(18px)" : "translateX(0)",
                boxShadow: "0 1px 2px var(--df-panel-shadow)",
              }}
            />
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

/* ---------------- appearance ---------------- */

function AppearanceSection({
  theme,
  setTheme,
}: {
  theme: string | undefined;
  setTheme: (t: string) => void;
}) {
  return (
    <SectionCard title="Appearance" icon={<Sun className="h-4 w-4" />}>
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
        Dayflow ships the same warm light palette and deep dusk dark palette on every platform.
        Pick how the app looks, or follow your system.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 max-w-[380px]">
        {(
          [
            { id: "light", label: "Light", icon: Sun, swatch: THEME_SWATCHES.light },
            { id: "dark", label: "Dark", icon: Moon, swatch: THEME_SWATCHES.dark },
            { id: "system", label: "System", icon: Monitor, swatch: THEME_SWATCHES.system },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            onClick={() => setTheme(opt.id)}
            className="df-press rounded-lg p-2.5 flex flex-col items-center gap-2"
            aria-pressed={theme === opt.id}
            style={{
              background: "var(--df-chip-fill)",
              border:
                theme === opt.id
                  ? "1.5px solid var(--df-accent)"
                  : "0.5px solid var(--df-chip-border)",
            }}
          >
            <span className="h-12 w-full rounded-md" style={{ background: opt.swatch }} />
            <span
              className="flex items-center gap-1 text-[11.5px] font-semibold"
              style={{ color: "var(--df-text-primary)" }}
            >
              <opt.icon className="h-3.5 w-3.5" />
              {opt.label}
              {theme === opt.id && <Check className="h-3 w-3" style={{ color: "var(--df-accent)" }} />}
            </span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

/* ---------------- data ---------------- */

function DataSection({
  onNavigate,
  onToast,
}: {
  onNavigate: (t: TabId) => void;
  onToast: (t: { title: string; description?: string }) => void;
}) {
  const data = useDayflowData();
  const habits = useDayflowStore((s) => s.habits);
  const habitLogs = useDayflowStore((s) => s.habitLogs);
  const hydrationLogs = useDayflowStore((s) => s.hydrationLogs);
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const sleepLogs = useDayflowStore((s) => s.sleepLogs);
  const journalEntries = useDayflowStore((s) => s.journalEntries);
  const lastSyncedAt = useDayflowStore((s) => s.lastSyncedAt);
  const syncError = useDayflowStore((s) => s.syncError);
  const isSyncing = useDayflowStore((s) => s.isSyncing);
  const [confirmReset, setConfirmReset] = useState(false);

  // Full JSON backup of everything the Delta Sync store holds —
  // the exact rows that live in Supabase under your account.
  const exportJson = () =>
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile: useDayflowStore.getState().profile,
        habits,
        habitLogs,
        hydrationLogs,
        workoutLogs,
        sleepLogs,
        journalEntries,
      },
      null,
      2
    );

  // Local cache reset: wipes the IndexedDB snapshot and re-pulls
  // every row from Supabase (the server is the source of truth).
  const resetLocalCache = async () => {
    await useDayflowStore.persist.clearStorage();
    useDayflowStore.setState({
      profile: null,
      habits: [],
      habitLogs: [],
      hydrationLogs: [],
      workoutLogs: [],
      sleepLogs: [],
      journalEntries: [],
      lastSyncCursor: null,
      lastSyncedAt: null,
      syncError: null,
    });
    await useDayflowStore.getState().syncDeltas();
  };

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rowCount =
    habits.length +
    habitLogs.length +
    hydrationLogs.length +
    workoutLogs.length +
    sleepLogs.length +
    journalEntries.length;

  return (
    <>
      <SectionCard title="Storage & Supabase" icon={<Database className="h-4 w-4" />}>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
          Delta Sync is live: every log writes to your Supabase account first, then mirrors into
          this browser&apos;s IndexedDB for offline reads. Rows written elsewhere (Apple
          Shortcuts, another device) are pulled on the next boot.
        </p>
        <div
          className="mt-3 rounded-md px-3.5 py-3 max-w-[460px]"
          style={{
            background: "var(--df-chip-fill)",
            border: "0.5px solid var(--df-chip-border)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: syncError ? "var(--df-destructive)" : "var(--df-streak)", boxShadow: "0 0 0 2px color-mix(in srgb, var(--df-streak) 30%, transparent)" }}
              />
              <span className="text-[12.5px] font-semibold flex items-center gap-1.5" style={{ color: "var(--df-text-primary)" }}>
                Supabase — {syncError ? "sync error (will retry)" : "connected"}
                {isSyncing && (
                  <span className="flex items-center gap-1.5">
                    <LogoLoop size="sm" />
                    <span className="text-[10.5px] font-medium" style={{ color: "var(--df-text-muted)" }}>
                      syncing…
                    </span>
                  </span>
                )}
              </span>
            </div>
            <span className="text-[10.5px]" style={{ color: "var(--df-text-muted)" }}>
              {rowCount} rows synced
            </span>
          </div>
          <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
            {lastSyncedAt
              ? `Last sync ${new Date(lastSyncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : "Sync runs on boot and after every write."}
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Export" icon={<Download className="h-4 w-4" />} className="mt-4">
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
          Take your data with you — full JSON backup, or any day as Markdown.
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            onClick={() => {
              download(exportJson(), "dayflow-data.json", "application/json");
              onToast({ title: "JSON backup downloaded" });
            }}
            className="df-press df-btn-secondary h-9 px-3.5 text-[12.5px] font-semibold flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Download JSON
          </button>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(dayToMarkdown(data, keyForOffset(0)));
                onToast({ title: "Today copied as Markdown" });
              } catch {
                onToast({ title: "Copy failed" });
              }
            }}
            className="df-press df-btn-secondary h-9 px-3.5 text-[12.5px] font-semibold flex items-center gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy today (.md)
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Reset" icon={<Lock className="h-4 w-4" />} className="mt-4">
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
          Clears this browser&apos;s IndexedDB snapshot and re-pulls every row from Supabase.
          Nothing on the server is deleted — this is a cache reset, not a data reset.
        </p>
        <div
          className="mt-3 flex items-center justify-between max-w-[460px] rounded-md px-3.5 py-3"
          style={{
            background: "var(--df-chip-fill)",
            border: "0.5px solid var(--df-chip-border)",
          }}
        >
          <div>
            <div className="text-[12.5px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
              Reset local cache
            </div>
            <div className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
              {confirmReset ? "Tap Reset again to confirm" : "Re-pull everything from Supabase"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {confirmReset && (
              <button
                onClick={() => setConfirmReset(false)}
                className="df-press df-btn-secondary h-9 px-3 rounded-md text-[12px] font-semibold"
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  return;
                }
                void resetLocalCache();
                setConfirmReset(false);
                onToast({ title: "Local cache cleared", description: "Re-pulling your rows from Supabase." });
              }}
              className="df-press h-9 px-3 rounded-md text-[12px] font-semibold flex items-center gap-1.5"
              style={{
                background: "color-mix(in srgb, var(--df-destructive) 12%, transparent)",
                border: "0.5px solid color-mix(in srgb, var(--df-destructive) 35%, transparent)",
                color: "var(--df-destructive-text)",
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="About this web build" icon={<Monitor className="h-4 w-4" />} className="mt-4">
        <div className="mb-3 flex items-center gap-2.5">
          <LogoMark size={26} />
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
            Dayflow AI
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {[
            "Timeline, Daily, Weekly, Habits, Journal, and Settings are fully interactive — every log persists to your Supabase account.",
            "Screen capture, OCR, menu bar, and the local agent bridge are native-Mac features and are intentionally absent.",
            "Offline-first: writes land in IndexedDB immediately and sync the moment you're back online (pending rows retry on boot).",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span
                className="mt-[6px] w-[4.5px] h-[4.5px] rounded-full shrink-0"
                style={{ background: "var(--df-accent)" }}
              />
              <span className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
                {line}
              </span>
            </li>
          ))}
        </ul>
        <button
          onClick={() => onNavigate("timeline")}
          className="mt-3 df-press df-btn-primary h-9 px-4 text-[12.5px] font-semibold"
        >
          Back to timeline
        </button>
      </SectionCard>
    </>
  );
}
