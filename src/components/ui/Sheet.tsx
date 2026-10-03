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
import { SheetPortal } from "@/components/ui/SheetPortal";

/**
 * visualViewport keyboard tracking (PRD §7 / Phase 5 T2b).
 *
 * Maintains `--keyboard-height` (px) on <html> so every sheet can
 * ride above the software keyboard: `bottom: calc(var(--safe-area-bottom) +
 * var(--keyboard-height))`. Writes the CSS variable directly on the
 * documentElement (no React state) — resize events are async, so
 * the set-state-in-effect rule never applies, and every open sheet
 * stays in sync through the single shared variable.
 *
 * ── Phase 12d: phantom-keyboard hardening ─────────────────────
 * The naive `innerHeight − visualViewport.height` difference is NOT
 * proof of a keyboard. On iOS standalone PWAs the interactive
 * (drag-down) keyboard dismissal fires transient resize events
 * mid-gesture and can miss the final one — freezing the variable at
 * a phantom value (observed on device: 113.5px and ~620px lifts
 * with no keyboard on screen, floating every sheet above the home
 * indicator and slicing their capped content). Three defenses:
 *
 * 1. WRITE gates — a value is only published when ALL hold:
 *    • a text-ish element (input/textarea/select/contenteditable)
 *      actually holds focus — a keyboard cannot exist without one;
 *    • the visual viewport is not zoomed (|scale − 1| ≤ 1%) —
 *      pinch/auto-zoom shrinks visualViewport.height too;
 *    • the delta is sane: < 120px is an iOS quirk (no real keyboard
 *      is under ~150px on any device — the home-indicator inset
 *      mismatch and the observed 113.5px stale frame live here),
 *      > 60% of the visual viewport is a mid-animation frame (real
 *      keyboards cap at ~50% on the largest phones, ~30% on tablets).
 * 2. READ heals — besides visualViewport events, the value is
 *    re-read (from the LIVE visualViewport, so a missed final
 *    event self-corrects) on: window resize, orientationchange,
 *    visibilitychange, focusin/focusout (delayed for dismissal
 *    animations to settle) and every pointerup. Any interaction
 *    after a frozen frame erases the phantom.
 * 3. Writes are rAF-coalesced — bursts of resize events during
 *    the keyboard animation cost one style write per frame.
 */
/* Module-level mount counter for the reference-counted cleanup
   (see useKeyboardTracking). */
let mountedCount = 0;

/** A software keyboard can only be up while a text-ish element has focus. */
function textFocusActive(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return (
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable
  );
}

/**
 * Pure computation of the keyboard height from the live viewport
 * state, with the phantom gates applied. Exported for tests.
 */
export function computeKeyboardHeight(
  innerHeight: number,
  vvHeight: number,
  vvOffsetTop: number,
  vvScale: number,
  focusActive: boolean
): number {
  if (!focusActive) return 0;
  if (Math.abs(vvScale - 1) > 0.01) return 0;
  const delta = Math.round(innerHeight - vvHeight - vvOffsetTop);
  // Floor: no real software keyboard is under ~150px on any device —
  // deltas below 120px are iOS quirks (home-indicator inset mismatch,
  // toolbar transitions, the observed 113.5px stale dismissal frame).
  if (delta < 120) return 0;
  if (delta > vvHeight * 0.6) return 0; // mid-animation / bogus frame
  return delta;
}

export function useKeyboardTracking(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    let raf = 0;

    const apply = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const k = computeKeyboardHeight(
        window.innerHeight,
        vv.height,
        vv.offsetTop,
        vv.scale,
        textFocusActive()
      );
      document.documentElement.style.setProperty("--keyboard-height", `${k}px`);
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
      });
    };

    // focusout fires before the dismissal animation finishes — re-read
    // once it has settled so the final (full-height) state wins.
    const onOutDelayed = () => window.setTimeout(schedule, 280);

    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    document.addEventListener("visibilitychange", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", onOutDelayed, true);
    // The self-heal of last resort: any tap re-reads the LIVE viewport
    // and erases a phantom frozen by a missed final resize event.
    window.addEventListener("pointerup", schedule, { passive: true, capture: true });

    apply();
    mountedCount += 1;
    return () => {
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      document.removeEventListener("visibilitychange", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", onOutDelayed, true);
      window.removeEventListener("pointerup", schedule, true);
      if (raf) cancelAnimationFrame(raf);
      mountedCount -= 1;
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
    // Portal to <body> — iOS WebKit clips fixed overlays mounted
    // inside scroll containers (SheetPortal.tsx). All Sheet users
    // (MorningTriadGate, ...) inherit the guarantee.
    <SheetPortal>
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
             clearance come off the scrim box (100%) — the very box
             the sheet anchors to — not 100dvh, which iOS standalone
             can disagree with (Phase 12d). Flex column: the handle
             is flex-none, the content is the ONLY shrinking item
             (flex-1 min-h-0) so chrome can never be sliced. */
          "relative z-10 flex flex-col max-h-[calc(100%-max(var(--safe-area-bottom,0px),var(--keyboard-height,0px))-44px)] w-full max-w-[560px] overflow-hidden",
          "df-edge-fade",
          className
        )}
      >
        {/* Grab handle — the Phase 1 drag API surface.
            1:1 drag, rubber-band, velocity dismissal attach here. */}
        <div
          data-df-sheet-grab-handle=""
          {...grabHandleProps}
          className="flex min-h-[44px] w-full flex-none items-center justify-center"
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
          className="df-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom,0px)+16px)]"
          style={{ color: "var(--df-text-primary)" }}
        >
          {children}
        </div>
      </div>
      </div>
    </SheetPortal>
  );
}
