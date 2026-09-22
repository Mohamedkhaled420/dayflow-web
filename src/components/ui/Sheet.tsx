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
/* Module-level mount counter for the reference-counted cleanup
   (see useKeyboardTracking). */
let mountedCount = 0;

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
    // Reference counting (standalone-PWA fix): the tracker is now
    // mounted globally from the app shell AND per-sheet. The var
    // must go to 0 only when the LAST listener detaches — otherwise
    // a sheet closing while the keyboard stays open (e.g. back to
    // the chat composer) zeroes the lift and buries the composer
    // until the next visualViewport event that never comes.
    mountedCount += 1;
    return () => {
      mountedCount -= 1;
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      if (mountedCount === 0) {
        document.documentElement.style.setProperty("--keyboard-height", "0px");
      }
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

  // Keyboard clearance + standalone safe areas: the sheet rides
  // above the software keyboard; max() (not a sum — standalone-PWA
  // fix) because the keyboard height already spans the home
  // indicator, so adding both double-lifts the sheet ~34px above
  // the keys.
  const sheetOffsetStyle: CSSProperties = {
    bottom:
      "max(var(--safe-area-bottom, 0px), var(--keyboard-height, 0px))",
  };

  // Phase 6 QA finding (hotfix): z-[60] lifts every sheet above the
  // mobile dock (z-50, later in DOM order). At equal z-50 the dock
  // painted over sheet action rows, occluding primary CTAs — the
  // sheet's 16px bottom padding never reserved the ~88px dock band
  // the main panel does. Toasts stay on top at z-[100].
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
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
          /* Phase 10: the sheet rides the app's floating material —
             cream frosted glass in the pastel day, plum in dark. */
          background: "var(--df-material-bg)",
          borderTopLeftRadius: "var(--radius-sheet)",
          borderTopRightRadius: "var(--radius-sheet)",
          boxShadow: "var(--df-sheet-shadow)",
          WebkitBackdropFilter: "blur(18px) saturate(1.7)",
          backdropFilter: "blur(18px) saturate(1.7)",
          transform: "translateZ(0)",
          willChange: "transform",
        }}
        className={cn(
          /* Standalone (pinned) fix: cap the sheet so its grab handle
             can never slide under the notch/status bar. The lift
             (keyboard OR home-indicator inset) and a 44px top
             clearance come off the full viewport, not 92dvh — with a
             keyboard open the old cap let the handle render ~200px
             above the physical screen. */
          "relative z-10 max-h-[calc(100dvh-max(var(--safe-area-bottom,0px),var(--keyboard-height,0px))-44px)] w-full max-w-[560px] overflow-hidden",
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
              background: "var(--df-text-muted)",
            }}
          />
        </div>

        <div
          data-df-sheet-content=""
          className="df-scroll max-h-[calc(100dvh-max(var(--safe-area-bottom,0px),var(--keyboard-height,0px))-88px)] overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom,0px)+16px)]"
          style={{ color: "var(--df-text-primary)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
