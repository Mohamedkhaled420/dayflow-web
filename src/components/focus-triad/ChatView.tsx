"use client";

// ============================================================
// Focus Triad — Coach pane (reference "Focus Triad (5).html" #cp)
// ------------------------------------------------------------
// The BIG update: the Coach is now VOICE-FIRST. The old chat
// bubble flow became the Talk view — Dia's soul orb (see
// voice/VoiceOrb.tsx), a live waveform, word-lit captions, four
// prompt chips, and a dock that flips between the big mic and a
// typing capsule. Typed input rides the SAME session: it is
// injected into the live Deepgram agent (df:Inject → InjectUser-
// Message) so the answer still comes back by voice.
//
// Under the hood (2026-10 research, all live-verified):
//   browser ⇄ /api/ai/voice-agent ⇄ wss://agent.deepgram.com/
//   v1/agent/converse — the relay exists because Deepgram's live
//   endpoint is header-auth only (401 on query/subprotocol auth),
//   so the key must stay server-side. Models: flux-general-en
//   (listen, conversational turn-taking) → managed gpt-4o-mini
//   (think, Standard tier) → flux-kit-en (speak). Barge-in,
//   word-lit captions, transcript sheet — all real events.
//
// Fallback: if voice is unavailable (not configured / relay
// error), typed input degrades to the Phase-15 text coach
// (/api/ai/coach SSE) with speechSynthesis reading the reply —
// every existing behavior survives: per-mode persisted turns,
// Coach Notes + one-tap logs, honest fallback labeling.
//
// The Journal view is unchanged (five mood faces, Ask Coach now
// jumps to Talk and speaks the entry to Dia).
// ============================================================

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { StickyNote } from "lucide-react";
import { useFocusTriadStore } from "@/store/useFocusTriadStore";
import { useFocusTriadData, localDateKey } from "@/lib/viewmodel";
import {
  clockToMinutes as sleepClockToMinutes,
  sleepWakeAnchor,
  sleepRangeLabel,
  type WakeSource,
} from "@/lib/sleep-anchor";
import { useCompanionStore } from "@/store/companionStore";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic, hapticSelect } from "@/lib/haptics";
import type { DiaCoachMode } from "@/components/focus-triad/DiaChatShell";
import { journalHtmlToText, sanitizeJournalHtml } from "@/lib/journal-html";
import { stripReasoning } from "@/lib/coach-text";
import { renderCoachMarkdown } from "@/lib/coach-markdown";
import { coerceCoachAction, type CoachLogAction } from "@/lib/coach-protocol";
import {
  CoachNotesSheet,
  type CoachNote,
} from "@/components/focus-triad/CoachNotesSheet";
import { VoiceOrb, type VoiceLevels } from "@/components/focus-triad/voice/VoiceOrb";
import { useDockHidden } from "@/hooks/use-dock-visibility";
import {
  VoiceSession,
  type VoiceHistoryItem,
  type VoiceState,
} from "@/lib/voice-agent";

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

/** Talk-view prompt chips (reference PQ/PQL, verbatim). */
const VOICE_PROMPTS: { label: string; prompt: string }[] = [
  { label: "Plan my day", prompt: "Plan my day around my energy" },
  { label: "30 min workout", prompt: "Build me a 30 minute workout" },
  { label: "Reframe a rough day", prompt: "Help me reframe a rough day" },
  { label: "Weekly patterns", prompt: "What patterns do you see this week?" },
];

const SYSTEM_PROMPTS: Record<DiaCoachMode, string> = {
  journal:
    "You are Dia, the journal coach inside Focus Triad. Warm, concise, CBT/Stoic framing. Ground every reply in the entries supplied as context. 2-4 short paragraphs max.",
  workout:
    "You are Dia, the training coach inside Focus Triad. Practical strength & conditioning guidance grounded in the logged sessions supplied as context. 2-4 short paragraphs max.",
};

/** Asked when the user sends an empty composer — the coach is
 *  invited to talk about what it already knows. */
const DEFAULT_QUESTIONS: Record<DiaCoachMode, string> = {
  journal: "Reading my last few entries, what should I focus on today?",
  workout: "Based on my recent sessions, what should I train today?",
};

/** Stable route codes → friendly copy (v0 audit #3). */
const CODE_MESSAGES: Record<string, string> = {
  INVALID_SESSION: "Sign in again — your session expired.",
  INVALID_REQUEST: "That question couldn't be sent — try rewording it.",
  RATE_LIMIT: "You're going fast! Give the coach a moment, then try again.",
  COACH_UNAVAILABLE: "The coach is offline right now — try again shortly.",
};

