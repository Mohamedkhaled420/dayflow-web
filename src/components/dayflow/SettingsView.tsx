"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import {
  Check,
  Copy,
  Download,
  FileText,
  KeyRound,
  Laptop,
  Lock,
  Monitor,
  Moon,
  Sun,
  Trash2,
} from "lucide-react";
import { timelineToMarkdown } from "@/lib/demo-data";
import {
  clearApiKey,
  saveApiKey,
  useApiKey,
} from "@/lib/api-key-store";
import { useToast } from "@/hooks/use-toast";
import type { TabId } from "@/components/dayflow/AppShell";

type Section = "appearance" | "providers" | "data";

export function SettingsView({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  const [section, setSection] = useState<Section>("appearance");
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const storedKey = useApiKey();
  const [keyDraft, setKeyDraft] = useState("");
  const [savedKey, setSavedKey] = useState(false);
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
    <div className="df-scroll h-full overflow-y-auto px-4 sm:px-6 py-5">
      <h1
        className="text-[21px] font-bold tracking-tight"
        style={{ color: "var(--df-text-primary)" }}
      >
        Settings
      </h1>

      {/* section tabs */}
      <div className="mt-4 inline-flex rounded-[7px] p-[3px]"
        style={{
          background: "var(--df-segment-track)",
          border: "0.5px solid var(--df-segment-track-border)",
        }}
        role="tablist"
        aria-label="Settings sections"
      >
        {(["appearance", "providers", "data"] as Section[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={section === s}
            onClick={() => setSection(s)}
            className="df-press px-3.5 h-[26px] rounded-[5px] text-[12px] font-semibold capitalize"
            style={
              section === s
                ? {
                    background: "var(--df-control-fill)",
                    border: "0.5px solid var(--df-control-border)",
                    boxShadow: "inset 0 0 0 2px var(--df-control-glow)",
                    color: "var(--df-text-primary)",
                  }
                : { color: "var(--df-segment-inactive)" }
            }
          >
            {s}
          </button>
        ))}
      </div>

      {section === "appearance" && (
        <SectionCard title="Appearance" icon={<Sun className="h-4 w-4" />}>
          <p
            className="text-[12.5px] leading-relaxed"
            style={{ color: "var(--df-text-secondary)" }}
          >
            Dayflow ships the same warm light palette and deep dusk dark palette
            on every platform. Pick how the app looks, or follow your system.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 max-w-[380px]">
            {(
              [
                { id: "light", label: "Light", icon: Sun, swatch: "linear-gradient(135deg, #FFE6CF, #D6E8FF)" },
                { id: "dark", label: "Dark", icon: Moon, swatch: "linear-gradient(135deg, #303C5B, #3B2B4B)" },
                { id: "system", label: "System", icon: Monitor, swatch: "linear-gradient(135deg, #FFE6CF 50%, #3B2B4B 50%)" },
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
                <span
                  className="h-12 w-full rounded-md"
                  style={{ background: opt.swatch }}
                />
                <span
                  className="flex items-center gap-1 text-[11.5px] font-semibold"
                  style={{ color: "var(--df-text-primary)" }}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  {opt.label}
                  {theme === opt.id && (
                    <Check className="h-3 w-3" style={{ color: "var(--df-accent)" }} />
                  )}
                </span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {section === "providers" && (
        <>
          <SectionCard title="AI provider" icon={<KeyRound className="h-4 w-4" />}>
            <p
              className="text-[12.5px] leading-relaxed"
              style={{ color: "var(--df-text-secondary)" }}
            >
              The native app can run entirely with local models. In the browser,
              chat runs with a local journal engine by default — add an API key
              to route it through a live model. The key is stored in your
              browser only.
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
                  <KeyRound
                    className="h-3.5 w-3.5"
                    style={{ color: "var(--df-accent)" }}
                  />
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
            <p
              className="mt-2 text-[11px]"
              style={{ color: "var(--df-text-muted)" }}
            >
              Gemini keys (starting with &quot;AIza&quot;) route to Google;
              everything else routes to the OpenAI-compatible API.
            </p>
          </SectionCard>

          <SectionCard
            title="Provider presets"
            icon={<Laptop className="h-4 w-4" />}
            className="mt-4"
          >
            <div className="grid sm:grid-cols-2 gap-2.5">
              <ProviderRow name="Local journal engine" desc="Runs in this app, zero config, answers from your timeline data." active />
              <ProviderRow name="OpenAI / Gemini" desc="Bring your own key above for live LLM answers grounded in your journal." />
              <ProviderRow name="Local LLM (Ollama)" desc="Native-app only — the browser can't reach a localhost model server." disabled />
              <ProviderRow name="Claude / Codex CLI" desc="Native-app only — providers run through the local CLI bridge." disabled />
            </div>
          </SectionCard>
        </>
      )}

      {section === "data" && (
        <>
          <SectionCard title="Timeline export" icon={<FileText className="h-4 w-4" />}>
            <p
              className="text-[12.5px] leading-relaxed"
              style={{ color: "var(--df-text-secondary)" }}
            >
              Export any day as Markdown — useful for status updates, client
              notes, or a searchable archive.
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(timelineToMarkdown(0));
                    toast({ title: "Today's timeline copied as Markdown" });
                  } catch {
                    toast({ title: "Copy failed" });
                  }
                }}
                className="df-press df-btn-secondary h-9 px-3.5 text-[12.5px] font-semibold flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy today
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([timelineToMarkdown(0)], {
                    type: "text/markdown",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "dayflow-timeline.md";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="df-press df-btn-secondary h-9 px-3.5 text-[12.5px] font-semibold flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Download .md
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Storage" icon={<Lock className="h-4 w-4" />} className="mt-4">
            <p
              className="text-[12.5px] leading-relaxed"
              style={{ color: "var(--df-text-secondary)" }}
            >
              Everything you see lives in your browser — there is no server-side
              account. The native app keeps recordings, thumbnails, and the
              database on your Mac with automatic cleanup; the web demo keeps
              only your settings and chat key in local storage.
            </p>
            <div className="mt-3 flex items-center justify-between max-w-[460px] rounded-md px-3.5 py-3"
              style={{
                background: "var(--df-chip-fill)",
                border: "0.5px solid var(--df-chip-border)",
              }}>
              <div>
                <div
                  className="text-[12.5px] font-semibold"
                  style={{ color: "var(--df-text-primary)" }}
                >
                  Reset local settings
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: "var(--df-text-muted)" }}
                >
                  Clears the saved API key and preferences
                </div>
              </div>
              <button
                onClick={() => {
                  clearApiKey();
                  setKeyDraft("");
                  toast({ title: "Local settings cleared" });
                }}
                className="df-press h-9 px-3 rounded-md text-[12px] font-semibold flex items-center gap-1.5"
                style={{
                  background: "color-mix(in srgb, #FF5950 12%, transparent)",
                  border: "0.5px solid color-mix(in srgb, #FF5950 35%, transparent)",
                  color: "#E55A3E",
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
          </SectionCard>

          <SectionCard title="About this web build" icon={<Monitor className="h-4 w-4" />} className="mt-4">
            <ul className="flex flex-col gap-1.5">
              {[
                "Timeline, Daily, Weekly, Chat, Agents, and Settings views are fully interactive.",
                "Screen capture, pause, menu bar, and the local agent bridge are native-Mac features and are intentionally absent.",
                "Sample data stands in for captured activity so every view works end-to-end.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span
                    className="mt-[6px] w-[4.5px] h-[4.5px] rounded-full shrink-0"
                    style={{ background: "var(--df-accent)" }}
                  />
                  <span
                    className="text-[12.5px] leading-relaxed"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
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
      )}
    </div>
  );
}

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
      <h2
        className="text-[13px] font-bold flex items-center gap-2"
        style={{ color: "var(--df-text-primary)" }}
      >
        <span style={{ color: "var(--df-accent)" }}>{icon}</span>
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
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
        <span
          className="text-[12.5px] font-bold"
          style={{ color: "var(--df-text-primary)" }}
        >
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
      <p
        className="text-[11.5px] leading-relaxed mt-1"
        style={{ color: "var(--df-text-secondary)" }}
      >
        {desc}
      </p>
    </div>
  );
}
