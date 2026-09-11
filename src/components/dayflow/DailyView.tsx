"use client";

// DailyView — the day at a glance: per-category activity grid
// (when you worked, trained, ate, slept) plus an auto-written
// daily recap you can copy anywhere. Ported from the native
// "Daily" view; the standup card becomes a personal recap.

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Copy, Sparkles, TriangleAlert } from "lucide-react";
import { useDayflowData, useSortedCategories } from "@/lib/store";
import { keyForOffset, keyToDate } from "@/lib/seed";
import {
  fmtDuration,
  goalsForDay,
  minutesForCategory,
  recapForDay,
  toMinutes,
  waterTotal,
  eventsForDay,
} from "@/lib/compute";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_COLORS } from "@/styles/palette";

const GRID_START = 5 * 60; // 5 AM
const GRID_END = 23 * 60 + 30; // 11:30 PM
const SLOT = 30;
const SLOTS = (GRID_END - GRID_START) / SLOT; // 37

export function DailyView() {
  const data = useDayflowData();
  const categories = useSortedCategories();
  const { toast } = useToast();
  const [dayOffset, setDayOffset] = useState(0);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const dateKey = keyForOffset(dayOffset);
  const date = keyToDate(dateKey);
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const goals = useMemo(() => goalsForDay(data, dateKey), [data, dateKey]);
  const recap = useMemo(() => recapForDay(data, dateKey), [data, dateKey]);

  // category rows → set of active 30-min slots
  const rows = useMemo(() => {
    const timeCats = categories.filter((c) => c.kind === "time");
    return timeCats.map((c) => {
      const acts = eventsForDay(data.events, dateKey).filter((e) => e.categoryId === c.id);
      const slots = new Set<number>();
      for (const e of acts) {
        let s = toMinutes(e.start);
        let t = toMinutes(e.end);
        if (t <= s) {
          // overnight (sleep): morning part 0–end and evening part start–24h
          slots.add(0);
          s = GRID_START;
        }
        const from = Math.max(s, GRID_START);
        const to = Math.min(t, GRID_END);
        for (let m = Math.ceil(from / SLOT) * SLOT; m < to; m += SLOT) slots.add(m);
      }
      return { category: c, slots };
    });
  }, [categories, data.events, dateKey]);

  const waterMl = waterTotal(data.water, dateKey);
  const waterGoal = goals.find((g) => g.key === "water")!;

  const recapText = useMemo(() => {
    const done = recap.focus.filter((_, i) => checked[i]);
    const pending = recap.focus.filter((_, i) => !checked[i]);
    return [
      `Dayflow recap — ${dateLabel}`,
      "",
      "Highlights:",
      ...recap.highlights.map((h) => `- ${h}`),
      "",
      "Next up:",
      ...pending.map((p) => `- [ ] ${p}`),
      ...done.map((p) => `- [x] ${p}`),
      "",
      "Watch-outs:",
      ...(recap.watchouts.length ? recap.watchouts.map((w) => `- ${w}`) : ["- None"]),
    ].join("\n");
  }, [recap, checked, dateLabel]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recapText);
      toast({ title: "Daily recap copied" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard was denied." });
    }
  };

  return (
    <div className="df-daily-view df-scroll h-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto px-4 sm:px-6 py-5">
      {/* header */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDayOffset((o) => Math.max(-13, o - 1))}
              disabled={dayOffset <= -13}
              aria-label="Previous day"
              className="df-press w-7 h-7 rounded-full grid place-items-center disabled:opacity-35"
              style={{ color: "var(--df-text-primary)" }}
            >
              ←
            </button>
            <h1
              className="text-[21px] font-bold tracking-tight"
              style={{ color: "var(--df-text-primary)" }}
            >
              {dateLabel}
            </h1>
            <button
              onClick={() => setDayOffset((o) => Math.min(0, o + 1))}
              disabled={dayOffset >= 0}
              aria-label="Next day"
              className="df-press w-7 h-7 rounded-full grid place-items-center disabled:opacity-35"
              style={{ color: "var(--df-text-primary)" }}
            >
              →
            </button>
          </div>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--df-text-secondary)" }}>
            {dayOffset === 0
              ? "Today so far — come back tonight for the full picture."
              : "A full day, broken down by category."}
          </p>
        </div>
        <button
          onClick={copy}
          className="df-press df-btn-secondary h-8 px-3 text-[12px] font-semibold flex items-center gap-1.5"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy recap
        </button>
      </div>

      {/* stat strip */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatTile label="Sleep" value={fmtDuration(goals.find((g) => g.key === "sleep")!.done)} />
        <StatTile label="Work" value={fmtDuration(minutesForCategory(data.events, dateKey, "work"))} />
        <StatTile
          label="Personal"
          value={fmtDuration(minutesForCategory(data.events, dateKey, "personal"))}
        />
        <StatTile label="Fitness" value={fmtDuration(goals.find((g) => g.key === "fitness")!.done)} />
        <StatTile
          label="Water"
          value={`${waterMl ? Math.round((waterMl / (data.profile.waterGlassMl || 250)) * 10) / 10 : 0} gl`}
          sub={`${waterMl} ml`}
        />
      </div>

      <div className="mt-5 grid xl:grid-cols-[1fr_360px] gap-4">
        {/* category activity grid */}
        <section
          className="rounded-lg p-4"
          style={{
            background: "var(--df-daily-grid-fill)",
            border: "0.5px solid var(--df-daily-grid-border)",
          }}
          aria-label="Category activity grid"
        >
          <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
            Your day by category
          </h2>
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--df-text-muted)" }}>
            30-minute slots, 5 AM – 11:30 PM
          </p>
          <div className="mt-3 overflow-x-auto df-scroll">
            <div className="min-w-[480px]">
              {/* hour header: label every 2 hours = 4 slots */}
              <div
                className="grid mb-1.5 pl-[110px] text-[10px] font-semibold"
                style={{ gridTemplateColumns: `repeat(${SLOTS}, 16px)`, gap: "3px" }}
              >
                {Array.from({ length: Math.ceil(SLOTS / 4) }, (_, i) => {
                  const h = GRID_START / 60 + i * 2;
                  const span = Math.min(4, SLOTS - i * 4);
                  return (
                    <span
                      key={i}
                      style={{
                        gridColumn: `span ${span}`,
                        textAlign: "center",
                        color: "var(--df-hour-label)",
                      }}
                    >
                      {h >= 24 ? "" : h > 12 ? `${h - 12}p` : `${h}a`}
                    </span>
                  );
                })}
              </div>
              <div className="flex flex-col gap-[3px]">
                {rows.map((row) => (
                  <div key={row.category.id} className="flex items-center gap-2">
                    <span
                      className="w-[110px] shrink-0 text-right text-[11px] font-medium truncate pr-1"
                      style={{ color: "var(--df-text-secondary)" }}
                      title={row.category.name}
                    >
                      {row.category.name}
                    </span>
                    <div
                      className="grid gap-[3px]"
                      style={{ gridTemplateColumns: `repeat(${SLOTS}, 16px)` }}
                    >
                      {Array.from({ length: SLOTS }, (_, i) => {
                        const slotMin = GRID_START + i * SLOT;
                        const active = row.slots.has(slotMin);
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.006, duration: 0.18 }}
                            className="h-4 w-4 rounded-[3px]"
                            style={{
                              background: active
                                ? row.category.colorHex
                                : "var(--df-daily-empty)",
                              border: active
                                ? `0.5px solid color-mix(in srgb, ${row.category.colorHex} 55%, transparent)`
                                : "0.5px solid color-mix(in srgb, var(--df-text-muted) 25%, transparent)",
                            }}
                            title={`${row.category.name} · ${
                              Math.floor(slotMin / 60) > 12
                                ? `${Math.floor(slotMin / 60) - 12}`
                                : `${Math.floor(slotMin / 60)}`
                            }:${slotMin % 60 === 0 ? "00" : "30"} ${
                              slotMin >= 720 ? "PM" : "AM"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="mt-3 flex items-center gap-1.5 text-[10px]"
                style={{ color: "var(--df-text-muted)" }}
              >
                <span className="ml-[110px]">water</span>
                <span
                  className="h-3 w-3 rounded-[2px]"
                  style={{
                    background:
                      waterGoal.met ? CATEGORY_COLORS.water : `color-mix(in srgb, ${CATEGORY_COLORS.water} 35%, transparent)`,
                  }}
                />
                <span>
                  {waterGoal.done.toFixed(0)}/{waterGoal.target} glasses {waterGoal.met ? "· goal met" : ""}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* daily recap card */}
        <section
          className="rounded-lg p-4 relative overflow-hidden"
          style={{
            border: "0.5px solid var(--df-daily-grid-border)",
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, var(--df-summary-card-fill) 75%, transparent), transparent)",
          }}
          aria-label="Daily recap"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--df-accent)" }} />
            <h2 className="text-[13px] font-bold" style={{ color: "var(--df-text-primary)" }}>
              Recap — {dayOffset === 0 ? "today" : dateLabel.split(", ")[0]}
            </h2>
          </div>

          <RecapSection title="Highlights">
            {recap.highlights.map((h, i) => (
              <Bullet key={i} text={h} />
            ))}
          </RecapSection>

          <RecapSection title="Next up">
            {recap.focus.map((p, i) => (
              <button
                key={i}
                onClick={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
                className="df-press flex items-start gap-2 text-left w-full rounded-md px-1.5 py-1 -mx-1.5"
                aria-pressed={!!checked[i]}
              >
                <CheckCircle2
                  className="h-[15px] w-[15px] mt-[1.5px] shrink-0"
                  style={{
                    color: checked[i] ? "var(--df-accent)" : "var(--df-text-muted)",
                  }}
                />
                <span
                  className="text-[12px] leading-snug"
                  style={{
                    color: checked[i] ? "var(--df-text-muted)" : "var(--df-text-secondary)",
                    textDecoration: checked[i] ? "line-through" : "none",
                  }}
                >
                  {p}
                </span>
              </button>
            ))}
          </RecapSection>

          <RecapSection title="Watch-outs">
            {recap.watchouts.length ? (
              recap.watchouts.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5"
                  style={{
                    background: "color-mix(in srgb, var(--df-destructive-soft) 12%, transparent)",
                    border: "0.5px solid color-mix(in srgb, var(--df-destructive-soft) 30%, transparent)",
                  }}
                >
                  <TriangleAlert
                    className="h-[15px] w-[15px] mt-[1px] shrink-0"
                    style={{ color: "var(--df-destructive-text)" }}
                  />
                  <span
                    className="text-[12px] leading-snug"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
                    {w}
                  </span>
                </div>
              ))
            ) : (
              <Bullet text="None — every goal within reach." muted />
            )}
          </RecapSection>
        </section>
      </div>
    </div>
  );
}

function RecapSection({
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
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="df-summary-card px-3 py-2.5">
      <div
        className="text-[17px] font-bold leading-none"
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
      {sub && (
        <div className="text-[9.5px] mt-0.5 tabular-nums" style={{ color: "var(--df-text-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