const GENERIC_UNREACHABLE =
  "Couldn't reach the coach — check your connection and try again.";

/** Whole-request client timeout (v0 audit #5) — the route also
 *  enforces its own server-side budget. */
const CLIENT_TIMEOUT_MS = 60_000;

/** Coach chat persists on-device only (localStorage, capped) —
 *  never synced, never sent anywhere (PRD §8 privacy stance). */
const TURNS_STORAGE_KEY = "ft.coach.turns.v1";
const MAX_PERSISTED_TURNS = 60;

/** Coach Notes (the actionable tail of replies + offered logs)
 *  live in their own capped store. */
const NOTES_STORAGE_KEY = "ft.coach.notes.v1";
const MAX_PERSISTED_NOTES = 40;

interface CoachTurn {
  id: number;
  role: "user" | "coach";
  content: string;
  mode: DiaCoachMode;
  /** Algorithmic-floor answers are labeled honestly (v0 #16). */
  source?: "ai" | "fallback";
  /** Actionable tail the route stripped out of `content` and
   *  routed to Coach Notes instead. */
  note?: string | null;
  actions?: CoachLogAction[];
}

/** Read the route's SSE answer stream, painting throttled progress
 *  through setLiveReply as it arrives. Returns the full answer. */
async function readCoachSSE(
  body: ReadableStream<Uint8Array>,
  setLiveReply: (t: string) => void
): Promise<{
  full: string;
  source: "ai" | "fallback";
  errorCode?: string;
  note: string | null;
  actions: CoachLogAction[];
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  let source: "ai" | "fallback" = "ai";
  let errorCode: string | undefined;
  let note: string | null = null;
  const actions: CoachLogAction[] = [];
  let lastPaint = 0;

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trim();
    if (!raw) return;
    try {
      const ev = JSON.parse(raw) as {
        type?: string;
        text?: string;
        source?: "ai" | "fallback";
        code?: string;
        note?: string | null;
        action?: CoachLogAction;
      };
      if (ev.type === "delta" && ev.text) {
        full += ev.text;
        const now = performance.now();
        if (now - lastPaint > 80) {
          lastPaint = now;
          setLiveReply(full);
        }
      } else if (ev.type === "meta" && ev.source) {
        source = ev.source;
      } else if (ev.type === "note" && ev.note) {
        note = ev.note;
      } else if (ev.type === "action" && ev.action) {
        actions.push(ev.action);
      } else if (ev.type === "error" && ev.code) {
        errorCode = ev.code;
      } else if (ev.type === "done") {
        /* terminal */
      }
    } catch {
      /* keep-alive comment or partial frame */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) handleLine(l);
  }
  if (buf) handleLine(buf);
  return { full, source, errorCode, note, actions };
}

/** Validate a restored Coach Note from localStorage — every action
 *  re-validates so a tampered store can never write bad logs. */
function reviveCoachNote(raw: unknown): CoachNote | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as CoachNote;
  if (typeof n.id !== "number" || typeof n.text !== "string") return null;
  if (n.mode !== "journal" && n.mode !== "workout") return null;
  if (!Array.isArray(n.actions) || n.actions.length > 6) return null;
  if (!Array.isArray(n.appliedIdx)) return null;
  return {
    ...n,
    actions: n.actions
      .map(coerceCoachAction)
      .filter((a): a is CoachLogAction => a !== null),
    appliedIdx: n.appliedIdx.filter((i) => typeof i === "number"),
  };
}

/** Chronobiology JSONB section → typed wake source for the sleep
 *  anchor (targetWakeMinutes from onboarding wins, then the
 *  chronotype quiz's naturalWakeTime). */
function chronoSection(row: unknown): WakeSource {
  const c = (row as { chronobiology?: unknown } | null)?.chronobiology as
    | Record<string, unknown>
    | null
    | undefined;
  return {
    targetWakeMinutes:
      c && typeof c.targetWakeMinutes === "number" ? c.targetWakeMinutes : null,
    naturalWakeTime:
      c && typeof c.naturalWakeTime === "string" ? c.naturalWakeTime : null,
  };
}

