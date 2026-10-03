"use client";

// ============================================================
// ServiceWorkerRegistrar — registers the app-shell service
// worker (served from /sw.js as a build-stamped route) and
// keeps it CURRENT for the life of the session.
//
// The Phase-4 registrar registered once and never looked back.
// A constant-version worker meant deploys changed nothing: one
// failed navigation fetch and the PWA served a stale shell
// indefinitely, while iOS standalone resume-from-memory skipped
// the network entirely — the device could run weeks-old code
// and every "fix" shipped to main was invisible to the user.
//
// This registrar closes all three staleness paths:
//   1. updateViaCache: "none" — worker updates never come from
//      the HTTP disk cache;
//   2. periodic + on-visibility registration.update() — a
//      resumed-from-memory PWA still notices new deploys;
//   3. one-shot reload on controllerchange — when a new build's
//      worker takes over, the page snaps to it immediately.
// ============================================================

import { useEffect } from "react";

/* Update-check cadence. The browser already checks on navigation;
 * the interval only matters for long-lived sessions (iOS keeps
 * standalone PWAs suspended in memory and resumes them without a
 * single network request — sometimes for days). */
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h
const VISIBILITY_MIN_GAP_MS = 15 * 60 * 1000; // at most every 15min on focus

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let lastVisibilityCheck = 0;
    let updateTimer = 0;
    let reloadTimer = 0;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Non-fatal by design: offline shell is an enhancement.
        });
    };

    // Cheap, idempotent — revalidates the worker script against the
    // server and starts the install flow when the bytes changed.
    const checkForUpdate = () => {
      navigator.serviceWorker
        .getRegistration("/")
        .then((reg) => reg?.update().catch(() => undefined))
        .catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibilityCheck < VISIBILITY_MIN_GAP_MS) return;
      lastVisibilityCheck = now;
      checkForUpdate();
    };

    // A new build's worker called skipWaiting + clients.claim — the
    // page is now served by different code than it booted with.
    // Reload ONCE to run the fresh bundle (guard: the event also
    // fires on first-install claim, where a reload is harmless but
    // wasteful — so only reload if a controller ALREADY existed).
    let hadController = navigator.serviceWorker.controller !== null;
    let refreshed = false;
    const onControllerChange = () => {
      if (refreshed) return;
      // First-ever install: no controller existed before, nothing to
      // snap out of.
      if (!hadController) return;
      refreshed = true;
      reloadTimer = window.setTimeout(() => location.reload(), 50);
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    updateTimer = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
      window.clearInterval(updateTimer);
      window.clearTimeout(reloadTimer);
    };
  }, []);

  return null;
}
