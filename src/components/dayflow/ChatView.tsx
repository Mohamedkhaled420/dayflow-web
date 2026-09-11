"use client";

// ============================================================
// Dayflow AI — JournalView (Phase 5 T1a, PRD §4.4 — Phase 8
// Dia chat shell rework)
// ------------------------------------------------------------
// The Journal surface now lives inside the Dia browser shell
// (decision 3 revision): the chrome is FUNCTIONAL, not
// decorative —
//   traffic lights  → live sync status (isSyncing +
//                     navigator.onLine + syncError)
//   back / forward  → walk the journal entry history
//   refresh         → re-run the last coach answer
//   omnibar         → coach context + privacy (click to switch
//                     journal ↔ training; 🔒 = owner-only RLS)
// Entries are written through the Delta Sync store exactly as
// before (journal_entries, owner-only RLS); the composer is now
// RICH TEXT (decision 1) whose HTML is stored in content and
// re-rendered only through sanitizeJournalHtml(). "Ask Coach"
// calls /api/ai/coach — mode journal (CBT/Stoic, last-3-entries
// context) or mode coaching with the training system prompt
// when the omnibar is on coach://workout (Amendment #12 Bearer
// auth; cascade + algorithmic floor live server-side).
// a11y: the flow is role="log" + aria-live="polite"; asking
// sets aria-busy and a visually-hidden live region (A-5).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Frown,
  Laugh,
  Meh,
  NotebookPen,
  Smile,
  Sparkles,
} from "lucide-react";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useDayflowData } from "@/lib/viewmodel";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic, hapticSelect } from "@/lib/haptics";
import { LogoLoop } from "@/components/brand/LogoLoop";
import {
  DiaChatShell,
  type DiaCoachMode,
  type DiaSyncState,
} from "@/components/dayflow/DiaChatShell";
import { JournalComposer } from "@/components/dayflow/JournalComposer";
import { journalHtmlToText, sanitizeJournalHtml } from "@/lib/journal-html";

const MOODS = [
  { score: 1, label: "Rough", Icon: Frown },
  { score: 2, label: "Low", Icon: Frown },
  { score: 3, label: "Okay", Icon: Meh },
  { score: 4, label: "Good", Icon: Smile },
  { score: 5, label: "Great", Icon: Laugh },
] as const;

/** Quick cards — preset prompts (decision 3: chips, not mock cards). */
const PRESETS: { label: string; prompt: string; mode: DiaCoachMode }[] = [
  {
    label: "Weekly patterns",
    prompt: "What patterns do you see across my recent entries?",
    mode: "journal",
  },
  {
    label: "Reframe a rough day",
    prompt: "Today felt heavy. Help me reframe it and pick one concrete next step.",
    mode: "journal",
  },
  {
    label: "Plan tomorrow",
    prompt: "Given my recent entries, where should my first focus block go tomorrow?",
    mode: "journal",
  },
  {
    label: "Train today",
    prompt: "How should I train today, given my recent workouts?",
    mode: "workout",
  },
];

const SYSTEM_PROMPTS: Record<DiaCoachMode, string> = {
  journal:
    "You are Dayflow's psychology coach — CBT and Stoic framing, warm, concrete, brief. Reflect the user's own logged entries back to them. Never give medical advice; suggest professional help for clinical concerns.",
  workout:
    "You are Dayflow's strength & conditioning coach in conversation — practical, warm, brief. Ground every suggestion in the user's logged sessions; favor progression, recovery, and one concrete next step. Never give medical advice.",
};

interface CoachTurn {
  id: number;
  role: "user" | "coach";
  content: string;
}