export function ChatView({ active = true }: { active?: boolean }) {
  const journalEntries = useFocusTriadStore((s) => s.journalEntries);
  const workoutLogs = useFocusTriadStore((s) => s.workoutLogs);
  const sleepRows = useFocusTriadStore((s) => s.sleepLogs);
  const profileRow = useFocusTriadStore((s) => s.profile);
  const updateSleepLog = useFocusTriadStore((s) => s.updateSleepLog);
  const addJournalEntry = useFocusTriadStore((s) => s.addJournalEntry);
  const addHydrationLog = useFocusTriadStore((s) => s.addHydrationLog);
  const addWorkoutLog = useFocusTriadStore((s) => s.addWorkoutLog);
  const addSleepLog = useFocusTriadStore((s) => s.addSleepLog);
  const addMealLog = useFocusTriadStore((s) => s.addMealLog);
  const addActivityLog = useFocusTriadStore((s) => s.addActivityLog);
  const data = useFocusTriadData();
  const { toast } = useToast();
  /** Dock hidden (keyboard / immersive)? → release the nav band
   *  on the pane root (reference body.full #st{bottom:0}) so the
   *  dock rides down to the screen bottom in lockstep with the
   *  nav sliding away. */
  const dockHidden = useDockHidden();

  const [view, setView] = useState<"talk" | "journal">("talk");
  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState<number>(3);
  const [saving, setSaving] = useState(false);
  const [coachTurns, setCoachTurns] = useState<CoachTurn[]>([]);
  const [asking, setAsking] = useState(false);
  // Companion sync: while the text coach streams, Dia thinks.
  const setCompanionThinking = useCompanionStore((s) => s.setThinking);
  useEffect(() => {
    setCompanionThinking(asking);
    return () => setCompanionThinking(false);
  }, [asking, setCompanionThinking]);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [mode, setMode] = useState<DiaCoachMode>("journal");
  /** Streaming coach text while it arrives (null = not streaming). */
  const [liveReply, setLiveReply] = useState<string | null>(null);
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

  // ---------- voice session state ----------
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceLive, setVoiceLive] = useState(false);
  /** True once the relay refused us — typed input goes SSE. */
  const [voiceFailed, setVoiceFailed] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [dock, setDock] = useState<"voice" | "type">("voice");
  const [connecting, setConnecting] = useState(false);
  const [capUser, setCapUser] = useState("");
  const [capAgent, setCapAgent] = useState("");
  const [transcript, setTranscript] = useState<VoiceHistoryItem[]>([]);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [happyUntil, setHappyUntil] = useState(false);
  const [revealIdx, setRevealIdx] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const levelsRef = useRef<VoiceLevels>({ input: 0, output: 0 });
  const sessionRef = useRef<VoiceSession | null>(null);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // --- unexpected-drop bookkeeping (seamless voice resume) ---
  const voiceDropsRef = useRef<number[]>([]);
  const voiceResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceFailedRef = useRef(false);

  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Restore on-device coach history (v0 #9) — best-effort, deferred
  // to a microtask so the effect body performs no synchronous
  // setState and hydration's first paint stays deterministic;
  // corrupted storage starts fresh.
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

  // The journal view parks at the top (its newest entry is right
  // under the composer card); Talk scrolls itself via captions.
  useEffect(() => {
    if (view === "journal") {
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [view]);

  const draftText = draft.trim();

  // The visible conversation is per coach context (fallback path).
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
          // anchor to the plausible wake moment — NOT "now" (a
          // 6 PM tap used to paint sleep across the afternoon)
          const wake = sleepWakeAnchor(new Date(), chronoSection(profileRow));
          id = await addSleepLog({
            sleep_minutes: mins,
            logged_at: wake.toISOString(),
          });
          description = `${Math.floor(mins / 60)}h ${mins % 60}m of sleep logged · ${sleepRangeLabel(wake, mins)}`;
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

  // ---------- voice: context, session, controls ----------

  /** Compact context block for the voice prompt — same discipline
   *  as the text coach: last 3 entries + last 3 workouts, capped. */
  const voiceContext = useMemo(() => {
    const parts: string[] = [];
    for (const e of entries.slice(0, 3).reverse()) {
      parts.push(
        `[journal ${e.created_at.slice(0, 10)}${
          e.mood_score ? ` · mood ${e.mood_score}/5` : ""
        }] ${journalHtmlToText(e.content).slice(0, 400)}`
      );
    }
    for (const w of recentWorkouts) {
      parts.push(
        `[workout ${w.logged_at.slice(0, 10)}] ${w.type}${
          w.duration_minutes ? ` · ${w.duration_minutes}m` : ""
        }`
      );
    }
    return parts.join("\n").slice(0, 3_800);
  }, [entries, recentWorkouts]);

  const firstName = (data.profile?.name ?? "").split(" ")[0] ?? "";

  /** Dia's ambient mood (reference cModBase): sleepy late at
   *  night, care right after a rough entry, otherwise neutral. */
  const orbMood: "happy" | "care" | "sleepy" | "" = happyUntil
    ? "happy"
    : (() => {
        const h = new Date().getHours();
        if (h >= 23 || h < 5) return "sleepy";
        if (entries[0]?.mood_score && entries[0].mood_score <= 1 && transcript.length === 0)
          return "care";
        return "";
      })();

  /** speechSynthesis reader for the SSE fallback path (reference
   *  cSpeak minus the boundary tricks — word reveal is timed). */
  const speakFallback = (text: string) => {
    if (!voiceOut) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(stripReasoning(text).slice(0, 600));
      u.rate = 1;
      u.pitch = 1.08;
      const voices = synth.getVoices();
      const v =
        voices.find((x) => /en[-_]US/i.test(x.lang) && /Samantha|Google US English|Jenny|Aria|Natural|Zira/i.test(x.name)) ??
        voices.find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      u.onstart = () => setVoiceState("speak");
      u.onend = () => setVoiceState("idle");
      u.onerror = () => setVoiceState("idle");
      synth.speak(u);
    } catch {
      /* no synthesis — captions still work */
    }
  };

  /** Open a voice session (mic + relay + Deepgram). Returns the
   *  live session, or null when it couldn't start. `resume` marks
   *  a seamless reconnect after an unexpected drop — the relay
   *  then skips Dia's greeting and the failure toast is honest
   *  about what happened. */
  const startVoice = async (opts?: {
    resume?: boolean;
  }): Promise<VoiceSession | null> => {
    if (sessionRef.current || connecting) return sessionRef.current;
    setConnecting(true);
    setCoachError(null);
    const session = new VoiceSession({
      onState: (s) => setVoiceState(s),
      onUserText: (text) => {
        setCapUser(text);
        setCapAgent(""); // new turn — clear the coach caption
      },
      onAgentText: (text) =>
        setCapAgent((prev) => (prev ? `${prev} ${text}` : text)),
      onHistory: (item) =>
        setTranscript((t) => [...t.slice(-199), item]),
      onLevel: (input, output) => {
        levelsRef.current = { input, output };
      },
      onReady: () => setVoiceLive(true),
      onFunctionCall: async (fn) => {
        // Dia asked the app to log something — run it through the
        // SAME store the UI uses, toast, and hand the result back
        // so she can confirm it aloud.
        const num = (v: unknown, fallback: number | null = null) =>
          typeof v === "number" && Number.isFinite(v) ? v : fallback;
        const str = (v: unknown, fallback = "") =>
          typeof v === "string" && v.trim() ? v.trim() : fallback;
        try {
          let id: string | null = null;
          let description = "";
          switch (fn.name) {
            case "log_water": {
              const ml = num(fn.args.amount_ml, 250)!;
              id = await addHydrationLog({ amount_ml: ml });
              description = `${ml} ml of water logged`;
              break;
            }
            case "log_workout": {
              const type = str(fn.args.type, "Workout");
              const dur = num(fn.args.duration_minutes);
              id = await addWorkoutLog({
                type,
                duration_minutes: dur,
                active_calories: num(fn.args.active_calories),
              });
              description = `${type}${dur ? ` · ${dur} min` : ""} logged`;
              break;
            }
            case "log_meal": {
              const name = str(fn.args.name, "Meal");
              const kcal = Math.max(0, Math.round(num(fn.args.calories, 300)!));
              id = await addMealLog({
                name,
                calories: kcal,
                protein_g: num(fn.args.protein_g),
                carbs_g: num(fn.args.carbs_g),
                fat_g: num(fn.args.fat_g),
                source: "voice",
              });
              description = `${name} · ~${kcal} kcal logged`;
              break;
            }
            case "log_sleep": {
              // Sleep is anchored by its WAKE time. The model passes
              // a from-to range, a duration, or both — the range
              // wins when both are present.
              const bed = sleepClockToMinutes(str(fn.args.bedtime));
              const wakeMin = sleepClockToMinutes(str(fn.args.wake_time));
              let mins = num(fn.args.duration_minutes);
              if (bed != null && wakeMin != null) {
                const span = (wakeMin - bed + 1440) % 1440;
                if (span > 0) mins = span;
              }
              if (mins == null || mins <= 0) {
                session.respondFunctionCall(
                  fn.id,
                  fn.name,
                  JSON.stringify({
                    ok: false,
                    message:
                      "Sleep length unknown — ask the user how long they slept, then log it.",
                  })
                );
                return;
              }
              mins = Math.max(15, Math.min(840, Math.round(mins)));

              // Wake anchor: the stated wake clock when given (today,
              // or yesterday if that clock is still ahead of us),
              // else the smart anchor from the profile.
              const now = new Date();
              let wakeDate: Date;
              if (wakeMin != null) {
                wakeDate = new Date(now);
                wakeDate.setHours(Math.floor(wakeMin / 60), wakeMin % 60, 0, 0);
                if (wakeDate.getTime() > now.getTime())
                  wakeDate.setDate(wakeDate.getDate() - 1);
              } else {
                wakeDate = sleepWakeAnchor(now, chronoSection(profileRow));
              }
              const loggedAt = wakeDate.toISOString();

              // One sleep row per wake-day: updating the existing
              // night instead of stacking a second one on top.
              const wakeDay = localDateKey(loggedAt);
              const existing = sleepRows.find(
                (r) => localDateKey(r.logged_at) === wakeDay
              );
              if (existing) {
                const ok = await updateSleepLog(existing.id, {
                  sleep_minutes: mins,
                  logged_at: loggedAt,
                });
                id = ok ? existing.id : null;
              } else {
                id = await addSleepLog({
                  sleep_minutes: mins,
                  logged_at: loggedAt,
                });
              }
              const hrs = Math.floor(mins / 60);
              description = `${hrs}h${mins % 60 ? ` ${mins % 60}m` : ""} of sleep logged · ${sleepRangeLabel(wakeDate, mins)}`;
              break;
            }
            case "log_activity": {
              const title = str(fn.args.title, "Activity");
              const category = str(fn.args.category, "other");
              const dur = num(fn.args.duration_minutes);
              id = await addActivityLog({
                category,
                title,
                duration_minutes: dur,
                notes: "Logged by voice",
              });
              description = `${title} logged`;
              break;
            }
            default:
              session.respondFunctionCall(
                fn.id,
                fn.name,
                JSON.stringify({ ok: false, message: "Unknown action" })
              );
              return;
          }
          if (id === null) {
            toast({
              title: "Couldn't log that",
              description: "It didn't save — try saying it again.",
            });
            session.respondFunctionCall(
              fn.id,
              fn.name,
              JSON.stringify({ ok: false, message: "Could not save the entry; tell the user to try again." })
            );
            return;
          }
          toast({ title: "Logged by voice", description });
          triggerHaptic();
          // a happy little pulse for Dia
          setHappyUntil(true);
          if (happyTimer.current) clearTimeout(happyTimer.current);
          happyTimer.current = setTimeout(() => setHappyUntil(false), 2400);
          session.respondFunctionCall(
            fn.id,
            fn.name,
            JSON.stringify({ ok: true, message: description })
          );
        } catch {
          session.respondFunctionCall(
            fn.id,
            fn.name,
            JSON.stringify({ ok: false, message: "Something went wrong while saving." })
          );
        }
      },
      onError: () => {
        setVoiceFailed(true);
        setDock("type");
        toast({
          title: "Voice unavailable",
          description: "Dia can still answer typed questions.",
        });
      },
      onClose: (unexpected) => {
        setVoiceLive(false);
        setVoiceState("idle");
        sessionRef.current = null;
        // The session died without the user asking: server cap
        // (maxDuration 300), a network blip, or an upstream
        // error. Before this, the UI went SILENTLY dead — Dia
        // just stopped listening mid-call with zero feedback.
        // Now: one seamless resume attempt, then honest toast.
        if (unexpected && !voiceFailedRef.current) scheduleVoiceResume();
      },
    });
    sessionRef.current = session;
    try {
      await session.start({
        ctx: voiceContext,
        name: firstName,
        mic: true,
        resume: opts?.resume,
      });
      setVoiceLive(true);
      if (opts?.resume) {
        toast({
          title: "Dia reconnected",
          description: "Still here — go ahead.",
        });
      }
      return session;
    } catch {
      sessionRef.current = null;
      setVoiceFailed(true);
      setDock("type");
      setVoiceState("idle");
      setVoiceLive(false);
      toast(
        opts?.resume
          ? {
              title: "Dia lost the connection",
              description: "Tap the mic when you're ready to keep talking.",
            }
          : {
              title: "Couldn't start voice",
              description: "Check the mic permission — typing still works.",
            }
      );
      return null;
    } finally {
      setConnecting(false);
    }
  };

  /** After an unexpected drop: try ONE seamless resume (relay
   *  skips the greeting). Two drops in five minutes, a hidden
   *  tab, or a failed resume → honest toast + manual restart.
   *  Without this, every voice call died silently at the
   *  platform cap (maxDuration 300s). */
  const scheduleVoiceResume = () => {
    if (document.visibilityState !== "visible") {
      toast({
        title: "Dia lost the connection",
        description: "Tap the mic when you're back.",
      });
      return;
    }
    const now = Date.now();
    const drops = (voiceDropsRef.current = voiceDropsRef.current.filter(
      (t) => now - t < 5 * 60_000
    ));
    if (drops.length >= 2) {
      toast({
        title: "Dia lost the connection",
        description: "Tap the mic to keep talking.",
      });
      return;
    }
    drops.push(now);
    if (voiceResumeTimer.current) clearTimeout(voiceResumeTimer.current);
    voiceResumeTimer.current = setTimeout(() => {
      voiceResumeTimer.current = null;
      if (sessionRef.current || voiceFailedRef.current) return;
      if (document.visibilityState !== "visible") return;
      void startVoice({ resume: true });
    }, 800);
  };

  const endVoice = () => {
    // A user-initiated end cancels any pending auto-resume —
    // their intent is to STOP, not to be called back.
    if (voiceResumeTimer.current) {
      clearTimeout(voiceResumeTimer.current);
      voiceResumeTimer.current = null;
    }
    sessionRef.current?.stop();
    sessionRef.current = null;
    setVoiceLive(false);
    setVoiceState("idle");
    setCapUser("");
    setCapAgent("");
    levelsRef.current = { input: 0, output: 0 };
  };

  /** The big mic button (reference mic handler): idle → open a
   *  session; listen → end it; speak/think → interrupt Dia. */
  const toggleMic = async () => {
    hapticSelect();
    if (!sessionRef.current) {
      await startVoice();
      return;
    }
    if (voiceState === "listen") {
      endVoice();
      return;
    }
    // speak / think → barge: kill her audio, keep listening
    sessionRef.current.interrupt();
    setVoiceState("listen");
  };

  /** Everything the user can "say" by text: chips, the type dock,
   *  and the journal's Ask Coach. */
  const speakToDia = async (text: string, overrideMode?: DiaCoachMode) => {
    const q = text.trim();
    if (!q) return;
    hapticSelect();
    setCapUser(q);
    setCapAgent("");
    if (voiceFailed) {
      void askCoach(q, false, overrideMode);
      return;
    }
    if (sessionRef.current) {
      sessionRef.current.inject(q);
      return;
    }
    const session = await startVoice();
    if (session) session.inject(q);
    else void askCoach(q, false, overrideMode);
  };

  /** Poke the orb → Dia celebrates for a moment (reference
   *  cHappy: squash + sparks + haptic). */
  const pokeDia = () => {
    triggerHaptic();
    if (happyTimer.current) clearTimeout(happyTimer.current);
    setHappyUntil(true);
    happyTimer.current = setTimeout(() => setHappyUntil(false), 2400);
  };

  useEffect(
    () => () => {
      if (happyTimer.current) clearTimeout(happyTimer.current);
      if (voiceResumeTimer.current) clearTimeout(voiceResumeTimer.current);
      sessionRef.current?.stop();
    },
    []
  );

  // Keep the resume guard in sync with the fallback flag.
  useEffect(() => {
    voiceFailedRef.current = voiceFailed;
  }, [voiceFailed]);

  // Word-lit captions while Dia speaks (reference cMark): a
  // steady reveal cadence paced like the mockup's, since the
  // agent stream carries no word boundaries. Non-speaking states
  // derive "all revealed" — no state write at all.
  const agentWords = useMemo(() => capAgent.split(/(\s+)/), [capAgent]);
  useEffect(() => {
    if (voiceState !== "speak" || reducedMotion) return;
    queueMicrotask(() => setRevealIdx(0));
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setRevealIdx(i);
      if (i >= agentWords.length) clearInterval(t);
    }, 340);
    return () => clearInterval(t);
  }, [voiceState, capAgent, agentWords.length, reducedMotion]);
  const revealed =
    voiceState === "speak" && !reducedMotion
      ? Math.min(revealIdx, agentWords.length)
      : agentWords.length;

  /** Ask the coach over the text pipeline — now the fallback when
   *  voice is unavailable. `overrideMode` lets the journal's Ask
   *  Coach pick WHICH coach answers in the same tick. */
  const askCoach = async (question: string, repeat = false, overrideMode?: DiaCoachMode) => {
    if (asking) return;
    const ctxMode = overrideMode ?? mode;
    if (overrideMode && overrideMode !== mode) setMode(overrideMode);
    const q = question.trim() || DEFAULT_QUESTIONS[ctxMode];
    setAsking(true);
    setCoachError(null);
    setVoiceState("think");
    let optimisticId: number | null = null;
    if (!repeat) {
      const turnId = Date.now();
      optimisticId = turnId;
      setCoachTurns((t) => [
        ...t,
        { id: turnId, role: "user", content: q, mode: ctxMode },
      ]);
    }
    const fail = (message: string) => {
      setCoachError(message);
      setVoiceState("idle");
      if (optimisticId !== null) {
        setCoachTurns((t) => t.filter((turn) => turn.id !== optimisticId));
      }
    };
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
        fail(CODE_MESSAGES.INVALID_SESSION);
        return;
      }
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
        const { full, source, errorCode, note, actions } = await readCoachSSE(
          res.body,
          (t) => setLiveReply(t)
        );
        setLiveReply(null);
        if (errorCode) {
          fail(CODE_MESSAGES[errorCode] ?? GENERIC_UNREACHABLE);
          return;
        }
        if (!full.trim() && note === null && actions.length === 0) {
          fail("The coach had nothing to say.");
          return;
        }
        setCapAgent(stripReasoning(full));
        setVoiceState("idle");
        const turnId = Date.now() + 1;
        setCoachTurns((t) => [
          ...t,
          { id: turnId, role: "coach", content: full, mode: ctxMode, source, note, actions },
        ]);
        addCoachNote(turnId, note, actions, ctxMode);
        speakFallback(full);
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
      const cleanActions = (payload.actions ?? [])
        .map(coerceCoachAction)
        .filter((a): a is CoachLogAction => a !== null);
      setCapAgent(stripReasoning(payload.text));
      setVoiceState("idle");
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
      speakFallback(payload.text);
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

  /** Journal card → Ask Coach on a saved entry: hop to the talk
   *  view and hand the entry to Dia by voice. */
  const askAboutEntry = (content: string) => {
    setView("talk");
    void speakToDia(journalHtmlToText(content), "journal");
  };

  const sendTyped = () => {
    if (!draftText || asking) return;
    const text = draft;
    setDraft("");
    void speakToDia(text);
  };

  /** Transcript rows: live session history, else the persisted
   *  text-coach turns (fallback mode). */
  const transcriptRows: Array<{ role: "user" | "assistant"; content: string }> =
    voiceLive || transcript.length > 0
      ? transcript
      : visibleTurns.map((t) => ({
          role: t.role === "user" ? "user" : "assistant",
          content: t.content,
        }));

  return (
    <div className={`dfc-root${dockHidden ? " dfc-full" : ""}`}>
      {/* ---------- header (reference .cth) ---------- */}
      <header className="dfc-head">
        <div className="dfc-head-l">
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
          <div className="dfc-seg" role="tablist" aria-label="Coach surface">
            <button
              type="button"
              role="tab"
              aria-selected={view === "talk"}
              onClick={() => {
                hapticSelect();
                setView("talk");
              }}
              className={view === "talk" ? "on" : ""}
            >
              Talk
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

      {/* ---------- the talk view (reference .vs + .cmp) ---------- */}
      {view === "talk" ? (
        <>
          <div className="dfc-vs" data-s={voiceState} data-m={orbMood} aria-live="polite">
            {/* transcript toggle */}
            <button
              type="button"
              className="dfc-trb df-press"
              onClick={() => {
                hapticSelect();
                setTranscriptOpen(true);
              }}
              aria-label="Transcript"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3 2.6V14H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
                <path d="M19 9.5h1a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1v2l-2.4-2" />
              </svg>
            </button>

            {/* Dia — the flowing-light orb + waveform + label */}
            <VoiceOrb
              state={voiceState}
              mood={orbMood}
              levelsRef={levelsRef}
              onPoke={pokeDia}
              reducedMotion={reducedMotion}
              active={active && view === "talk"}
            />

            {/* captions (reference .cap) */}
            <div className="dfc-cap" aria-label="Live captions">
              {capUser ? (
                <p className="you">{capUser}</p>
              ) : voiceState === "listen" ? (
                <p className="you dfc-mut2">Go ahead, I&apos;m listening…</p>
              ) : null}
              {capAgent ? (
                <p className="coach" aria-label="Dia's reply">
                  {agentWords.map((w, i) => (
                    <Fragment key={i}>
                      <span className={`w${i < revealed ? " on" : ""}`}>{w}</span>
                    </Fragment>
                  ))}
                </p>
              ) : !capUser && voiceState === "idle" ? (
                <p className="coach hi">
                  {voiceLive
                    ? "Ready when you are."
                    : `Hey${firstName ? ` ${firstName}` : ""} — tap the mic and tell me about your day.`}
                </p>
              ) : null}
              {coachError && (
                <p className="dfc-err" role="alert">
                  {coachError}
                </p>
              )}
            </div>

            {/* prompt chips (reference .try) */}
            <div className="dfc-try" role="list" aria-label="Quick things to ask">
              {VOICE_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  role="listitem"
                  onClick={() => void speakToDia(p.prompt)}
                  className="df-press"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" />
                  </svg>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ---------- dock (reference .cmp) ---------- */}
          <footer className="dfc-cmp">
            {dock === "voice" ? (
              <div className="dfc-dk">
                <button
                  type="button"
                  className="dfc-sm2 df-press"
                  onClick={() => {
                    hapticSelect();
                    setDock("type");
                    setTimeout(() => chatInputRef.current?.focus(), 60);
                  }}
                  aria-label="Type instead"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="6.5" width="18" height="11" rx="3.2" />
                    <path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17 10.5h.01M8 14h8" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="dfc-micb df-press"
                  data-s={voiceState}
                  onClick={() => void toggleMic()}
                  aria-busy={connecting}
                  aria-label={
                    connecting
                      ? "Waking Dia"
                      : voiceState === "listen"
                        ? "Stop listening"
                        : voiceState === "idle"
                          ? "Talk to your coach"
                          : "Interrupt"
                  }
                >
                  <svg className="i-mic" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="3" width="6" height="11.5" rx="3" />
                    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
                  </svg>
                  <svg className="i-stop" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="7" y="7" width="10" height="10" rx="3" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`dfc-sm2 df-press${voiceOut ? "" : " off"}`}
                  onClick={() => {
                    hapticSelect();
                    const next = !voiceOut;
                    setVoiceOut(next);
                    if (!next) {
                      sessionRef.current?.interrupt();
                      try {
                        window.speechSynthesis?.cancel();
                      } catch { /* noop */ }
                    }
                    toast({
                      title: next ? "Coach voice on" : "Coach voice off",
                    });
                  }}
                  aria-label="Coach voice"
                  aria-pressed={voiceOut}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4.5 9.8h3L12 6.2v11.6l-4.5-3.6h-3z" />
                    <path className="wv" d="M15.2 9.2a4 4 0 0 1 0 5.6M17.8 6.8a7.5 7.5 0 0 1 0 10.4" />
                    <path className="sl" d="M4 4l16 16" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="dfc-cin">
                <button
                  type="button"
                  className="dfc-sm3 df-press"
                  onClick={() => {
                    hapticSelect();
                    setDock("voice");
                  }}
                  aria-label="Use voice"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="3" width="6" height="11.5" rx="3" />
                    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
                  </svg>
                </button>
                <textarea
                  ref={chatInputRef}
                  rows={1}
                  value={draft}
                  placeholder="Type to your coach…"
                  aria-label="Message"
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendTyped();
                    }
                  }}
                />
                <button
                  type="button"
                  className="dfc-send df-press"
                  onClick={sendTyped}
                  disabled={asking || !draftText}
                  aria-busy={asking}
                  aria-label={draftText ? "Send to your coach" : "Type a message first"}
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
            )}
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

      {/* ---------- transcript sheet (reference .trs) ---------- */}
      {transcriptOpen && (
        <div className="dfc-trs" role="dialog" aria-label="Transcript">
          <div className="dfc-trh">
            <b>Transcript</b>
            <button
              type="button"
              className="df-press"
              onClick={() => setTranscriptOpen(false)}
            >
              Done
            </button>
          </div>
          <div className="dfc-trl">
            {transcriptRows.length > 0 ? (
              transcriptRows.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className={`dfc-tmsg ${m.role === "user" ? "u" : "c"}`}
                >
                  {m.role === "assistant" ? stripReasoning(m.content) : m.content}
                </motion.div>
              ))
            ) : (
              <p className="dfc-empty">Nothing yet. Say hi to your coach.</p>
            )}
          </div>
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
