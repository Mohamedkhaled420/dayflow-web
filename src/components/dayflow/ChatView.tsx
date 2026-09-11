"use client";

// ============================================================
// Dayflow AI — JournalView (Phase 5 T1a, PRD §4.4)
// ------------------------------------------------------------
// Replaces the legacy BYO-key Chat view: every entry writes to
// journal_entries through the Delta Sync store (owner-only RLS),
// the scrollable list carries mood indicators, and "Ask Coach"
// calls /api/ai/coach (mode: journal) with the last 3 entries as
// context (Amendment #12 Bearer auth; the route caps the prompt
// and runs the Groq cascade with the algorithmic floor as the
// final fallback).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
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
import { triggerHaptic } from "@/lib/haptics";

const MOODS = [
  { score: 1, label: "Rough", Icon: Frown },
  { score: 2, label: "Low", Icon: Frown },
  { score: 3, label: "Okay", Icon: Meh },
  { score: 4, label: "Good", Icon: Smile },
  { score: 5, label: "Great", Icon: Laugh },
] as const;

interface CoachTurn {
  id: number;
  role: "user" | "coach";
  content: string;
}

export function ChatView() {
  const journalEntries = useDayflowStore((s) => s.journalEntries);
  const addJournalEntry = useDayflowStore((s) => s.addJournalEntry);
  const data = useDayflowData();
  const { toast } = useToast();

  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState<number>(3);
  const [saving, setSaving] = useState(false);
  const [coachTurns, setCoachTurns] = useState<CoachTurn[]>([]);
  const [asking, setAsking] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Newest first for the reading list; coach context wants the
  // last-3 in chronological order.
  const entries = useMemo(
    () => [...journalEntries].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [journalEntries]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries.length, coachTurns.length, asking]);

  const saveEntry = async () => {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      await addJournalEntry({ content, mood_score: mood });
      triggerHaptic(); // T2a: haptic on every journal save
      setDraft("");
      toast({ title: "Journal saved", description: MOODS[mood - 1].label });
    } finally {
      setSaving(false);
    }
  };

  const askCoach = async () => {
    const question = draft.trim();
    if (!question || asking) return;
    setAsking(true);
    setCoachError(null);
    setCoachTurns((t) => [...t, { id: Date.now(), role: "user", content: question }]);
    setDraft("");
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
      // Last 3 entries as context (§10.1 prompt discipline; the
      // route re-caps at 4K tokens before any Groq call).
      const context = entries.slice(0, 3).reverse().map((e) => ({
        role: "user" as const,
        content: `[journal ${e.created_at.slice(0, 10)}${e.mood_score ? ` · mood ${e.mood_score}/5` : ""}] ${e.content}`,
      }));
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: "journal",
          messages: [
            {
              role: "system",
              content:
                "You are Dayflow's psychology coach — CBT and Stoic framing, warm, concrete, brief. Reflect the user's own logged entries back to them. Never give medical advice; suggest professional help for clinical concerns.",
            },
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

  const firstName = data.profile.name.split(" ")[0];

  return (
    <div className="flex flex-col h-full">
      {/* header */}
      <header className="px-4 sm:px-6 py-4 flex items-center gap-2.5">
        <span
          className="w-8 h-8 rounded-[9px] grid place-items-center"
          style={{
            background: "var(--df-chat-soft-fill)",
            border: "0.5px solid var(--df-chat-soft-border)",
          }}
        >
          <NotebookPen className="h-4 w-4" style={{ color: "var(--df-accent)" }} />
        </span>
        <div>
          <h1 className="text-[15.5px] font-bold leading-tight" style={{ color: "var(--df-text-primary)" }}>
            Journal
          </h1>
          <p className="text-[11.5px]" style={{ color: "var(--df-text-muted)" }}>
            Private to your account — entries sync through Dayflow, never to your team
          </p>
        </div>
      </header>

      {/* entries + coach conversation */}
      <div
        ref={scrollRef}
        className="df-scroll flex-1 overflow-y-auto px-4 sm:px-6 pb-2 flex flex-col gap-3"
        role="log"
        aria-label="Journal entries and coach replies"
      >
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
          <div className="df-generating rounded-lg h-[34px] max-w-[60%]" aria-label="Thinking">
            <div className="h-full flex items-center px-4 gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
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
            className="text-[12px] rounded-md px-3 py-2 self-start max-w-[80%]"
            role="alert"
            style={{
              color: "var(--df-destructive-text)",
              background: "color-mix(in srgb, var(--df-destructive) 12%, transparent)",
            }}
          >
            {coachError}
          </p>
        )}

        {entries.map((e) => {
          const moodMeta = e.mood_score ? MOODS[Math.min(4, Math.max(0, e.mood_score - 1))] : null;
          return (
            <article
              key={e.id}
              className="rounded-[12px] px-3.5 py-2.5"
              style={{
                background: "var(--df-card-fill)",
                border: "0.5px solid var(--df-card-border)",
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
              <p
                className="mt-1.5 text-[13px] leading-[1.55] whitespace-pre-wrap"
                style={{ color: "var(--df-text-primary)" }}
              >
                {e.content}
              </p>
            </article>
          );
        })}
      </div>

      {/* composer */}
      <div
        className="px-4 sm:px-6 py-3"
        style={{
          paddingBottom:
            "calc(0.75rem + max(0px, var(--keyboard-height, 0px)))",
        }}
      >
        {/* mood picker */}
        <div className="flex items-center gap-1.5 mb-2" role="radiogroup" aria-label="Mood for this entry">
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

        <div
          className="flex items-end gap-2 rounded-[10px] p-2"
          style={{
            background: "var(--df-input-fill)",
            border: "0.5px solid var(--df-input-border)",
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void saveEntry();
              }
            }}
            rows={2}
            placeholder="How did today go?"
            aria-label="Journal entry"
            className="flex-1 bg-transparent outline-none resize-none text-base leading-relaxed placeholder:text-[var(--df-text-muted)] max-h-32"
            style={{ color: "var(--df-text-primary)" }}
          />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={saveEntry}
            disabled={!draft.trim() || saving}
            className="df-press df-btn-primary min-h-11 px-4 rounded-md text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
          >
            <NotebookPen className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save entry"}
          </button>
          <button
            type="button"
            onClick={askCoach}
            disabled={!draft.trim() || asking}
            className="df-press df-btn-secondary min-h-11 px-4 rounded-md text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--df-accent)" }} />
            {asking ? "Asking…" : "Ask Coach"}
          </button>
        </div>
        <p className="text-[10px] mt-1.5 text-center" style={{ color: "var(--df-text-muted)" }}>
          Entries stay owner-only (RLS). Ask Coach sends your last 3 entries for context.
        </p>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "coach"; children: string }) {
  const isUser = role === "user";
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`max-w-[78%] sm:max-w-[62%] rounded-[12px] px-3.5 py-2.5 ${
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
    </AnimatePresence>
  );
}
