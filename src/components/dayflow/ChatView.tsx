"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Calendar, Clock, List, Sparkles, Sun } from "lucide-react";
import { chatSuggestions } from "@/lib/demo-data";
import { getApiKey } from "@/lib/api-key-store";

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTION_ICONS: Record<
  string,
  React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>
> = {
  sun: Sun,
  list: List,
  clock: Clock,
  calendar: Calendar,
};

const WELCOME: Msg = {
  id: 0,
  role: "assistant",
  content:
    "Hi! I'm grounded in your work journal — ask me about your timeline, focus patterns, categories, or how the week went.\n\nThis demo answers from the sample day. In the native app, I'd answer from everything Dayflow captured on your Mac.",
};

export function ChatView() {
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

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
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content:
            data.reply ??
            data.error ??
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
            Chat with your work journal
          </h1>
          <p
            className="text-[11.5px]"
            style={{ color: "var(--df-text-muted)" }}
          >
            Answers grounded in your timeline
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
        {messages.map((m) => (
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
        {messages.length <= 1 && !busy && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="px-4 sm:px-6 pb-2 flex flex-wrap gap-2"
          >
            {chatSuggestions.map((s) => {
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
            aria-label="Ask a question about your work journal"
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
        <p
          className="text-[10px] mt-1.5 text-center"
          style={{ color: "var(--df-text-muted)" }}
        >
          Chat answers from your local journal data. Add an API key in Settings
          for a live LLM.
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
