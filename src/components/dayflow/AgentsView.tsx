"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, PlayCircle, Sparkles, Terminal } from "lucide-react";
import { agentThreads, type AgentThread } from "@/lib/demo-data";
import { useToast } from "@/hooks/use-toast";

export function AgentsView() {
  const [selected, setSelected] = useState<AgentThread | null>(null);

  return (
    <div className="df-scroll h-full overflow-y-auto px-4 sm:px-6 py-5">
      <div className="flex items-center gap-2.5">
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
            className="text-[21px] font-bold tracking-tight leading-tight"
            style={{ color: "var(--df-text-primary)" }}
          >
            Agents
          </h1>
          <p
            className="text-[12.5px]"
            style={{ color: "var(--df-text-secondary)" }}
          >
            AI coding sessions from your day, with usage and cost context.
          </p>
        </div>
      </div>

      {/* totals strip */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <AgentStat label="Sessions" value={String(agentThreads.length)} />
        <AgentStat
          label="Agent time"
          value={`${agentThreads.reduce((s, a) => s + a.durationMinutes, 0)}m`}
        />
        <AgentStat
          label="Tool calls"
          value={String(agentThreads.reduce((s, a) => s + a.toolCalls, 0))}
        />
        <AgentStat
          label="Tokens"
          value={`${(
            agentThreads.reduce((s, a) => s + a.tokens, 0) / 1000
          ).toFixed(1)}k`}
        />
      </div>

      {/* threads */}
      <div className="mt-5 grid md:grid-cols-2 gap-3">
        {agentThreads.map((a, i) => (
          <motion.button
            key={a.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            onClick={() => setSelected(selected?.id === a.id ? null : a)}
            className="df-card text-left p-4 df-press"
            style={{
              outline: selected?.id === a.id ? "1.5px solid var(--df-accent)" : "none",
              outlineOffset: "1px",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-[13.5px] font-bold leading-snug"
                style={{ color: "var(--df-text-primary)" }}
              >
                {a.title}
              </span>
              <AgentBadge agent={a.agent} />
            </div>
            <div
              className="mt-1.5 flex items-center gap-1.5 text-[11.5px]"
              style={{ color: "var(--df-text-muted)" }}
            >
              <Terminal className="h-3 w-3" />
              {a.project} · started {a.startedAt}
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px] font-medium flex-wrap">
              <UsageChip icon={<PlayCircle className="h-3 w-3" />} label={`${a.durationMinutes}m`} />
              <UsageChip label={`${a.messages} msgs`} />
              <UsageChip label={`${a.toolCalls} tools`} />
              <UsageChip label={`${(a.tokens / 1000).toFixed(1)}k tokens`} />
              {a.status === "completed" && (
                <span
                  className="ml-auto flex items-center gap-1"
                  style={{ color: "var(--df-accent-text)" }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  completed
                </span>
              )}
            </div>

            {selected?.id === a.id && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-3 pt-3 border-t"
                style={{ borderColor: "var(--df-right-panel-divider)" }}
              >
                <p
                  className="text-[12px] leading-relaxed"
                  style={{ color: "var(--df-text-secondary)" }}
                >
                  Session replay and full transcripts are part of the native
                  app&apos;s Agent Bridge — agents connect to Dayflow over a
                  local MCP server, so the web demo shows the session index and
                  usage stats only.
                </p>
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function AgentBadge({ agent }: { agent: AgentThread["agent"] }) {
  const color =
    agent === "Claude Code"
      ? "#D97757"
      : agent === "Codex"
        ? "#10A37F"
        : "#CF8FFF";
  return (
    <span
      className="shrink-0 text-[10px] font-bold px-2 py-[3px] rounded-full"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `0.5px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      {agent}
    </span>
  );
}

function UsageChip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span
      className="df-chip rounded-full px-2 py-[3px] flex items-center gap-1"
      style={{ color: "var(--df-text-secondary)" }}
    >
      {icon}
      {label}
    </span>
  );
}

function AgentStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="df-summary-card px-3 py-2.5">
      <div
        className="text-[16px] font-bold leading-none"
        style={{ color: "var(--df-summary-value)" }}
      >
        {value}
      </div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wide mt-1.5"
        style={{ color: "var(--df-text-muted)" }}
      >
        {label}
      </div>
    </div>
  );
}
