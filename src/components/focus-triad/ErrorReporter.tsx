"use client";

// ============================================================
// Focus Triad — ErrorReporter (audit P0-4, in-house monitor)
// ------------------------------------------------------------
// Mounts once in the root layout and listens for the two global
// failure signals — window.onerror and unhandledrejection — plus
// a manual window.__focusTriadCaptureError() escape hatch for React
// error boundaries. Events are batched (2s flush, max 10 per
// POST) and posted to /api/client-errors with the session
// cookies; failures are silent (an error monitor must never
// become an error source, and must never loop).
//
// Privacy: message + stack + current URL only. No payloads, no
// local storage, no retries beyond the current page lifetime.
// ============================================================

import { useEffect } from "react";

interface CapturedError {
  message: string;
  stack?: string;
  url?: string;
  context?: Record<string, unknown>;
}

const MAX_QUEUE = 10;
const FLUSH_MS = 2000;

export function reportClientError(err: Partial<CapturedError>) {
  try {
    window.dispatchEvent(
      new CustomEvent<CapturedError>("focus-triad:error", {
        detail: {
          message: String(err.message ?? "unknown error").slice(0, 2000),
          stack: err.stack?.slice(0, 8000),
          url: err.url ?? window.location.pathname,
          context: err.context,
        },
      })
    );
  } catch {
    /* never throw from the reporter */
  }
}

export function ErrorReporter() {
  useEffect(() => {
    const queue: CapturedError[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (queue.length === 0) return;
      const events = queue.splice(0, MAX_QUEUE);
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "client", events }),
        keepalive: true,
      }).catch(() => {
        /* drop — reporting must never loop */
      });
    };

    const enqueue = (e: CapturedError) => {
      if (queue.length >= MAX_QUEUE) return;
      queue.push(e);
      if (!timer) timer = setTimeout(flush, FLUSH_MS);
    };

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<CapturedError>).detail;
      if (detail?.message) enqueue(detail);
    };
    const onError = (
      message: string | Event,
      _src?: string,
      _line?: number,
      _col?: number,
      error?: Error
    ) => {
      enqueue({
        message: error?.message ?? (typeof message === "string" ? message : "window error"),
        stack: error?.stack,
        url: window.location.pathname,
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      enqueue({
        message:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : "unhandled promise rejection",
        stack: reason instanceof Error ? reason.stack : undefined,
        url: window.location.pathname,
      });
    };

    // Flush what we have when the page is being torn down.
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("focus-triad:error", onCustom);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      if (timer) clearTimeout(timer);
      flush();
      window.removeEventListener("focus-triad:error", onCustom);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}
