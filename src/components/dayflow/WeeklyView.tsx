"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  categoryById,
  fmtDuration,
  heatmapHours,
  weekStats,
  weeklyAppUsage,
  weeklyCategoryTotals,
  weeklyHeatmap,
  weeklyHighlights,
} from "@/lib/demo-data";
import { DonutChart } from "@/components/dayflow/DonutChart";

export function WeeklyView() {
  const [hoverCell, setHoverCell] = useState<string | null>(null);

  const totals = useMemo(() => {
    const focus = weekStats.reduce((s, d) => s + d.focusMinutes, 0);
    const distracted = weekStats.reduce((s, d) => s + d.distractionMinutes, 0);
    const captured = weekStats.reduce((s, d) => s + d.capturedMinutes, 0);
    const bestDay = weekStats.reduce((a, b) =>
      b.focusMinutes > a.focusMinutes ? b : a
    );
    return { focus, distracted, captured, bestDay };
  }, []);

  const donutSlices = useMemo(
    () =>
      weeklyCategoryTotals.map((t) => {
        const c = categoryById(t.categoryId);
        return { label: c.name, value: t.minutes, colorHex: c.colorHex };
      }),
    []
  );

  const maxFocus = Math.max(...weekStats.map((d) => d.focusMinutes));

  return (
    <div className="df-scroll h-full overflow-y-auto px-4 sm:px-6 py-5">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1
            className="text-[21px] font-bold tracking-tight"
            style={{ color: "var(--df-text-primary)" }}
          >
            Weekly review
          </h1>
          <p
            className="text-[12.5px] mt-0.5"
            style={{ color: "var(--df-text-secondary)" }}
          >
            Where the week actually went — focus, categories, apps, drift.
          </p>
        </div>
      </div>

      {/* overview strip */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Focus this week" value={fmtDuration(totals.focus)} />
        <Tile
          label="Best day"
          value={`${totals.bestDay.label} · ${fmtDuration(
            totals.bestDay.focusMinutes
          )}`}
        />
        <Tile label="Distractions" value={fmtDuration(totals.distracted)} tone="warn" />
        <Tile
          label="Avg focus / day"
          value={fmtDuration(Math.round(totals.focus / 7))}
        />
      </div>

      <div className="mt-5 grid xl:grid-cols-2 gap-4">
        {/* focus per day bars */}
        <Panel title="Focus per day" caption="Focused minutes vs distractions">
          <div className="flex items-end gap-2 sm:gap-3 h-[150px] mt-2">
            {weekStats.map((d, i) => {
              const fh = (d.focusMinutes / maxFocus) * 118;
              const dh = (d.distractionMinutes / maxFocus) * 118;
              return (
                <div
                  key={d.label}
                  className="flex-1 flex flex-col items-center gap-1.5"
                >
                  <div
                    className="w-full flex flex-col justify-end items-center gap-[3px] h-[128px]"
                    title={`${d.label}: ${fmtDuration(d.focusMinutes)} focus, ${fmtDuration(
                      d.distractionMinutes
                    )} distraction`}
                  >
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: fh }}
                      transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="w-full max-w-[34px] rounded-t-[4px]"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(243,133,75,0.85), rgba(255,163,118,0.95))",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)",
                      }}
                    />
                    {dh > 2 && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: dh }}
                        transition={{ delay: 0.05 * i + 0.15, duration: 0.4 }}
                        className="w-full max-w-[34px] rounded-t-[3px] rounded-b-[2px]"
                        style={{
                          background: "rgba(250, 130, 130, 0.45)",
                        }}
                      />
                    )}
                  </div>
                  <span
                    className="text-[10.5px] font-semibold"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10.5px]"
            style={{ color: "var(--df-text-muted)" }}>
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-[3px] inline-block" style={{background: "rgba(243,133,75,0.9)"}} />
              Focus
            </span>
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-[3px] inline-block" style={{background: "rgba(250,130,130,0.5)"}} />
              Distraction
            </span>
          </div>
        </Panel>

        {/* category donut */}
        <Panel title="Category split" caption="Where the week's hours landed">
          <div className="flex items-center gap-5 flex-wrap justify-center mt-2">
            <DonutChart
              slices={donutSlices}
              size={150}
              centerTitle="tracked"
              centerValue={fmtDuration(totals.captured)}
            />
            <ul className="flex flex-col gap-1.5 min-w-[170px]">
              {donutSlices.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center gap-2 text-[12px]"
                >
                  <span
                    className="w-3 h-3 rounded-[4px] shrink-0"
                    style={{ background: s.colorHex, opacity: 0.8 }}
                  />
                  <span
                    className="flex-1 truncate"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
                    {s.label}
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--df-text-primary)" }}
                  >
                    {fmtDuration(s.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid xl:grid-cols-2 gap-4">
        {/* focus heatmap */}
        <Panel title="Focus heatmap" caption="Focused activity by hour, 8 AM – 8 PM">
          <div className="mt-2 overflow-x-auto df-scroll">
            <div className="min-w-[380px]">
              <div
                className="grid gap-[3px] mb-1"
                style={{
                  gridTemplateColumns: "30px repeat(12, 1fr)",
                }}
              >
                <span />
                {heatmapHours.map((h) => (
                  <span
                    key={h}
                    className="text-[9.5px] text-center"
                    style={{ color: "var(--df-text-muted)" }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {weekStats.map((d, row) => (
                <div
                  key={d.label}
                  className="grid gap-[3px] items-center mb-[3px]"
                  style={{ gridTemplateColumns: "30px repeat(12, 1fr)" }}
                >
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
                    {d.label}
                  </span>
                  {weeklyHeatmap[row].map((v, col) => (
                    <div
                      key={col}
                      onMouseEnter={() => setHoverCell(`${d.label} ${heatmapHours[col]}`)}
                      onMouseLeave={() => setHoverCell(null)}
                      className="h-[15px] rounded-[3px]"
                      style={{
                        background:
                          v === 0
                            ? "var(--df-empty-cell)"
                            : `rgba(243, 133, 75, ${0.2 + v * 0.25})`,
                        outline:
                          hoverCell === `${d.label} ${heatmapHours[col]}`
                            ? "1.5px solid var(--df-accent)"
                            : "none",
                      }}
                      title={`${d.label} ${heatmapHours[col]} — intensity ${v}/3`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* app usage */}
        <Panel title="Apps" caption="Most-used applications this week">
          <ul className="mt-2 flex flex-col gap-2.5">
            {weeklyAppUsage.map((a, i) => {
              const max = weeklyAppUsage[0].hours;
              return (
                <li key={a.app} className="flex items-center gap-2.5">
                  <span
                    className="text-[12px] font-medium w-[72px] shrink-0 truncate"
                    style={{ color: "var(--df-text-secondary)" }}
                  >
                    {a.app}
                  </span>
                  <div
                    className="flex-1 h-[13px] rounded-[4px] overflow-hidden"
                    style={{ background: "var(--df-segment-track)" }}
                    role="progressbar"
                    aria-label={`${a.app} usage`}
                    aria-valuenow={Math.round((a.hours / max) * 100)}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(a.hours / max) * 100}%` }}
                      transition={{ delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-[4px]"
                      style={{
                        background: `linear-gradient(to right, color-mix(in srgb, ${a.colorHex} 75%, transparent), ${a.colorHex})`,
                      }}
                    />
                  </div>
                  <span
                    className="text-[11px] font-semibold w-[42px] text-right shrink-0"
                    style={{ color: "var(--df-text-primary)" }}
                  >
                    {a.hours}h
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {/* highlights */}
      <Panel title="Highlights" caption="What stood out this week" className="mt-4">
        <ul className="mt-1 flex flex-col gap-2">
          {weeklyHighlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className="mt-[6px] w-[5px] h-[5px] rounded-full shrink-0"
                style={{ background: "var(--df-accent)" }}
              />
              <span
                className="text-[13px] leading-snug"
                style={{ color: "var(--df-text-secondary)" }}
              >
                {h}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  caption,
  children,
  className,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg p-4 ${className ?? ""}`}
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label={title}
    >
      <h2
        className="text-[13px] font-bold"
        style={{ color: "var(--df-text-primary)" }}
      >
        {title}
      </h2>
      {caption && (
        <p
          className="text-[11.5px] mt-0.5"
          style={{ color: "var(--df-text-muted)" }}
        >
          {caption}
        </p>
      )}
      {children}
    </section>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="df-summary-card px-3 py-2.5">
      <div
        className="text-[16px] font-bold leading-tight"
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
        className="text-[10px] font-semibold uppercase tracking-wide mt-1"
        style={{ color: "var(--df-text-muted)" }}
      >
        {label}
      </div>
    </div>
  );
}
