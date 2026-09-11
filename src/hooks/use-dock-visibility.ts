"use client";

// ============================================================
// Dayflow AI — dock visibility (Phase 8 / S2, WS4)
// ------------------------------------------------------------
// Rule A (overlay floats): sheets/dialogs paint ABOVE the dock
//   (z-60 overlays, z-100 toasts — F-1 hotfix, unchanged).
// Rule B (immersive hides): this module. Any surface that
//   genuinely needs the bottom band — the on-screen keyboard,
//   the fullscreen journal editor — REQUESTS a hide by reason
//   string. Requests are REFERENCE-COUNTED: the dock returns
//   only when every requester has released.
// Rule C (content reserves): scroll containers keep a constant
//   pb-[calc(88px+env(safe-area-inset-bottom))] no matter the
//   dock state — the reserved band never changes size, so the
//   hide/show transition is transform+opacity only and CLS
//   stays exactly 0.
//
// Module-level store (not zustand — this is UI chrome state,
// not data): plain Set + listeners + useSyncExternalStore.
// ============================================================

import { useEffect } from "react";
import { useSyncExternalStore } from "react";

const reasons = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Request the mobile dock to hide. Returns a release function
 *  (idempotent — safe to call more than once). */
export function requestDockHide(reason: string): () => void {
  let released = false;
  if (!reasons.has(reason)) {
    reasons.add(reason);
    emit();
  }
  return () => {
    if (released) return;
    released = true;
    if (reasons.delete(reason)) emit();
  };
}

/** SSR-safe snapshot for useSyncExternalStore. */
function isDockHidden(): boolean {
  return reasons.size > 0;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reactive read: true while ANY hide request is active. */
export function useDockHidden(): boolean {
  return useSyncExternalStore(subscribe, isDockHidden, () => false);
}

/**
 * Component-friendly request: holds a hide request for the
 * component's lifetime while `active` is true (Rule B).
 */
export function useDockHideRequest(reason: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return requestDockHide(reason);
  }, [reason, active]);
}

/**
 * Keyboard watcher (Rule B, global): hides the dock while the
 * on-screen keyboard occupies more than KEYBOARD_MIN px of the
 * visual viewport. Mount once from the app shell; returns a
 * cleanup that also releases the keyboard reason.
 */
const KEYBOARD_MIN = 120;

export function watchDockKeyboard(): () => void {
  if (typeof window === "undefined") return () => {};
  const vv = window.visualViewport;
  if (!vv) return () => {};

  let currentRelease: (() => void) | null = null;
  const handler = () => {
    const keyboardPx = window.innerHeight - vv.height;
    const open = keyboardPx > KEYBOARD_MIN;
    if (open && !currentRelease) {
      currentRelease = requestDockHide("keyboard");
    } else if (!open && currentRelease) {
      currentRelease();
      currentRelease = null;
    }
  };

  vv.addEventListener("resize", handler);
  handler();

  return () => {
    vv.removeEventListener("resize", handler);
    currentRelease?.();
    currentRelease = null;
  };
}
