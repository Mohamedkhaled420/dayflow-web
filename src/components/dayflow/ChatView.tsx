"use client";

// ============================================================
// Dayflow AI — Coach pane (reference "Dayflow (4).html" #cp)
// ------------------------------------------------------------
// The AI chat, rebuilt on the updated mockup: a slim header
// (privacy line + "Coach" + Chat/Journal segment), the chat
// flow, and the capsule composer. DIA — the 3D white tiger —
// lives HERE now and only here (user decision, Oct 2026): her
// glass terrarium sits inside the gradient hero, thinking
// while the coach streams, celebrating when rings close, and
// evolving with the XP her engine accrues app-wide (see
// companion/DiaEngine.tsx — the headless half mounted in the
// AppShell).
//
// Two axes, kept distinct on purpose:
//   view  Chat | Journal   — talk to the coach vs write entries
//   mode  journal|workout  — WHICH coach answers (CBT/Stoic
//                            reading your last 3 entries vs the
//                            S&C coach reading your sessions)
// The mode capsule in the hero + the prompt chips set it.
//
// Everything functional is unchanged from the Phase-8 build:
// Delta Sync journal writes (owner-only RLS), /api/ai/coach
// with Bearer auth + SSE streaming + algorithmic floor,
// per-mode persisted turns, Coach Notes (the actionable tail
// + one-tap logs), honest fallback labeling. Entries render
// through sanitizeJournalHtml; replies through the allowlist
// markdown renderer — never literal asterisks.
// ============================================================

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { RotateCw, StickyNote } from "lucide-react";
import { useDayflowStore } from "@/store/useDayflowStore";
import { useDayflowData } from "@/lib/viewmodel";
import { useCompanionStore } from "@/store/companionStore";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic, hapticSelect } from "@/lib/haptics";
import type { DiaCoachMode, DiaSyncState } from "@/components/dayflow/DiaChatShell";
import { DiaStage } from "@/components/companion/DiaStage";
import { journalHtmlToText, sanitizeJournalHtml } from "@/lib/journal-html";
import { stripReasoning } from "@/lib/coach-text";
import { renderCoachMarkdown } from "@/lib/coach-markdown";
import { coerceCoachAction, type CoachLogAction } from "@/lib/coach-protocol";
import {
  CoachNotesSheet,
  type CoachNote,
} from "@/components/dayflow/CoachNotesSheet";

/** The five mood faces — reference mouth paths + pastel tokens.
 *  Score 1..5 → index 0..4 (Rough, Low, Okay, Good, Great). */
const MOOD_FACES = {
  mouths: [
    "M8.5 16.2c1.2-1.6 2.3-2.2 3.5-2.2s2.3.6 3.5 2.2",
    "M9 15.4c1.8-.8 4.2-.8 6 0",
    "M9 15h6",
    "M9 14.4c1.8 1.3 4.2 1.3 6 0",
    "M8.2 13.6c1 3 2.6 4 3.8 4s2.8-1 3.8-4",
  ],
  colors: [
    "var(--df-p-rose)",
    "var(--df-p-powder)",
    "var(--df-p-powder)",
    "var(--df-p-celadon)",
    "var(--df-p-celadon)",
  ],
  labels: ["Rough", "Low", "Okay", "Good", "Great"],
} as const;

function FaceIcon({ score, size = 34 }: { score: number; size?: number }) {
  const i = Math.min(4, Math.max(0, score - 1));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9.8h.01M15 9.8h.01" strokeWidth={2.4} />
      <path d={MOOD_FACES.mouths[i]} />
    </svg>
  );
}

/** Quick prompts — stacked chip rows in the empty chat (reference .pq). */
const PRESETS: { label: string; prompt: string; mode: DiaCoachMode }[] = [
  {
    label: "Plan my day around my energy",
    prompt: "Given my recent entries, where should my first focus block go tomorrow?",
    mode: "journal",
  },
  {
    label: "Build me a 30 minute workout",
    prompt: "How should I train today, given my recent workouts?",
    mode: "workout",
  },
  {
    label: "Help me reframe a rough day",
    prompt: "Today felt heavy. Help me reframe it and pick one concrete next step.",
    mode: "journal",
  },
  {
    label: "What patterns do you see this week?",
    prompt: "What patterns do you see across my recent entries?",
    mode: "journal",
  },
];

