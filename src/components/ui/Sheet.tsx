"use client";

// ============================================================
// Sheet — the single bottom-sheet primitive (PRD §7).
// Skeleton only: typed props + §9.1 tokens, zero feature logic.
//
// This file owns the SHELL: scrim, sheet surface (--radius-sheet
// top corners, T0 frost, GPU layer), grab handle, scroll-edge
// fade, Escape dismissal, and dialog semantics.
//
// Phase 1 attaches the physics (vaul-style): 1:1 drag tracking,
// rubber-band at top, velocity dismissal, visualViewport resize
// tracking for keyboard clearance. The drag controller binds
// through `grabHandleProps` and the data attributes below.
// ============================================================

import {
  useEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * visualViewport keyboard tracking (PRD §7 / Phase 5 T2b).
 *
 * Maintains `--keyboard-height` (px) on <html> so every sheet can
 * ride above the software keyboard: `bottom: calc(var(--safe-area-bottom) +
 * var(--keyboard-height))`. Writes the CSS variable directly on the
 * documentElement (no React state) — resize events are async, so
 * the set-state-in-effect rule never applies, and every open sheet
 * stays in sync through the single shared variable.
 */
export function useKeyboardTracking(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => {
      const keyboardHeight = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
      );
      document.documentElement.style.setProperty("--keyboard-height", `${keyboardHeight}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      document.documentElement.style.setProperty("--keyboard-height", "0px");
    };
  }, []);
}

export interface SheetProps {
  /** Whether the sheet is open. */
  open: boolean;
  /** Dismissal callback (scrim click, Escape key). */
  onClose: () => void;
  /** Sheet content. */
  children: ReactNode;
  /** Accessible dialog title (announced once per open). */
  title?: string;
  /** Accessible label for the grab handle. */
  grabHandleLabel?: string;
  /**
   * Escape hatch for the Phase 1 drag controller: spread onto the
   * grab handle (pointer handlers, drag state, cursor).
   */
  grabHandleProps?: HTMLAttributes<HTMLDivElement>;
  className?: string;
}

export function Sheet({
  open,
  onClose,
  children,
  title,
  grabHandleLabel = "Dismiss",
  grabHandleProps,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // T2b: track the software keyboard for the whole time a sheet
  // can be open — the shared --keyboard-height variable lifts the
  // surface via the bottom offset below.
  useKeyboardTracking();

  // Escape dismissal — part of the dialog API surface.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Keyboard clearance: the sheet rides above the software keyboard
  // (PRD §7) — safe-area + tracked keyboard height.
  const sheetOffsetStyle: CSSProperties = {
    bottom: "calc(var(--safe-area-bottom, 0px) + var(--keyboard-height, 0px))",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Scrim — token scrim, frosted, GPU-promoted */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: "var(--df-scrim)",
          transform: "translateZ(0)",
          willChange: "transform",
        }}
      />

      {/* Sheet surface — the signature glass primitive at sheet radius */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        {...(title ? { "aria-label": title } : {})}
        data-df-sheet-panel=""
        style={{
          ...sheetOffsetStyle,
          background: "var(--color-surface-glass)",
          borderTopLeftRadius: "var(--radius-sheet)",
          borderTopRightRadius: "var(--radius-sheet)",
          boxShadow: "var(--df-sheet-shadow)",
          WebkitBackdropFilter: "blur(18px) saturate(1.7)",
          backdropFilter: "blur(18px) saturate(1.7)",
          transform: "translateZ(0)",
          willChange: "transform",
        }}
        className={cn(
          "relative z-10 max-h-[92dvh] w-full max-w-[560px] overflow-hidden",
          "df-edge-fade",
          className
        )}
      >
        {/* Grab handle — the Phase 1 drag API surface.
            1:1 drag, rubber-band, velocity dismissal attach here. */}
        <div
          data-df-sheet-grab-handle=""
          {...grabHandleProps}
          className="flex min-h-[44px] w-full items-center justify-center"
          aria-label={grabHandleLabel}
          role="button"
          tabIndex={-1}
        >
          <span
            aria-hidden="true"
            className="block h-[5px] w-9"
            style={{
              borderRadius: "var(--radius-pill)",
              background: "var(--color-ink-faint)",
            }}
          />
        </div>

        <div
          data-df-sheet-content=""
          className="df-scroll max-h-[calc(92dvh-44px)] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
          style={{ color: "var(--color-ink)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
