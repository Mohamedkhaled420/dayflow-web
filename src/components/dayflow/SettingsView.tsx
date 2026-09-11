"use client";

// SettingsView — profile, category, and goal customization.
// Everything the native app configures through macOS panes,
// tailored to the life tracker: who you are, what you track,
// and what "on target" means.

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Database,
  Download,
  KeyRound,
  Lock,
  Monitor,
  Moon,
  Palette,
  Plus,
  Sparkles,
  Sun,
  Target,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { CategoryIcon, CATEGORY_ICON_KEYS } from "@/components/dayflow/category-icons";
import {
  useDayflow,
  useDayflowData,
  useSortedCategories,
} from "@/lib/store";
import { dayToMarkdown } from "@/lib/compute";
import { keyForOffset } from "@/lib/seed";
import {
  clearApiKey,
  saveApiKey,
  useApiKey,
} from "@/lib/api-key-store";
import { useToast } from "@/hooks/use-toast";
import type { Goals } from "@/lib/types";
import type { TabId } from "@/components/dayflow/AppShell";
import { CATEGORY_SWATCHES, THEME_SWATCHES } from "@/styles/palette";
import { InstallAppCard } from "@/components/dayflow/InstallAppCard";
import { ShortcutsSetupCard } from "@/components/dayflow/ShortcutsSetupCard";

type Section = "profile" | "categories" | "goals" | "appearance" | "providers" | "data";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "categories", label: "Categories" },
  { id: "goals", label: "Goals" },
  { id: "appearance", label: "Appearance" },
  { id: "providers", label: "Providers" },
  { id: "data", label: "Data" },
];

// Category colors come from src/styles/palette.ts (single source).
const PALETTE = CATEGORY_SWATCHES;

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
      {section === "categories" && <CategoriesSection />}
      {section === "goals" && <GoalsSection />}
      {section === "appearance" && <AppearanceSection theme={theme} setTheme={setTheme} />}
      {section === "providers" && <ProvidersSection />}
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

