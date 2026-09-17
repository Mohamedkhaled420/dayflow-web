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
 * on-screen keyboard occupies the bottom band. Two independent
 * signals, each holding its own ref-counted reason:
 *
 *   1. visualViewport — iOS and modern Android (resizes-visual):
 *      the keyboard shrinks vv.height but not window.innerHeight,
 *      so the difference IS the keyboard.
 *   2. focus state — older Android resizes BOTH viewports, the
 *      difference stays ~0 and signal 1 never fires. Text-entry
 *      focus catches those. Released only when focus truly leaves
 *      text entry (the timeout lets focusin win when it moves
 *      between two inputs).
 *
 * Where both signals fire they simply stack — the reference count
 * keeps the dock hidden until every reason clears. Mount once from
 * the app shell; returns a cleanup that releases both.
 */
const KEYBOARD_MIN = 120;

function isTextEntry(el: Element | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
}

export function watchDockKeyboard(): () => void {
  if (typeof window === "undefined") return () => {};
  const vv = window.visualViewport;

  let vvRelease: (() => void) | null = null;
  let focusRelease: (() => void) | null = null;

  const vvHandler = () => {
    if (!vv) return;
    const keyboardPx = window.innerHeight - vv.height;
    const open = keyboardPx > KEYBOARD_MIN;
    if (open && !vvRelease) {
      vvRelease = requestDockHide("keyboard");
    } else if (!open && vvRelease) {
      vvRelease();
      vvRelease = null;
    }
  };

  const focusin = (e: FocusEvent) => {
    if (e.target instanceof Element && isTextEntry(e.target) && !focusRelease) {
      focusRelease = requestDockHide("keyboard-focus");
    }
  };
  const focusout = () => {
    // Next tick: if focus moved to another text entry, focusin has
    // already re-registered by then and activeElement is still set.
    setTimeout(() => {
      if (focusRelease && !isTextEntry(document.activeElement)) {
        focusRelease();
        focusRelease = null;
      }
    }, 0);
  };

  vv?.addEventListener("resize", vvHandler);
  vvHandler();
  document.addEventListener("focusin", focusin);
  document.addEventListener("focusout", focusout);

  return () => {
    vv?.removeEventListener("resize", vvHandler);
    document.removeEventListener("focusin", focusin);
    document.removeEventListener("focusout", focusout);
    vvRelease?.();
    vvRelease = null;
    focusRelease?.();
    focusRelease = null;
  };
}
