"use client";

// ============================================================
// ServiceWorkerRegistrar — registers the hand-rolled app-shell
// service worker (public/sw.js) from the root layout.
//
// Deliberately boring: production-only (next dev's HMR and the SW
// cache fight each other), waits for the window `load` event so
// registration never competes with first-paint bandwidth, and every
// failure path is silent — the SW is a progressive enhancement, not
// a dependency.
// ============================================================

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Non-fatal by design: offline shell is an enhancement.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    // Bounded second attempt: if the first registration never took
    // (transient failure, cookieless first hit before the matcher fix,
    // …) try exactly once more — no polling.
    const retry = window.setTimeout(() => {
      navigator.serviceWorker
        .getRegistration()
        .then((existing) => {
          if (!existing) register();
        })
        .catch(() => undefined);
    }, 4000);

    return () => {
      window.removeEventListener("load", register);
      window.clearTimeout(retry);
    };
  }, []);

  return null;
}
