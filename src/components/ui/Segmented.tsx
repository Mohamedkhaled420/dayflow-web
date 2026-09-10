"use client";

// ============================================================
// Segmented — the segmented control with a sliding spring
// thumb (PRD §5.6). Skeleton only: typed props + §9.1 tokens,
// zero feature logic (selection is controlled via props).
//
// The thumb slides on transform only, timed with the critically
// damped spring token — compositor-only by construction.
// Phase 1 swaps the CSS thumb for a motion/react layoutId thumb.
// ============================================================

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedProps {
  /** Options — 2 to 4 recommended (more should become a Sheet picker, PRD §7). */
  options: readonly SegmentedOption[];
  /** The selected option id (controlled). */
  value: string;
  /** Selection callback (API surface; wiring is the app's job). */
  onChange: (id: string) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}

export function Segmented({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedProps) {
  const count = Math.max(options.length, 1);
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.id === value)
  );

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("relative flex w-full", className)}
      style={{
        background: "var(--color-surface-subtle)",
        borderRadius: "var(--radius-pill)",
        padding: "4px",
      }}
    >
      {/* Sliding spring thumb — transform-only, critically damped.
          Phase 1: replace with motion layoutId thumb. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1"
        style={{
          width: `calc((100% - 8px) / ${count})`,
          transform: `translateX(${activeIndex * 100}%)`,
          transition:
            "transform 300ms var(--ease-spring-critical), width 300ms var(--ease-spring-critical)",
          background: "var(--color-surface-elevated)",
          borderRadius: "var(--radius-pill)",
          boxShadow: "inset 0 1px 0 var(--hairline)",
        }}
      />

      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className="relative z-10 flex min-h-[44px] flex-1 items-center justify-center gap-1.5 bg-transparent px-3 text-[13px] font-medium"
            style={{
              color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
            }}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