const SYSTEM_PROMPTS: Record<DiaCoachMode, string> = {
  journal:
    "You are Dayflow's psychology coach — CBT and Stoic framing, warm, concrete, brief. Reflect the user's own logged entries back to them. Never give medical advice; suggest professional help for clinical concerns.",
  workout:
    "You are Dayflow's strength & conditioning coach in conversation — practical, warm, brief. Ground every suggestion in the user's logged sessions; favor progression, recovery, and one concrete next step. Never give medical advice.",
};

/** Asked when the user sends an empty composer — the coach is
 *  useful without new text (v0 audit #6). */
const DEFAULT_QUESTIONS: Record<DiaCoachMode, string> = {
  journal: "What patterns do you see across my recent entries?",
  workout: "How should I train today, given my recent workouts?",
};

/** Stable route codes → friendly copy (v0 audit #3). */
const CODE_MESSAGES: Record<string, string> = {
  RATE_LIMITED: "You're asking quickly — give the coach a minute before trying again.",
  INVALID_SESSION: "Sign in again — your session expired.",
  INVALID_REQUEST: "That didn't look right — try rephrasing.",
  COACH_UNAVAILABLE: "The coach couldn't be reached. Try again in a moment.",
};

const GENERIC_UNREACHABLE =
  "The coach couldn't be reached. Try again in a moment.";

/** Whole-request client timeout (v0 audit #5) — the route also
 *  enforces a per-hop upstream timeout server-side. */
const CLIENT_TIMEOUT_MS = 60_000;

/** Coach chat persists on-device only (localStorage, capped) —
 *  the conversation survives reloads without any new server
 *  table (v0 audit #9; privacy: same owner-device model as the
 *  Delta Sync IndexedDB cache). */
const TURNS_STORAGE_KEY = "dayflow.coach.turns.v1";
const MAX_PERSISTED_TURNS = 60;

/** Coach Notes (the actionable tail of replies + offered logs)
 *  persist on-device beside the turns — same privacy model. */
const NOTES_STORAGE_KEY = "dayflow.coach.notes.v1";
const MAX_PERSISTED_NOTES = 40;

interface CoachTurn {
  id: number;
  role: "user" | "coach";
  content: string;
  /** Conversations are per coach context (Qwen #3 / v0 #8): the
   *  journal coach and the training coach never share a thread. */
  mode: DiaCoachMode;
  /** Algorithmic-floor answers are labeled honestly (v0 #16). */
  source?: "ai" | "fallback";
  /** Actionable tail the route stripped out of `content` and
   *  routed to the Coach Notes panel instead. */
  note?: string | null;
  actions?: CoachLogAction[];
}

interface SSEReadResult {
  full: string;
  source: "ai" | "fallback";
  errorCode: string | null;
  note: string | null;
  actions: CoachLogAction[];
}

/** Read the route's SSE answer stream, painting throttled progress
 *  and collecting the note/action events the route parsed off the
 *  reply's trailing NOTE/LOG protocol lines. */
async function readCoachSSE(
  body: ReadableStream<Uint8Array>,
  onProgress: (fullSoFar: string) => void
): Promise<SSEReadResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let source: "ai" | "fallback" = "ai";
  let errorCode: string | null = null;
  let note: string | null = null;
  const actions: CoachLogAction[] = [];
  let lastPaint = 0;

  const handleEvent = (data: string) => {
    let evt: { type?: string; text?: string; source?: string; code?: string; action?: unknown };
    try {
      evt = JSON.parse(data);
    } catch {
      return; // keep-alive fragments
    }
    if (evt.type === "meta" && evt.source === "fallback") source = "fallback";
    else if (evt.type === "delta" && typeof evt.text === "string") {
      full += evt.text;
      const now = Date.now();
      if (now - lastPaint > 60) {
        lastPaint = now;
        onProgress(full);
      }
    } else if (evt.type === "note" && typeof evt.text === "string") {
      note = evt.text; // last NOTE wins (route contract: one line)
    } else if (evt.type === "action") {
      const action = coerceCoachAction(evt.action);
      if (action) actions.push(action);
    } else if (evt.type === "error" && evt.code) {
      errorCode = evt.code;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("data:")) handleEvent(line.slice(5).trim());
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { full, source, errorCode, note, actions };
}