function ProfileSection() {
  const data = useDayflowData();
  const updateProfile = useDayflow((s) => s.updateProfile);

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

/* ---------------- categories ---------------- */

function CategoriesSection() {
  const categories = useSortedCategories();
  const updateCategory = useDayflow((s) => s.updateCategory);
  const deleteCategory = useDayflow((s) => s.deleteCategory);
  const moveCategory = useDayflow((s) => s.moveCategory);
  const addCategory = useDayflow((s) => s.addCategory);
  const [openPalette, setOpenPalette] = useState<string | null>(null);
  const [openIcons, setOpenIcons] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const color = PALETTE[categories.length % PALETTE.length];
    addCategory({ name, colorHex: color, icon: "circle", kind: "time" });
    setNewName("");
  };

  return (
    <SectionCard title="Categories" icon={<Palette className="h-4 w-4" />}>
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
        Rename, recolor, reorder, or add categories — the timeline, weekly charts, and goals
        update everywhere instantly. The six goal categories are locked; custom ones just track time.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {categories.map((c) => (
          <div key={c.id}>
            <div
              className="flex items-center gap-2 rounded-md px-2.5 py-2"
              style={{
                background: "var(--df-chip-fill)",
                border: "0.5px solid var(--df-chip-border)",
              }}
            >
              {/* color */}
              <button
                onClick={() => {
                  setOpenPalette(openPalette === c.id ? null : c.id);
                  setOpenIcons(null);
                }}
                aria-label={`Change color for ${c.name}`}
                className="df-press w-6 h-6 rounded-md shrink-0"
                style={{
                  background: c.colorHex,
                  boxShadow: `0 0 0 2px color-mix(in srgb, ${c.colorHex} 28%, transparent)`,
                }}
              />
              {/* icon */}
              <button
                onClick={() => {
                  setOpenIcons(openIcons === c.id ? null : c.id);
                  setOpenPalette(null);
                }}
                aria-label={`Change icon for ${c.name}`}
                className="df-press w-8 h-8 rounded-md grid place-items-center shrink-0"
                style={{
                  background: "var(--df-input-fill)",
                  border: "0.5px solid var(--df-input-border)",
                  color: "var(--df-text-primary)",
                }}
              >
                <CategoryIcon name={c.icon} className="h-4 w-4" />
              </button>
              {/* name */}
              <div
                className="flex-1 min-w-0 rounded-md px-2.5 h-9 flex items-center"
                style={{
                  background: "var(--df-input-fill)",
                  border: "0.5px solid var(--df-input-border)",
                }}
              >
                <input
                  value={c.name}
                  onChange={(e) => updateCategory(c.id, { name: e.target.value })}
                  aria-label={`Name for ${c.name}`}
                  maxLength={28}
                  className="w-full bg-transparent outline-none text-[12.5px] font-medium"
                  style={{ color: "var(--df-text-primary)" }}
                />
              </div>
              {c.kind === "counter" && (
                <span
                  className="text-[9.5px] font-bold px-1.5 py-[2px] rounded-full shrink-0"
                  style={{
                    color: "var(--df-accent-text)",
                    background: "var(--df-chat-soft-fill)",
                    border: "0.5px solid var(--df-chat-soft-border)",
                  }}
                >
                  COUNTER
                </span>
              )}
              {/* order */}
              <div className="flex flex-col gap-[2px] shrink-0">
                <button
                  onClick={() => moveCategory(c.id, -1)}
                  aria-label={`Move ${c.name} up`}
                  className="df-press w-6 h-[14px] rounded-[4px] grid place-items-center"
                  style={{ background: "var(--df-input-fill)", border: "0.5px solid var(--df-input-border)" }}
                >
                  <ArrowUp className="h-2.5 w-2.5" style={{ color: "var(--df-text-secondary)" }} />
                </button>
                <button
                  onClick={() => moveCategory(c.id, 1)}
                  aria-label={`Move ${c.name} down`}
                  className="df-press w-6 h-[14px] rounded-[4px] grid place-items-center"
                  style={{ background: "var(--df-input-fill)", border: "0.5px solid var(--df-input-border)" }}
                >
                  <ArrowDown className="h-2.5 w-2.5" style={{ color: "var(--df-text-secondary)" }} />
                </button>
              </div>
              {/* delete */}
              <button
                onClick={() => deleteCategory(c.id)}
                disabled={c.isSystem}
                aria-label={`Delete ${c.name}`}
                title={c.isSystem ? "System categories power goals and can't be deleted" : "Delete category"}
                className="df-press w-8 h-8 rounded-md grid place-items-center shrink-0 disabled:opacity-30"
                style={{
                  background: "color-mix(in srgb, var(--df-destructive) 10%, transparent)",
                  border: "0.5px solid color-mix(in srgb, var(--df-destructive) 30%, transparent)",
                  color: "var(--df-destructive-text)",
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* palette popover */}
            {openPalette === c.id && (
              <div
                className="mt-1.5 rounded-lg p-2.5 flex flex-wrap gap-1.5 items-center"
                style={{
                  background: "var(--df-card-fill)",
                  border: "0.5px solid var(--df-card-border)",
                }}
              >
                {PALETTE.map((hex) => (
                  <button
                    key={hex}
                    onClick={() => {
                      updateCategory(c.id, { colorHex: hex });
                      setOpenPalette(null);
                    }}
                    aria-label={`Use color ${hex}`}
                    className="df-press w-7 h-7 rounded-md"
                    style={{
                      background: hex,
                      boxShadow:
                        c.colorHex === hex
                          ? `0 0 0 2.5px color-mix(in srgb, ${hex} 45%, transparent)`
                          : `0 0 0 1px color-mix(in srgb, ${hex} 30%, transparent)`,
                    }}
                  />
                ))}
                <label
                  className="df-press w-7 h-7 rounded-md grid place-items-center cursor-pointer text-[9px] font-bold"
                  style={{
                    background: "var(--df-input-fill)",
                    border: "0.5px solid var(--df-input-border)",
                    color: "var(--df-text-secondary)",
                  }}
                  title="Custom color"
                >
                  <Plus className="h-3 w-3" />
                  <input
                    type="color"
                    value={c.colorHex}
                    onChange={(e) => updateCategory(c.id, { colorHex: e.target.value })}
                    className="sr-only"
                    aria-label="Custom color picker"
                  />
                </label>
              </div>
            )}

            {/* icon popover */}
            {openIcons === c.id && (
              <div
                className="mt-1.5 rounded-lg p-2.5 grid grid-cols-8 gap-1.5"
                style={{
                  background: "var(--df-card-fill)",
                  border: "0.5px solid var(--df-card-border)",
                }}
              >
                {CATEGORY_ICON_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      updateCategory(c.id, { icon: key });
                      setOpenIcons(null);
                    }}
                    aria-label={`Use icon ${key}`}
                    className="df-press h-8 rounded-md grid place-items-center"
                    style={{
                      background: c.icon === key ? "var(--df-control-fill)" : "transparent",
                      border:
                        c.icon === key
                          ? "1.5px solid var(--df-control-border)"
                          : "0.5px solid transparent",
                      color: "var(--df-text-primary)",
                    }}
                  >
                    <CategoryIcon name={key} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* add */}
      <div className="mt-3 flex gap-2 max-w-[460px]">
        <div
          className="flex-1 rounded-md px-3 h-10 flex items-center"
          style={{
            background: "var(--df-input-fill)",
            border: "0.5px solid var(--df-input-border)",
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New category (e.g. Study, Commute, Meditation)"
            aria-label="New category name"
            maxLength={28}
            className="w-full bg-transparent outline-none text-[13px] placeholder:text-[var(--df-text-muted)]"
            style={{ color: "var(--df-text-primary)" }}
          />
        </div>
        <button
          onClick={add}
          disabled={!newName.trim()}
          className="df-press df-btn-primary h-10 px-4 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </SectionCard>
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
  const updateGoals = useDayflow((s) => s.updateGoals);

  const toField = (key: string, unit: string) => {
    if (unit === "hours") return (data.goals as unknown as Record<string, number>)[key] / 60;
    return (data.goals as unknown as Record<string, number>)[key];
  };
  const setField = (key: string, unit: string, v: number) => {
    const val = unit === "hours" ? Math.round(v * 60) : Math.round(v);
    const patch: Partial<Goals> = {};
    if (key === "workMinutes") patch.workMinutes = val;
    else if (key === "personalMinutes") patch.personalMinutes = val;
    else if (key === "fitnessMinutes") patch.fitnessMinutes = val;
    else if (key === "fitnessSessionsPerWeek") patch.fitnessSessionsPerWeek = val;
    else if (key === "sleepMinutes") patch.sleepMinutes = val;
    else if (key === "waterGlasses") patch.waterGlasses = val;
    else if (key === "mealsPerDay") patch.mealsPerDay = val;
    updateGoals(patch);
  };

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

/* ---------------- providers ---------------- */

function ProvidersSection() {
  const storedKey = useApiKey();
  const [keyDraft, setKeyDraft] = useState("");
  const [savedKey, setSavedKey] = useState(false);
  const { toast } = useToast();
  const showDraft = keyDraft !== "" || storedKey === "";

  const saveKey = () => {
    saveApiKey(keyDraft);
    setKeyDraft("");
    setSavedKey(true);
    setTimeout(() => setSavedKey(false), 1600);
    toast({
      title: "API key saved locally",
      description: "It never leaves your browser except to call the provider.",
    });
  };

  return (
    <>
      <SectionCard title="AI provider" icon={<KeyRound className="h-4 w-4" />}>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
          Chat runs with the local tracker engine by default — deterministic answers computed from
          your logs, no configuration. Add an API key to route it through a live model that
          still sees your data as context. The key is stored in your browser only.
        </p>
        <div className="mt-3 flex gap-2 max-w-[460px] items-center">
          {showDraft ? (
            <div
              className="flex-1 flex items-center rounded-md px-3 h-9"
              style={{
                background: "var(--df-input-fill)",
                border: "0.5px solid var(--df-input-border)",
              }}
            >
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="OpenAI or Gemini API key (optional)"
                aria-label="API key"
                className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-[var(--df-text-muted)]"
                style={{ color: "var(--df-text-primary)" }}
              />
            </div>
          ) : (
            <div
              className="flex-1 flex items-center gap-2 rounded-md px-3 h-9 text-[12.5px] font-medium"
              style={{
                background: "var(--df-input-fill)",
                border: "0.5px solid var(--df-input-border)",
                color: "var(--df-text-primary)",
              }}
            >
              <KeyRound className="h-3.5 w-3.5" style={{ color: "var(--df-accent)" }} />
              A key is saved in this browser
            </div>
          )}
          <button
            onClick={saveKey}
            disabled={!keyDraft.trim()}
            className="df-press df-btn-primary px-4 h-9 text-[12.5px] font-semibold disabled:opacity-40"
          >
            {savedKey ? "Saved" : "Save"}
          </button>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--df-text-muted)" }}>
          Gemini keys (starting with &quot;AIza&quot;) route to Google; everything else routes to
          the OpenAI-compatible API.
        </p>
      </SectionCard>

      <SectionCard title="Provider presets" icon={<Sparkles className="h-4 w-4" />} className="mt-4">
        <div className="grid sm:grid-cols-2 gap-2.5">
          <ProviderRow name="Local tracker engine" desc="Runs in this app, zero config, answers from your logs." active />
          <ProviderRow name="OpenAI / Gemini" desc="Bring your own key above for live LLM answers grounded in your tracker." />
          <ProviderRow name="Local LLM (Ollama)" desc="Native-app only — the browser can't reach a localhost model server." disabled />
          <ProviderRow name="Claude / Codex CLI" desc="Native-app only — providers run through the local CLI bridge." disabled />
        </div>
      </SectionCard>
    </>
  );
}

function ProviderRow({
  name,
  desc,
  active,
  disabled,
}: {
  name: string;
  desc: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className="rounded-md p-3"
      style={{
        background: "var(--df-chip-fill)",
        border: active
          ? "1.5px solid var(--df-accent)"
          : "0.5px solid var(--df-chip-border)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-bold" style={{ color: "var(--df-text-primary)" }}>
          {name}
        </span>
        {active && (
          <span
            className="text-[9.5px] font-bold px-1.5 py-[1px] rounded-full"
            style={{
              color: "var(--df-accent-text)",
              background: "var(--df-chat-soft-fill)",
              border: "0.5px solid var(--df-chat-soft-border)",
            }}
          >
            ACTIVE
          </span>
        )}
        {disabled && (
          <span
            className="text-[9.5px] font-bold px-1.5 py-[1px] rounded-full"
            style={{ color: "var(--df-text-muted)" }}
          >
            NATIVE ONLY
          </span>
        )}
      </div>
      <p className="text-[11.5px] leading-relaxed mt-1" style={{ color: "var(--df-text-secondary)" }}>
        {desc}
      </p>
    </div>
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
  const exportJson = useDayflow((s) => s.exportJson);
  const resetDemoData = useDayflow((s) => s.resetDemoData);
  const [confirmReset, setConfirmReset] = useState(false);

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eventCount = data.events.length;
  const waterCount = data.water.length;

  return (
    <>
      <SectionCard title="Storage & Supabase" icon={<Database className="h-4 w-4" />}>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--df-text-secondary)" }}>
          Mock mode: all data lives in this browser&apos;s localStorage — nothing is sent anywhere.
          The data layer is provider-agnostic and mirrors the Supabase schema in{" "}
          <code className="text-[11.5px]" style={{ color: "var(--df-accent-text)" }}>
            /supabase/schema.sql
          </code>
          , so switching to the hosted database later is a one-file change.
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
                style={{ background: "var(--df-streak)", boxShadow: "0 0 0 2px color-mix(in srgb, var(--df-streak) 30%, transparent)" }}
              />
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
                Supabase — not connected
              </span>
            </div>
            <span className="text-[10.5px]" style={{ color: "var(--df-text-muted)" }}>
              {eventCount} blocks · {waterCount} glasses · local
            </span>
          </div>
          <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
            When you&apos;re ready: create a project, run the SQL file, set{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> / <code>SUPABASE_ANON_KEY</code> env vars, and swap the provider in{" "}
            <code>src/lib/store.ts</code>. The README walks through it.
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
          Regenerate the demo dataset (last 7 days) and restore default goals, categories, and
          profile. Your own logged blocks will be replaced.
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
              Reset demo data
            </div>
            <div className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
              {confirmReset ? "Tap Reset again to confirm" : "Restore the sample week"}
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
                resetDemoData();
                setConfirmReset(false);
                clearApiKey();
                onToast({ title: "Demo data regenerated", description: "Fresh sample week loaded." });
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
        <ul className="flex flex-col gap-1.5">
          {[
            "Timeline, Daily, Weekly, Habits, Chat, and Settings are fully interactive — log, edit, and delete your own blocks.",
            "Screen capture, OCR, menu bar, and the local agent bridge are native-Mac features and are intentionally absent.",
            "Mock data stands in so every view works end-to-end; swap to Supabase when you're ready (see /supabase/schema.sql).",
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
