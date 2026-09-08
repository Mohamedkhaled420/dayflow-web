"use client";

// ChatView — journal chat grounded in the user's tracker data.
// The client computes a compact context from the local store and
// posts it with the conversation; the API answers deterministically
// from that context, or through a live LLM when a key is saved.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, BedDouble, Calendar, Droplet, Dumbbell, Sparkles } from "lucide-react";
import { getApiKey } from "@/lib/api-key-store";
import { useDayflowData } from "@/lib/store";
import { keyForOffset, keyToDate } from "@/lib/seed";
import {
  eventDuration,
  eventsForDay,
  fmtDuration,
  fmtRange,
  goalsForDay,
  aggregateWeek,
  weekOf,
  weekWorkoutSessions,
  workoutsForDay,
} from "@/lib/compute";

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  { icon: "bed", label: "How did I sleep this week?" },
  { icon: "drop", label: "How much water did I drink today?" },
  { icon: "dumbbell", label: "Am I hitting my fitness goals?" },
  { icon: "calendar", label: "Summarize my week" },
];

const SUGGESTION_ICONS: Record<
  string,
  React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>
> = {
  bed: BedDouble,
  drop: Droplet,
  dumbbell: Dumbbell,
  calendar: Calendar,
};

export function ChatView() {
  const data = useDayflowData();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const welcome = useMemo<Msg>(
    () => ({
      id: 0,
      role: "assistant",
      content: `Hi ${data.profile.name.split(" ")[0]}! I'm grounded in your tracker — ask me about your sleep, workouts, water, meals, work time, or how the week is going.\n\nRight now I answer from your local data. Add an API key in Settings for a live LLM with the same grounding.`,
    }),
    [data.profile.name]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  // compact tracker context computed from the store, sent with every ask
  const buildContext = () => {
    const todayKey = keyForOffset(0);
    const today = eventsForDay(data.events, todayKey);
    const week = weekOf(todayKey);
    const days = aggregateWeek(data, week);
    return {
      today: {
        dateLabel: keyToDate(todayKey).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
        events: today.map((e) => ({
          title: e.title,
          category:
            data.categories.find((c) => c.id === e.categoryId)?.name ?? "Uncategorized",
          range: fmtRange(e),
          minutes: eventDuration(e),
          notes: e.notes,
        })),
        goals: goalsForDay(data, todayKey).map((g) => ({
          label: g.label,
          done: Math.round(g.done * 10) / 10,
          target: g.target,
          unit: g.unit,
          met: g.met,
        })),
      },
      week: {
        days: days.map((d) => ({
          label: d.label,
          dateLabel: d.dateLabel,
          minutesByCategory: d.minutesByCategory,
          waterGlasses: d.waterGlasses,
          sleepMinutes: d.sleepMinutes,
          totalTracked: d.totalTracked,
        })),
        workouts: (() => {
          const w = weekWorkoutSessions(data, week);
          return { count: w.count, minutes: w.minutes, titles: w.titles };
        })(),
        goals: {
          workMinutesPerDay: data.goals.workMinutes,
          sleepMinutesPerNight: data.goals.sleepMinutes,
          waterGlassesPerDay: data.goals.waterGlasses,
          fitnessSessionsPerWeek: data.goals.fitnessSessionsPerWeek,
        },
      },
      workoutsToday: workoutsForDay(data.events, todayKey).map((e) => e.title),
    };
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { id: Date.now(), role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages.filter((m) => m.id !== 0), { role: "user", content: q }],
          apiKey: getApiKey() || undefined,
          context: buildContext(),
        }),
      });
      const data2 = (await res.json()) as { reply?: string; error?: string };
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content:
            data2.reply ??
            data2.error ??
            "Something went wrong answering that. Try again?",
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "The chat service is unreachable right now. Try again in a moment.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const allMessages = messages.length > 0 ? [welcome, ...messages] : [welcome];

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
          <Sparkles className="h-4 w-4" style={{ color: "var(--df-accent)" }} />
        </span>
        <div>
          <h1
            className="text-[15.5px] font-bold leading-tight"
            style={{ color: "var(--df-text-primary)" }}
          >
            Chat with your tracker
          </h1>
          <p className="text-[11.5px]" style={{ color: "var(--df-text-muted)" }}>
            Answers grounded in your logs — no data leaves your browser without a key
          </p>
        </div>
      </header>

      {/* messages */}
      <div
        ref={scrollRef}
        className="df-scroll flex-1 overflow-y-auto px-4 sm:px-6 pb-2 flex flex-col gap-3"
        role="log"
        aria-label="Chat messages"
      >
        {allMessages.map((m) => (
          <Bubble key={m.id} role={m.role}>
            {m.content}
          </Bubble>
        ))}
        {busy && (
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
      </div>

      {/* suggestions */}
      <AnimatePresence>
        {messages.length === 0 && !busy && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="px-4 sm:px-6 pb-2 flex flex-wrap gap-2"
          >
            {SUGGESTIONS.map((s) => {
              const Icon = SUGGESTION_ICONS[s.icon] ?? Sparkles;
              return (
                <button
                  key={s.label}
                  onClick={() => send(s.label)}
                  className="df-press df-chip rounded-full h-8 pl-2.5 pr-3.5 flex items-center gap-1.5 text-[12px] font-medium"
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: "var(--df-accent)" }} />
                  {s.label}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="px-4 sm:px-6 py-3"
      >
        <div
          className="flex items-end gap-2 rounded-[10px] p-2"
          style={{
            background: "var(--df-input-fill)",
            border: "0.5px solid var(--df-input-border)",
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about your day…"
            aria-label="Ask a question about your tracker"
            className="flex-1 bg-transparent outline-none resize-none text-[13px] leading-relaxed placeholder:text-[var(--df-text-muted)] max-h-32"
            style={{ color: "var(--df-text-primary)" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Send message"
            className="df-press df-btn-primary w-8 h-8 rounded-[8px] grid place-items-center disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-[10px] mt-1.5 text-center" style={{ color: "var(--df-text-muted)" }}>
          Chat answers from your local tracker data. Add an API key in Settings for a live LLM.
        </p>
      </form>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: string }) {
  const isUser = role === "user";
  return (
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
  );
}