export function ChatView() {
  const journalEntries = useDayflowStore((s) => s.journalEntries);
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const addJournalEntry = useDayflowStore((s) => s.addJournalEntry);
  const isSyncing = useDayflowStore((s) => s.isSyncing);
  const syncError = useDayflowStore((s) => s.syncError);
  const data = useDayflowData();
  const { toast } = useToast();

  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState<number>(3);
  const [saving, setSaving] = useState(false);
  const [coachTurns, setCoachTurns] = useState<CoachTurn[]>([]);
  const [asking, setAsking] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [mode, setMode] = useState<DiaCoachMode>("journal");
  /** null = live at the newest entry; n = history pointer into
   *  the newest-first entries array (browser-style navigation). */
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Newest first for the reading list; coach context wants the
  // last-3 in chronological order.
  const entries = useMemo(
    () => [...journalEntries].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [journalEntries]
  );

  const recentWorkouts = useMemo(
    () =>
      [...workoutLogs]
        .sort((a, b) => b.logged_at.localeCompare(a.logged_at))
        .slice(0, 3),
    [workoutLogs]
  );

  // Traffic lights data source: network + delta-sync state.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const sync: DiaSyncState = !online || syncError ? "error" : isSyncing ? "pending" : "ok";

  // Auto-scroll: follow the flow at the live end; when browsing
  // history, bring the pointed entry into view instead.
  useEffect(() => {
    if (historyCursor !== null) {
      const target = scrollRef.current?.querySelector(
        `[data-entry-index="${historyCursor}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries.length, coachTurns.length, asking, historyCursor]);

  const draftText = journalHtmlToText(draft).trim();

  const saveEntry = async () => {
    if (!draftText || saving) return;
    setSaving(true);
    try {
      await addJournalEntry({ content: draft, mood_score: mood });
      triggerHaptic(); // T2a: haptic on every journal save
      setDraft(""); // composer resyncs via its external-reset path
      toast({ title: "Journal saved", description: MOODS[mood - 1].label });
    } finally {
      setSaving(false);
    }
  };

  const askCoach = async (question: string, repeat = false) => {
    if (!question || asking) return;
    setAsking(true);
    setCoachError(null);
    if (!repeat) {
      setCoachTurns((t) => [...t, { id: Date.now(), role: "user", content: question }]);
      setDraft("");
    }
    try {
      // Amendment #12: live session JWT on the Bearer.
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setCoachError("Sign in again — your session expired.");
        return;
      }
      // Context (§10.1 prompt discipline; the route re-caps at
      // 4K tokens before any Groq call): last 3 entries for the
      // journal coach, last 3 sessions for the training coach.
      const context =
        mode === "journal"
          ? entries.slice(0, 3).reverse().map((e) => ({
              role: "user" as const,
              content: `[journal ${e.created_at.slice(0, 10)}${
                e.mood_score ? ` · mood ${e.mood_score}/5` : ""
              }] ${journalHtmlToText(e.content).slice(0, 600)}`,
            }))
          : recentWorkouts.map((w) => ({
              role: "user" as const,
              content: `[workout ${w.logged_at.slice(0, 10)}] ${w.type}${
                w.duration_minutes ? ` · ${w.duration_minutes}m` : ""
              }`,
            }));
      // Omnibar mode maps to the route's conversational modes:
      // journal → journal (reasoning), workout → coaching.
      const apiMode = mode === "journal" ? "journal" : "coaching";
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: apiMode,
          messages: [
            { role: "system", content: SYSTEM_PROMPTS[mode] },
            ...context,
            { role: "user", content: question },
          ],
        }),
      });
      if (!res.ok) {
        setCoachError(`Coach unavailable (HTTP ${res.status}).`);
        return;
      }
      const payload = (await res.json()) as { text?: string; error?: string };
      if (payload.error || !payload.text) {
        setCoachError(payload.error ?? "The coach had nothing to say.");
        return;
      }
      setCoachTurns((t) => [
        ...t,
        { id: Date.now() + 1, role: "coach", content: payload.text! },
      ]);
    } catch {
      setCoachError("The coach couldn't be reached. Try again in a moment.");
    } finally {
      setAsking(false);
    }
  };

  /** Refresh control: re-run the last coach answer (decision 3). */
  const rerunCoach = () => {
    const lastQuestion = [...coachTurns].reverse().find((t) => t.role === "user");
    if (lastQuestion) void askCoach(lastQuestion.content, true);
  };
  const lastUserQuestion = [...coachTurns].reverse().find((t) => t.role === "user");
  const refreshDisabled = asking || !lastUserQuestion;

  /** Browser-style history navigation over the entries list. */
  const goBack = () => {
    setHistoryCursor((c) =>
      Math.min((c ?? 0) + 1, Math.max(0, entries.length - 1))
    );
    hapticSelect();
  };
  const goForward = () => {
    setHistoryCursor((c) => (c === null ? null : c === 0 ? null : c - 1));
    hapticSelect();
  };
  const backDisabled = entries.length === 0 || (historyCursor ?? 0) >= entries.length - 1;
  const forwardDisabled = historyCursor === null;

  const cycleMode = () => {
    hapticSelect();
    setMode((m) => (m === "journal" ? "workout" : "journal"));
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    hapticSelect();
    setMode(preset.mode);
    setDraft(preset.prompt);
  };

  const firstName = data.profile.name.split(" ")[0];

  return (
    <DiaChatShell
      sync={sync}
      mode={mode}
      onModeChange={cycleMode}
      onBack={goBack}
      backDisabled={backDisabled}
      onForward={goForward}
      forwardDisabled={forwardDisabled}
      onRefresh={rerunCoach}
      refreshDisabled={refreshDisabled}
      historyPosition={
        historyCursor !== null && entries.length > 0
          ? `${historyCursor + 1} / ${entries.length}`
          : undefined
      }
      footer={
        <div
          className="px-4 pb-[calc(0.75rem+max(0px,var(--keyboard-height,0px)))] pt-2 sm:px-6"
        >
          {/* quick cards — preset prompt chips */}
          <div
            className="df-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2"
            role="list"
            aria-label="Quick prompts for the coach"
          >
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                role="listitem"
                onClick={() => applyPreset(preset)}
                aria-label={`Ask coach: ${preset.label}`}
                className="df-press df-chip flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium"
              >
                <Sparkles
                  className="h-3 w-3"
                  style={{ color: "var(--df-accent)" }}
                  aria-hidden="true"
                />
                {preset.label}
              </button>
            ))}
          </div>

          {/* mood picker */}
          <div className="mb-2 flex items-center gap-1.5" role="radiogroup" aria-label="Mood for this entry">
            {MOODS.map((m) => {
              const active = mood === m.score;
              return (
                <button
                  key={m.score}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={m.label}
                  onClick={() => setMood(m.score)}
                  className="df-press grid min-h-11 min-w-11 place-items-center rounded-full"
                  style={{
                    background: active ? "var(--df-chat-soft-fill)" : "transparent",
                    border: active
                      ? "1.5px solid color-mix(in srgb, var(--df-accent) 55%, transparent)"
                      : "1.5px solid transparent",
                  }}
                >
                  <m.Icon
                    className="h-5 w-5"
                    style={{ color: active ? "var(--df-accent)" : "var(--df-text-muted)" }}
                  />
                </button>
              );
            })}
          </div>

          {/* rich-text composer (decision 1) */}
          <JournalComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void saveEntry()}
          />

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveEntry()}
              disabled={!draftText || saving}
              className="df-press df-btn-primary min-h-11 flex items-center gap-1.5 rounded-md px-4 text-[12.5px] font-semibold disabled:opacity-40"
            >
              <NotebookPen className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save entry"}
            </button>
            <button
              type="button"
              onClick={() => void askCoach(draftText)}
              disabled={!draftText || asking}
              aria-busy={asking}
              aria-label={asking ? "Coach is thinking" : "Ask the coach about this"}
              className="df-press df-btn-secondary min-h-11 flex items-center gap-1.5 rounded-md px-4 text-[12.5px] font-semibold disabled:opacity-40"
            >
              {asking ? (
                <LogoLoop size="sm" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--df-accent)" }} />
              )}
              {asking ? "thinking…" : "Ask Coach"}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px]" style={{ color: "var(--df-text-muted)" }}>
            Entries stay owner-only (RLS). Ask Coach sends your{" "}
            {mode === "journal" ? "last 3 entries" : "last 3 workouts"} for context.
          </p>
        </div>
      }
    >
      {/* message flow — the shell's hero area */}
      <div
        ref={scrollRef}
        className="df-scroll h-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2 pt-3 sm:px-6 flex"
        role="log"
        aria-label="Journal entries and coach replies"
        aria-live="polite"
        aria-busy={asking}
      >
        {/* privacy masthead — the omnibar carries mode, this carries intent */}
        <p className="text-[11.5px]" style={{ color: "var(--df-text-muted)" }}>
          Journal — private to your account, never shared with your team.
        </p>

        {entries.length === 0 && coachTurns.length === 0 && (
          <div className="df-card mt-3 p-5 text-center">
            <p className="text-[13px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
              Nothing written yet
            </p>
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--df-text-secondary)" }}>
              Hi {firstName} — write the first entry below, then ask your coach about it.
            </p>
          </div>
        )}

        {coachTurns.map((t) => (
          <Bubble key={t.id} role={t.role === "user" ? "user" : "coach"}>
            {t.content}
          </Bubble>
        ))}

        {asking && (
          <div className="df-generating h-[34px] max-w-[60%] rounded-lg" aria-label="Coach is thinking">
            <div className="flex h-full items-center gap-1.5 px-4">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--df-text-muted)" }}
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </div>
          </div>
        )}

        {coachError && (
          <p
            className="max-w-[80%] self-start rounded-md px-3 py-2 text-[12px]"
            role="alert"
            style={{
              color: "var(--df-destructive-text)",
              background: "color-mix(in srgb, var(--df-destructive) 12%, transparent)",
            }}
          >
            {coachError}
          </p>
        )}

        {entries.map((e, i) => {
          const moodMeta = e.mood_score ? MOODS[Math.min(4, Math.max(0, e.mood_score - 1))] : null;
          const highlighted = historyCursor === i;
          return (
            <article
              key={e.id}
              data-entry-index={i}
              className="rounded-[12px] px-3.5 py-2.5"
              style={{
                background: "var(--df-card-fill)",
                border: highlighted
                  ? "1.5px solid var(--df-accent)"
                  : "0.5px solid var(--df-card-border)",
                boxShadow: "inset 0 0 0 2px var(--df-card-glow)",
              }}
            >
              <div className="flex items-center gap-2">
                {moodMeta ? (
                  <span
                    className="flex items-center gap-1 rounded-full px-1.5 py-[1px]"
                    style={{
                      background: "var(--df-chip-fill)",
                      border: "0.5px solid var(--df-chip-border)",
                    }}
                    aria-label={`Mood: ${moodMeta.label} (${e.mood_score} of 5)`}
                  >
                    <moodMeta.Icon className="h-3 w-3" style={{ color: "var(--df-accent)" }} />
                    <span className="text-[10px] font-semibold" style={{ color: "var(--df-text-secondary)" }}>
                      {moodMeta.label}
                    </span>
                  </span>
                ) : null}
                <time
                  className="text-[10px] tabular-nums"
                  style={{ color: "var(--df-text-muted)" }}
                  dateTime={e.created_at}
                >
                  {new Date(e.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
                {e.pending_sync && (
                  <span className="text-[9px] font-bold uppercase" style={{ color: "var(--df-text-muted)" }}>
                    pending
                  </span>
                )}
              </div>
              {/* Stored HTML — rendered ONLY through the allowlist
                  sanitizer; legacy plain-text entries arrive
                  pre-escaped and take the same path. */}
              <div
                className="df-prose mt-1.5 text-[13px]"
                style={{ color: "var(--df-text-primary)" }}
                dangerouslySetInnerHTML={{ __html: sanitizeJournalHtml(e.content) }}
              />
            </article>
          );
        })}
      </div>
    </DiaChatShell>
  );
}

function Bubble({ role, children }: { role: "user" | "coach"; children: string }) {
  const isUser = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`max-w-[78%] rounded-[12px] px-3.5 py-2.5 sm:max-w-[62%] ${
        isUser ? "self-end" : "self-start"
      }`}
      style={
        isUser
          ? {
              background: "var(--df-chat-soft-fill)",
              border: "0.5px solid var(--df-chat-soft-border)",
            }
          : {
              background: "var(--df-card-fill)",
              border: "0.5px solid var(--df-card-border)",
              boxShadow: "inset 0 0 0 2px var(--df-card-glow)",
            }
      }
    >
      <p
        className="text-[13px] leading-[1.5] whitespace-pre-wrap"
        style={{ color: "var(--df-text-primary)" }}
      >
        {children}
      </p>
    </motion.div>
  );
}