/** Validate a restored Coach Note from localStorage — every action
 *  re-passes coerceCoachAction so corrupted or hostile storage can
 *  never produce a bogus store write. */
function reviveCoachNote(raw: unknown): CoachNote | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  if (typeof n.id !== "number" || typeof n.text !== "string") return null;
  const actions = Array.isArray(n.actions)
    ? n.actions.map(coerceCoachAction).filter((a): a is CoachLogAction => a !== null)
    : [];
  return {
    id: n.id,
    text: n.text.slice(0, 240),
    mode: n.mode === "workout" ? "workout" : "journal",
    createdAt: typeof n.createdAt === "string" ? n.createdAt : new Date().toISOString(),
    actions,
    appliedIdx: Array.isArray(n.appliedIdx)
      ? n.appliedIdx.filter((i): i is number => typeof i === "number")
      : [],
  };
}

export function ChatView() {
  const journalEntries = useDayflowStore((s) => s.journalEntries);
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);
  const addJournalEntry = useDayflowStore((s) => s.addJournalEntry);
  const addHydrationLog = useDayflowStore((s) => s.addHydrationLog);
  const addWorkoutLog = useDayflowStore((s) => s.addWorkoutLog);
  const addSleepLog = useDayflowStore((s) => s.addSleepLog);
  const isSyncing = useDayflowStore((s) => s.isSyncing);
  const syncError = useDayflowStore((s) => s.syncError);
  const data = useDayflowData();
  const { toast } = useToast();

  const [view, setView] = useState<"chat" | "journal">("chat");
  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState<number>(3);
  const [saving, setSaving] = useState(false);
  const [coachTurns, setCoachTurns] = useState<CoachTurn[]>([]);
  const [asking, setAsking] = useState(false);
  // Companion sync: while the coach streams, Dia thinks (3D mood).
  const setCompanionThinking = useCompanionStore((s) => s.setThinking);
  useEffect(() => {
    setCompanionThinking(asking);
    return () => setCompanionThinking(false);
  }, [asking, setCompanionThinking]);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [mode, setMode] = useState<DiaCoachMode>("journal");
  /** Streaming coach text while it arrives (null = not streaming). */
  const [liveReply, setLiveReply] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  /** Coach Notes — the actionable tail of coach replies, surfaced
   *  AWAY from the chat flow (panel + header badge). */
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  /** "noteId:idx" of the log action currently being written. */
  const [applyingAction, setApplyingAction] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const journalRef = useRef<HTMLTextAreaElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  /** False until the localStorage restore has run — the save
   *  effect must NEVER fire before it (otherwise its empty-turns
   *  removeItem wipes storage before the restore can read it). */
  const [turnsHydrated, setTurnsHydrated] = useState(false);
  const [notesHydrated, setNotesHydrated] = useState(false);

  // Restore on-device coach history (v0 #9) — best-effort, deferred
  // to a microtask so the effect body performs no synchronous
  // setState (react-hooks/set-state-in-effect) and hydration's first
  // paint stays deterministic; corrupted storage starts fresh.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(TURNS_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as CoachTurn[];
          if (Array.isArray(saved) && saved.length > 0) {
            setCoachTurns(
              saved
                .filter(
                  (t) =>
                    t &&
                    typeof t.content === "string" &&
                    (t.mode === "journal" || t.mode === "workout")
                )
                .slice(-MAX_PERSISTED_TURNS)
            );
          }
        }
      } catch {
        // corrupted storage — start fresh
      } finally {
        setTurnsHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!turnsHydrated) return;
    try {
      if (coachTurns.length === 0) {
        localStorage.removeItem(TURNS_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        TURNS_STORAGE_KEY,
        JSON.stringify(coachTurns.slice(-MAX_PERSISTED_TURNS))
      );
    } catch {
      // quota exceeded — persistence is best-effort
    }
  }, [coachTurns, turnsHydrated]);

  // Coach Notes restore — same deferred pattern as the turns so
  // hydration's first paint stays deterministic; every restored
  // note re-validates through reviveCoachNote.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(NOTES_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as unknown[];
          if (Array.isArray(saved) && saved.length > 0) {
            setNotes(
              saved
                .map(reviveCoachNote)
                .filter((n): n is CoachNote => n !== null)
                .slice(0, MAX_PERSISTED_NOTES)
            );
          }
        }
      } catch {
        // corrupted storage — start fresh
      } finally {
        setNotesHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notesHydrated) return;
    try {
      if (notes.length === 0) {
        localStorage.removeItem(NOTES_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        NOTES_STORAGE_KEY,
        JSON.stringify(notes.slice(0, MAX_PERSISTED_NOTES))
      );
    } catch {
      // quota exceeded — persistence is best-effort
    }
  }, [notes, notesHydrated]);

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

  // Sync dot: network + delta-sync state.
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

  // Auto-scroll: the chat flow follows the live end while the
  // coach streams or a turn lands; the journal view parks at the
  // top (its newest entry is right under the composer card).
  useEffect(() => {
    if (view === "journal") {
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    if (mode === "journal" && coachTurns.length === 0 && !asking) {
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries.length, coachTurns.length, liveReply, asking, view, mode]);

  const draftText = draft.trim();

  // The visible conversation is per coach context (Qwen #3 / v0 #8):
  // switching journal ↔ training switches threads; refresh re-runs
  // the last question OF THE CURRENT context, so answers can never
  // drift into the wrong coach.
  const visibleTurns = useMemo(
    () => coachTurns.filter((t) => t.mode === mode),
    [coachTurns, mode]
  );

  /** A coach answer landed with an actionable tail — record it in
   *  the Coach Notes panel (never in the chat flow itself). */
  const addCoachNote = (
    turnId: number,
    note: string | null,
    actions: CoachLogAction[],
    ctxMode: DiaCoachMode
  ) => {
    if (note === null && actions.length === 0) return;
    setNotes((n) => [
      {
        id: turnId,
        text: note ?? "Suggested from your chat",
        mode: ctxMode,
        createdAt: new Date().toISOString(),
        actions,
        appliedIdx: [],
      },
      ...n,
    ].slice(0, MAX_PERSISTED_NOTES));
  };

  /** Write a coach-suggested log through the REAL store — coach
   *  proposes, the user disposes (one explicit tap, same pattern
   *  as the HabitsView workout generator). */
  const applyNoteAction = async (note: CoachNote, idx: number) => {
    const action = note.actions[idx];
    if (!action) return;
    const key = `${note.id}:${idx}`;
    if (applyingAction) return;
    setApplyingAction(key);
    try {
      let id: string | null = null;
      let description = "";
      switch (action.kind) {
        case "water": {
          const ml = action.amountMl ?? 250;
          id = await addHydrationLog({ amount_ml: ml });
          description = `${ml} ml added to today's water`;
          break;
        }
        case "workout": {
          const type = action.activity ?? "Workout";
          id = await addWorkoutLog({
            type,
            duration_minutes: action.durationMinutes ?? null,
          });
          description = `${type} logged for today`;
          break;
        }
        case "sleep": {
          const mins = action.durationMinutes ?? 480;
          id = await addSleepLog({ sleep_minutes: mins });
          description = `${Math.floor(mins / 60)}h ${mins % 60}m of sleep logged`;
          break;
        }
        case "journal": {
          id = await addJournalEntry({ content: action.summary ?? "" });
          description = "Journal entry saved";
          break;
        }
      }
      if (id === null) {
        toast({
          title: "Couldn't log that",
          description: "It didn't save — try again in a moment.",
        });
        return;
      }
      setNotes((all) =>
        all.map((n) =>
          n.id === note.id ? { ...n, appliedIdx: [...n.appliedIdx, idx] } : n
        )
      );
      toast({ title: "Logged from chat", description });
    } finally {
      setApplyingAction(null);
    }
  };

  const dismissNote = (note: CoachNote) => {
    setNotes((all) => all.filter((n) => n.id !== note.id));
  };

  const saveEntry = async () => {
    if (!draftText || saving) return;
    setSaving(true);
    try {
      await addJournalEntry({ content: draft, mood_score: mood });
      triggerHaptic(); // T2a: haptic on every journal save
      setDraft("");
      toast({ title: "Journal saved", description: MOOD_FACES.labels[mood - 1] });
    } finally {
      setSaving(false);
    }
  };

  /** Ask the coach. `overrideMode` lets the prompt chips and the
   *  journal's Ask Coach button pick WHICH coach answers in the
   *  same tick they switch to the chat view (mode state itself
   *  updates for the NEXT turn). */
  const askCoach = async (question: string, repeat = false, overrideMode?: DiaCoachMode) => {
    if (asking) return;
    const ctxMode = overrideMode ?? mode;
    if (overrideMode && overrideMode !== mode) setMode(overrideMode);
    // An empty composer still means a question — the mode default
    // asks about existing entries/sessions (v0 audit #6).
    const q = question.trim() || DEFAULT_QUESTIONS[ctxMode];
    setAsking(true);
    setCoachError(null);
    let optimisticId: number | null = null;
    if (!repeat) {
      const turnId = Date.now();
      optimisticId = turnId;
      setCoachTurns((t) => [
        ...t,
        { id: turnId, role: "user", content: q, mode: ctxMode },
      ]);
      // The draft is deliberately NOT cleared yet — it is only
      // cleared once a coach answer lands (v0 audit #2: a failed
      // request must never eat unsent writing).
    }
    // Failure reverts the optimistic bubble so a retry doesn't
    // duplicate the question; the draft stays for one-tap retry.
    const fail = (message: string) => {
      setCoachError(message);
      if (optimisticId !== null) {
        setCoachTurns((t) => t.filter((turn) => turn.id !== optimisticId));
      }
    };
    try {
      // Amendment #12: live session JWT on the Bearer. A missing
      // token first triggers ONE silent refresh before giving up
      // (Qwen #2 / v0 #17) — expired-at-rest sessions recover.
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData.session?.access_token ?? null;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token ?? null;
      }
      if (!token) {
        fail(CODE_MESSAGES.INVALID_SESSION);
        return;
      }
      // Context (§10.1 prompt discipline; the route re-caps at
      // 4K tokens before any Groq call): last 3 entries for the
      // journal coach, last 3 sessions for the training coach.
      const context =
        ctxMode === "journal"
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
      // View mode maps to the route's conversational modes:
      // journal → journal (reasoning), workout → coaching. The
      // structured workout JSON cascade is HabitsView's generator,
      // not this conversational surface.
      const apiMode = ctxMode === "journal" ? "journal" : "coaching";
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: apiMode,
          messages: [
            { role: "system", content: SYSTEM_PROMPTS[ctxMode] },
            ...context,
            { role: "user", content: q },
          ],
          stream: true,
        }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        fail(
          (payload?.code && CODE_MESSAGES[payload.code]) ||
            payload?.error ||
            `Coach unavailable (HTTP ${res.status}).`
        );
        return;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") && res.body) {
        // Streamed answer (v0 #1): text paints as it arrives; the
        // route strips the trailing NOTE/LOG protocol lines and
        // sends them as structured events instead.
        const { full, source, errorCode, note, actions } = await readCoachSSE(
          res.body,
          setLiveReply
        );
        if (errorCode) {
          fail(CODE_MESSAGES[errorCode] ?? GENERIC_UNREACHABLE);
          return;
        }
        if (!full.trim() && note === null && actions.length === 0) {
          fail("The coach had nothing to say.");
          return;
        }
        setLiveReply(null);
        const turnId = Date.now() + 1;
        setCoachTurns((t) => [
          ...t,
          { id: turnId, role: "coach", content: full, mode: ctxMode, source, note, actions },
        ]);
        addCoachNote(turnId, note, actions, ctxMode);
        if (!repeat) setDraft("");
        return;
      }
      const payload = (await res.json()) as {
        text?: string;
        error?: string;
        code?: string;
        source?: "ai" | "fallback";
        note?: string | null;
        actions?: CoachLogAction[];
      };
      if (payload.error || !payload.text) {
        fail(
          (payload.code && CODE_MESSAGES[payload.code]) ||
            (payload.error ?? "The coach had nothing to say.")
        );
        return;
      }
      // Non-streamed envelope: the route already stripped the
      // NOTE/LOG tail out of `text` and returned it structured.
      const cleanActions = (payload.actions ?? [])
        .map(coerceCoachAction)
        .filter((a): a is CoachLogAction => a !== null);
      const turnId = Date.now() + 1;
      setCoachTurns((t) => [
        ...t,
        {
          id: turnId,
          role: "coach",
          content: payload.text!,
          mode: ctxMode,
          source: payload.source,
          note: payload.note ?? null,
          actions: cleanActions,
        },
      ]);
      addCoachNote(turnId, payload.note ?? null, cleanActions, ctxMode);
      if (!repeat) setDraft("");
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "AbortError" || e.name === "TimeoutError")
      ) {
        fail("The coach took too long — try again in a moment.");
      } else {
        fail(GENERIC_UNREACHABLE);
      }
    } finally {
      setAsking(false);
      setLiveReply(null);
    }
  };

  /** Refresh control: re-run the last coach answer — always
   *  within the CURRENT coach context. */
  const rerunCoach = () => {
    const lastQuestion = [...visibleTurns].reverse().find((t) => t.role === "user");
    if (lastQuestion) void askCoach(lastQuestion.content, true);
  };
  const lastUserQuestion = [...visibleTurns].reverse().find((t) => t.role === "user");
  const refreshDisabled = asking || !lastUserQuestion;

  const cycleMode = () => {
    hapticSelect();
    setMode((m) => (m === "journal" ? "workout" : "journal"));
  };

  /** A prompt chip: sends immediately (reference .pq cadence) but
   *  never destroys unsent writing — a non-empty draft asks first. */
  const sendPreset = (preset: (typeof PRESETS)[number]) => {
    hapticSelect();
    if (draftText && draftText !== preset.prompt) {
      const replace = window.confirm(
        "Replace your current draft with this prompt?"
      );
      if (!replace) return;
    }
    setDraft("");
    void askCoach(preset.prompt, false, preset.mode);
  };

  /** Journal card → Ask Coach on a saved entry: hop to the chat
   *  view and ask the journal coach about that entry. */
  const askAboutEntry = (content: string) => {
    hapticSelect();
    setView("chat");
    void askCoach(journalHtmlToText(content), false, "journal");
  };

  const firstName = (data.profile.name || "there").split(" ")[0];

  return (
    <div className="dfc-root">
      {/* ---------- header (reference .cth) ---------- */}
      <header className="dfc-head">
        <div className="dfc-head-l">
          <p className="dfc-priv">
            <span className="dfc-sync-dot" data-sync={sync} aria-hidden="true" />
            Private · replies use your{" "}
            {mode === "journal" ? "last 3 entries" : "last 3 workouts"}
          </p>
          <h1 className="dfc-h1">Coach</h1>
        </div>
        <div className="dfc-head-r">
          {notes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                hapticSelect();
                setNotesOpen(true);
              }}
              className="dfc-notes-btn df-press"
              aria-label={`Open Coach Notes — ${notes.length} saved`}
            >
              <StickyNote className="h-4 w-4" aria-hidden="true" />
              <b>{notes.length}</b>
            </button>
          )}
          {view === "chat" && (
            <button
              type="button"
              onClick={rerunCoach}
              disabled={refreshDisabled}
              aria-label="Ask the last question again"
              className="dfc-refresh df-press"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <div className="dfc-seg" role="tablist" aria-label="Coach surface">
            <button
              type="button"
              role="tab"
              aria-selected={view === "chat"}
              onClick={() => {
                hapticSelect();
                setView("chat");
              }}
              className={view === "chat" ? "on" : ""}
            >
              Chat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "journal"}
              onClick={() => {
                hapticSelect();
                setView("journal");
              }}
              className={view === "journal" ? "on" : ""}
            >
              Journal
            </button>
          </div>
        </div>
      </header>

      {/* ---------- the flow (reference .cv) ---------- */}
      {view === "chat" ? (
        <>
          <div
            ref={scrollRef}
            className="dfc-flow"
            role="log"
            aria-label="Coach conversation"
            aria-live="polite"
            aria-busy={asking}
          >
            {/* the hero — Dia's home + the reference greeting card */}
            {visibleTurns.length === 0 && (
              <>
                <section className="dfc-hero" aria-label="Ask your coach">
                  <div className="dfc-hero-stage">
                    <DiaStage />
                  </div>
                  <h2 className="dfc-hero-h">Hey, {firstName}</h2>
                  <p className="dfc-hero-p">What&apos;s the plan for today?</p>
                  <button
                    type="button"
                    onClick={cycleMode}
                    className="dfc-mode df-press"
                    aria-label={`Coach context: ${
                      mode === "journal" ? "journal" : "training"
                    } coach. Activate to switch.`}
                  >
                    {mode === "journal" ? "Journal coach" : "Training coach"}
                  </button>
                </section>
                <div className="dfc-pq-col" role="list" aria-label="Quick prompts for the coach">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      role="listitem"
                      onClick={() => sendPreset(preset)}
                      className="dfc-pq df-press"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" />
                      </svg>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {visibleTurns.map((t) => (
              <Fragment key={t.id}>
                <Bubble role={t.role === "user" ? "user" : "coach"} source={t.source}>
                  {t.role === "coach" ? renderCoachMarkdown(stripReasoning(t.content)) : t.content}
                </Bubble>
                {/* the actionable tail landed in Coach Notes, not in
                    the bubble — point at it without flooding the chat */}
                {t.role === "coach" && (t.note || (t.actions?.length ?? 0) > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelect();
                      setNotesOpen(true);
                    }}
                    aria-label="Open Coach Notes — this reply saved a takeaway there"
                    className="dfc-note-chip df-press"
                  >
                    <StickyNote className="h-3 w-3" aria-hidden="true" />
                    Saved to Coach Notes
                  </button>
                )}
              </Fragment>
            ))}

            {/* streaming answer — text paints as it arrives (v0 #1);
                the animated dots only cover the wait before the
                first delta lands */}
            {asking && liveReply !== null && (
              <Bubble role="coach" streaming>
                {renderCoachMarkdown(stripReasoning(liveReply))}
              </Bubble>
            )}

            {asking && liveReply === null && (
              <div className="dfc-msg c dfc-ty" aria-label="Coach is thinking">
                <i />
                <i />
                <i />
              </div>
            )}

            {coachError && (
              <p className="dfc-err" role="alert">
                {coachError}
              </p>
            )}
          </div>

          {/* ---------- composer (reference .cmp / .cin) ---------- */}
          <footer className="dfc-compose">
            <div className="dfc-cin">
              <textarea
                ref={chatInputRef}
                rows={1}
                value={draft}
                placeholder="Ask your coach…"
                aria-label="Message your coach"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void askCoach(draftText);
                  }
                }}
              />
              <button
                type="button"
                className="dfc-send df-press"
                onClick={() => void askCoach(draftText)}
                disabled={asking}
                aria-busy={asking}
                aria-label={
                  asking
                    ? "Coach is thinking"
                    : draftText
                      ? "Send to your coach"
                      : `Ask the coach about your recent ${
                          mode === "journal" ? "entries" : "workouts"
                        }`
                }
              >
                {asking ? (
                  <span className="dfc-send-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
                  </svg>
                )}
              </button>
            </div>
            <p className="dfc-foot">
              Chat history stays on this device; coach answers read your{" "}
              {mode === "journal" ? "last 3 entries" : "last 3 workouts"} for context.
            </p>
          </footer>
        </>
      ) : (
        /* ---------- journal view (reference cJournal) ---------- */
        <div
          ref={scrollRef}
          className="dfc-flow dfc-journal"
          aria-label="Journal entries"
        >
          <section className="dfc-jc" aria-label="Write a journal entry">
            <textarea
              ref={journalRef}
              rows={3}
              value={draft}
              placeholder="How did today go?"
              aria-label="Journal entry"
              onChange={(e) => setDraft(e.target.value)}
            />
            <div
              className="dfc-moods"
              role="radiogroup"
              aria-label="Mood for this entry"
            >
              {MOOD_FACES.labels.map((label, i) => {
                const score = i + 1;
                const active = mood === score;
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={label}
                    onClick={() => {
                      hapticSelect();
                      setMood(score);
                    }}
                    className={`dfc-mood${active ? " on" : ""}`}
                    style={{ ["--dfc-c" as string]: MOOD_FACES.colors[i] }}
                  >
                    <FaceIcon score={score} size={30} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void saveEntry()}
              disabled={!draftText || saving}
              aria-busy={saving}
              className="dfc-save df-press"
            >
              {saving ? "Saving…" : "Save entry"}
            </button>
          </section>

          {entries.length > 0 && (
            <div className="dfx-lbl">
              <span>Earlier</span>
            </div>
          )}
          {entries.map((e) => (
            <article key={e.id} className="dfc-je">
              <div className="dfc-jeh">
                {e.mood_score ? (
                  <span
                    className="dfc-je-face"
                    style={{ color: MOOD_FACES.colors[Math.min(4, Math.max(0, e.mood_score - 1))] }}
                    aria-label={`Mood: ${MOOD_FACES.labels[Math.min(4, Math.max(0, e.mood_score - 1))]} (${e.mood_score} of 5)`}
                  >
                    <FaceIcon score={e.mood_score} size={24} />
                  </span>
                ) : null}
                <small>
                  {new Date(e.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </small>
                {e.pending_sync && (
                  <span className="dfc-je-pending">pending</span>
                )}
              </div>
              {/* Stored HTML — rendered ONLY through the allowlist
                  sanitizer; plain-text entries take the same path. */}
              <div
                className="df-prose dfc-je-text"
                dangerouslySetInnerHTML={{ __html: sanitizeJournalHtml(e.content) }}
              />
              <button
                type="button"
                className="dfc-ask df-press"
                onClick={() => askAboutEntry(e.content)}
              >
                Ask Coach
              </button>
            </article>
          ))}

          {entries.length === 0 && (
            <p className="dfc-empty">
              Nothing written yet — today&apos;s card above is a fresh page.
            </p>
          )}
        </div>
      )}

      {/* Coach Notes — the dedicated surface for the coach's
          actionable tail (notes + one-tap logs), OUTSIDE the chat
          box so it never drowns in the conversation. */}
      <CoachNotesSheet
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        notes={notes}
        onApply={(note, idx) => {
          void applyNoteAction(note, idx);
        }}
        onDismiss={dismissNote}
        onClearAll={() => setNotes([])}
        applyingIdx={applyingAction}
      />
    </div>
  );
}

function Bubble({
  role,
  source,
  streaming,
  children,
}: {
  role: "user" | "coach";
  source?: "ai" | "fallback";
  streaming?: boolean;
  /** Coach bodies arrive PRE-RENDERED as allowlist markdown HTML
   *  (the caller renders); user bodies are plain text. */
  children: string;
}) {
  const isUser = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`dfc-msg ${isUser ? "u" : "c"}`}
    >
      {isUser ? (
        <p className="dfc-msg-text">{children}</p>
      ) : (
        <div className="df-prose dfc-msg-text">
          <div dangerouslySetInnerHTML={{ __html: children }} />
          {streaming && (
            <span className="dfc-caret" aria-hidden="true" />
          )}
        </div>
      )}
      {/* honest labeling (v0 #16): the algorithmic floor is quick
          local guidance, not a live model answer — say so, quietly */}
      {!isUser && source === "fallback" && (
        <p className="dfc-fallback">Quick guidance · coach offline</p>
      )}
    </motion.div>
  );
}
