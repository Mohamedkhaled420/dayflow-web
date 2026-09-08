"use client";

import { useMemo, useState } from "react";

export interface DonutSlice {
  label: string;
  value: number; // minutes
  colorHex: string;
}

interface Arc {
  d: string;
  color: string;
}

/** Arc geometry for the ring; module-level so it stays a pure computation. */
function computeArcs(
  slices: DonutSlice[],
  size: number,
  thickness: number
): Arc[] {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const gap = slices.length > 1 ? 0.02 : 0;
  let acc = -Math.PI / 2;
  const out: Arc[] = [];
  for (const s of slices) {
    const sweep = (s.value / total) * Math.PI * 2;
    const start = acc + gap / 2;
    const end = acc + sweep - gap / 2;
    acc += sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    out.push({
      d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      color: s.colorHex,
    });
  }
  return out;
}

/** SVG donut matching Dayflow's CategoryDonutChart: soft ring, center label, hover emphasis. */
export function DonutChart({
  slices,
  size = 132,
  thickness = 13,
  centerTitle,
  centerValue,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerTitle?: string;
  centerValue?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const arcs = useMemo(
    () => computeArcs(slices, size, thickness),
    [slices, size, thickness]
  );

  const total = useMemo(
    () => slices.reduce((s, x) => s + x.value, 0) || 1,
    [slices]
  );

  const emphasized = hovered != null ? slices[hovered] : null;

  return (
    <div className="relative inline-grid place-items-center">
      <svg
        width={size}
        height={size}
        role="img"
        aria-label="Category breakdown"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - thickness) / 2}
          fill="none"
          stroke="var(--df-donut-ring-bg)"
          strokeWidth={thickness}
        />
        {arcs.map((a, i) => (
          <path
            key={i}
            d={a.d}
            fill="none"
            stroke={a.color}
            strokeWidth={hovered === i ? thickness + 3 : thickness}
            strokeLinecap="butt"
            opacity={hovered == null || hovered === i ? 1 : 0.45}
            style={{ transition: "stroke-width .15s ease, opacity .15s ease" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
        <div>
          <div
            className="text-[15px] font-semibold leading-tight"
            style={{ color: "var(--df-text-primary)" }}
          >
            {emphasized ? fmt(emphasized.value) : (centerValue ?? fmt(total))}
          </div>
          <div
            className="text-[10.5px] font-medium"
            style={{ color: "var(--df-text-muted)" }}
          >
            {emphasized ? emphasized.label : (centerTitle ?? "total")}
          </div>
        </div>
      </div>
    </div>
  );
}

function fmt(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
