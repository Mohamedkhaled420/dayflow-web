"use client";

// ============================================================
// Dock — the iOS-safe bottom tab bar (PRD §9.2 / §7).
// Skeleton only: typed props + §9.1 tokens, zero feature logic.
//
// Hard rules baked in here:
// - Max 5 tabs (extra tabs are dropped; Settings moves to the
//   top-bar avatar menu per PRD §7).
// - backdrop-filter capped at blur-xl, forced GPU layer via
//   translateZ(0) + will-change (WebKit black-box guard).
// - 48x48 minimum tap targets; labels 10px tracking-wide medium.
// - Safe-area padding: env(safe-area-inset-bottom) + 8px.
// - contextmenu suppressed (native-feel, PRD §7).
// - Active indicator = sliding spring thumb on the compositor
//   (transform only, --ease-spring-critical). Phase 1 swaps the
//   thumb to motion/react layoutId="dock-pill".
// ============================================================

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DockTabProps {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface DockProps {
  /** Tabs to render — at most 5 (PRD §7). Excess tabs are dropped. */
  tabs: readonly DockTabProps[];
  /** The active tab id (controlled). */
  value?: string | null;
  /** Selection callback (API surface; wiring is the app's job). */
  onSelect?: (id: string) => void;
  /** Accessible name for the tab list. */
  label?: string;
  className?: string;
}

export function Dock({
  tabs,
  value,
  onSelect,
  label = "Primary",
  className,
}: DockProps) {
  const visible = tabs.slice(0, 5);
  const activeIndex = Math.max(
    0,
    visible.findIndex((t) => t.id === value)
  );
  const count = Math.max(visible.length, 1);

  return (
    <nav
      aria-label={label}
      role="tablist"
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[520px] px-2",
        className
      )}
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)",
        background: "var(--color-surface-glass)",
        WebkitBackdropFilter: "blur(24px) saturate(1.7)",
        backdropFilter: "blur(24px) saturate(1.7)",
        borderTop: "0.5px solid var(--hairline)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      {/* Sliding spring thumb — transform-only, critically damped.
          Phase 1: replace with motion layoutId="dock-pill". */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 bottom-1 left-2 right-2"
      >
        <span
          className="absolute inset-y-0 block"
          style={{
            width: `calc((100% - 0px) / ${count})`,
            transform: `translateX(${activeIndex * 100}%)`,
            transition:
              "transform 300ms var(--ease-spring-critical), width 300ms var(--ease-spring-critical)",
            background: "var(--color-surface-elevated)",
            borderRadius: "var(--radius-panel)",
            boxShadow: "inset 0 1px 0 var(--hairline)",
          }}
        />
      </span>

      {visible.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect?.(tab.id)}
            className="relative z-10 flex min-w-[48px] min-h-[48px] flex-1 flex-col items-center justify-center gap-1 bg-transparent"
            style={{
              color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
            }}
          >
            {tab.icon}
            <span className="text-[10px] font-medium tracking-wide">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
