"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Copy, Sparkles, TriangleAlert } from "lucide-react";
import {
  dailyGrid,
  standup,
  computeDaySummary,
  activitiesForDay,
  fmtDuration,
} from "@/lib/demo-data";
import { useToast } from "@/hooks/use-toast";

export function DailyView() {
  const summary = useMemo(
    () => computeDaySummary(activitiesForDay(0)),
    []
  );
  const { toast } = useToast();
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const standupText = useMemo(() => {
    const done = standup.priorities.filter((_, i) => checked[i]);
    const pending = standup.priorities.filter((_, i) => !checked[i]);
    return [
      `Standup — ${standup.dateLabel}`,
      "",
      "Yesterday:",
      ...standup.highlights.map((h) => `- ${h}`),
      "",
      "Today:",
      ...pending.map((p) => `- [ ] ${p}`),
      ...done.map((p) => `- [x] ${p}`),
      "",
      "Blockers:",
      ...(standup.blockers.length
        ? standup.blockers.map((b) => `- ${b}`)
        : ["- None"]),
    ].join("\n");
  }, [checked]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(standupText);
      toast({ title: "Standup update copied" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard was denied." });
    }
  };

  return (
    <div className="df-scroll h-full overflow-y-auto px-4 sm:px-6 py-5">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1
            className="text-[21px] font-bold tracking-tight"
            style={{ color: "var(--df-text-primary)" }}
          >
            Daily
          </h1>
          <p
            className="text-[12.5px] mt-0.5"
            style={{ color: "var(--df-text-secondary)" }}
          >
            Your day at a glance, and the standup update already written.
          </p>
        </div>
        <button
          onClick={copy}
          className="df-press df-btn-secondary h-8 px-3 text-[12px] font-semibold flex items-center gap-1.5"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy standup
        </button>
      </div>

      {/* stat strip */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          label="Focus today"
          value={fmtDuration(summary.totalFocus)}
          tone="focus"
        />
        <StatTile
          label="Captured"
          value={fmtDuration(summary.totalCaptured)}
        />
        <StatTile
          label="Distractions"
          value={fmtDuration(summary.totalDistracted)}
          tone="warn"
        />
        <StatTile
          label="Longest block"
          value={
            summary.longestFocus ? fmtDuration(summary.longestFocus.minutes) : "—"
          }
        />
      </div>

      <div className="mt-5 grid xl:grid-cols-[1fr_360px] gap-4">
        {/* activity grid — GitHub style */}
        <section
          className="rounded-lg p-4"
          style={{
            background: "var(--df-daily-grid-fill)",
            border: "0.5px solid var(--df-daily-grid-border)",
          }}
          aria-label="Activity grid"
        >
          <h2
            className="text-[13px] font-bold"
            style={{ color: "var(--df-text-primary)" }}
          >
            Activity grid
          </h2>
          <p
            className="text-[11.5px] mt-0.5"
            style={{ color: "var(--df-text-muted)" }}
          >
            Focused 30-minute blocks, 9 AM – 7 PM
          </p>
          <div className="mt-3 overflow-x-auto df-scroll">
            <div className="min-w-[420px]">
              {/* hour header */}
              <div
                className="grid mb-1.5 text-[10px] font-semibold"
                style={{
                  gridTemplateColumns: "repeat(20, 16px)",
                  color: "var(--df-text-muted)",
                }}
              >
                <span />
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className="text-center col-span-2"
                    style={{ color: "var(--df-hour-label)" }}
                  >
                    {i + 9 > 12 ? `${i + 9 - 12}p` : `${i + 9}a`}
                  </span>
                ))}
              </div>
              <div
                className="grid gap-[3px]"
                style={{ gridTemplateColumns: "repeat(20, 16px)" }}
              >
                {dailyGrid.map((cell, i) => {
                  const value = cell.focus
                    ? Math.min(
                        4,
                        1 + Math.floor((i % 7) / 2) + (cell.half ? 1 : 0)
                      )
                    : 0;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.008, duration: 0.2 }}
                      className="h-4 w-4 rounded-[3px]"
                      style={{
                        background:
                          value === 0
                            ? "var(--df-daily-empty)"
                            : `rgba(243, 133, 75, ${0.28 + value * 0.17})`,
                        border:
                          value === 0
                            ? "0.5px solid color-mix(in srgb, var(--df-text-muted) 25%, transparent)"
                            : "0.5px solid rgba(243, 133, 75, 0.4)",
                      }}
                      title={`${cell.hour}:${cell.half ? "30" : "00"} — ${
                        cell.focus ? "focused" : "untracked"
                      }`}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[10px]"
                style={{ color: "var(--df-text-muted)" }}>
                less
                {[0, 1, 2, 3, 4].map((v) => (
                  <span
                    key={v}
                    className="h-3 w-3 rounded-[2px]"
                    style={{
                      background:
                        v === 0
                          ? "var(--df-daily-empty)"
                          : `rgba(243, 133, 75, ${0.28 + v * 0.17})`,
                    }}
                  />
                ))}
                more
              </div>
            </div>
          </div>
        </section>

        {/* standup card */}
        <section
          className="rounded-lg p-4 relative overflow-hidden"
          style={{
            border: "0.5px solid var(--df-daily-grid-border)",
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, var(--df-summary-card-fill) 75%, transparent), transparent)",
          }}
          aria-label="Daily standup"
        >
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-4 w-4"
              style={{ color: "var(--df-accent)" }}
            />
            <h2
              className="text-[13px] font-bold"
              style={{ color: "var(--df-text-primary)" }}
            >
              Standup — {standup.dateLabel}
            </h2>
          </div>

          <StandupSection title="Yesterday's highlights">
            {standup.highlights.map((h, i) => (
              <Bullet key={i} text={h} />
            ))}
          </StandupSection>

          <StandupSection title="Today's priorities">
            {standup.priorities.map((p, i) => (
              <button
                key={i}
                onClick={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
                className="df-press flex items-start gap-2 text-left w-full rounded-md px-1.5 py-1 -mx-1.5"
                aria-pressed={!!checked[i]}
              >
                <CheckCircle2
                  className="h-[15px] w-[15px] mt-[1.5px] shrink-0"
                  style={{
                    color: checked[i]
                      ? "var(--df-accent)"
                      : "var(--df-text-muted)",
                  }}
                />
                <span
                  className="text-[12px] leading-snug"
                  style={{
                    color: checked[i]
                      ? "var(--df-text-muted)"
                      : "var(--df-text-secondary)",
                    textDecoration: checked[i] ? "line-through" : "none",
                  }}
                >
                  {p}
                </span>
              </button>
            ))}
          </StandupSection>

          <StandupSection title="Blockers">
            {standup.blockers.length ? (
              standup.blockers.map((b, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5"
                  style={{
                    background:
                      "color-mix(in srgb, #FA8282 12%, transparent)",
                    border: "0.5px solid color-mix(in srgb, #FA8282 30%, transparent)",
                  }}
                >
                  <TriangleAlert
                    className="h-[15px] w-[15px] mt-[1px] shrink-0"
                    style={{ color: "#E55A3E" }}
                  />
                  <span
                    className="text-[12px] leading-snug"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
                    {b}
                  </span>
                </div>
              ))
            ) : (
              <Bullet text="None" muted />
            )}
          </StandupSection>
        </section>
      </div>
    </div>
  );
}

function StandupSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h3
        className="text-[10.5px] font-bold uppercase tracking-[0.07em] mb-1.5"
        style={{ color: "var(--df-text-tertiary)" }}
      >
        {title}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Bullet({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className="mt-[6px] w-[4.5px] h-[4.5px] rounded-full shrink-0"
        style={{ background: muted ? "var(--df-text-muted)" : "var(--df-accent)" }}
      />
      <span
        className="text-[12px] leading-snug"
        style={{
          color: muted ? "var(--df-text-muted)" : "var(--df-text-secondary)",
        }}
      >
        {text}
      </span>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "focus" | "warn";
}) {
  return (
    <div className="df-summary-card px-3 py-2.5">
      <div
        className="text-[17px] font-bold leading-none"
        style={{
          color:
            tone === "warn"
              ? "color-mix(in srgb, #FA8282 85%, var(--df-summary-value))"
              : "var(--df-summary-value)",
        }}
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
