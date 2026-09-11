"use client";

// ============================================================
// InstallAppCard — "Install App" entry for the Settings →
// Profile view (Phase 4 T1).
//
// Listens for the browser's `beforeinstallprompt` event (Chrome,
// Edge, Samsung Internet) and surfaces a lightweight one-tap
// install button. iOS Safari never fires that event, so iOS users
// get the native "Share → Add to Home Screen" recipe instead.
// When the app already runs standalone (installed), the card
// confirms it instead of offering the button again.
// ============================================================

import { useEffect, useState } from "react";
import { Check, MonitorSmartphone, Share, SquarePlus } from "lucide-react";
import { hapticSelect } from "@/lib/haptics";

/** Minimal shape of the non-standard beforeinstallprompt event. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = "detecting" | "installable" | "ios" | "unsupported" | "installed";

/**
 * Pure platform probe (client-only): running standalone, iOS Safari
 * (which never fires beforeinstallprompt), or awaiting a prompt.
 */
function detectInstallState(): InstallState {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const ua = navigator.userAgent;
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ masquerades as desktop Safari but still has touch.
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  return "detecting";
}

export function InstallAppCard() {
  const [state, setState] = useState<InstallState>(() =>
    typeof window === "undefined" ? "detecting" : detectInstallState()
  );
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Platform detection already happened in the lazy state initializer;
    // this effect only subscribes to the two lifecycle events.
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // keep the browser's own mini-infobar quiet
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setState("installable");
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setState("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // If no prompt arrives promptly, fall through to generic guidance.
    const fallback = window.setTimeout(() => {
      setState((s) => (s === "detecting" ? "unsupported" : s));
    }, 1200);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(fallback);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    hapticSelect();
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setState("installed");
    }
    setDeferredPrompt(null); // the event is single-use either way
  };

  return (
    <section
      className="rounded-lg p-4 mt-4"
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label="Install app"
    >
      <h2
        className="text-[13px] font-bold flex items-center gap-2"
        style={{ color: "var(--df-text-primary)" }}
      >
        <span style={{ color: "var(--df-accent)" }}>
          <MonitorSmartphone className="h-4 w-4" />
        </span>
        Install app
      </h2>

      {state !== "installed" && (
        <p
          className="mt-2 text-[12.5px] leading-relaxed"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Add Dayflow to your home screen for a full-screen, app-like launch —
          the shell loads instantly and your local data comes with it.
        </p>
      )}

      <div className="mt-3">
        {state === "installable" && (
          <button
            onClick={install}
            className="df-press df-btn-primary px-4 h-9 text-[12.5px] font-semibold"
          >
            Install Dayflow
          </button>
        )}

        {state === "installed" && (
          <p
            className="flex items-center gap-1.5 text-[12.5px] font-medium"
            style={{ color: "var(--df-accent-text)" }}
          >
            <Check className="h-4 w-4" />
            Dayflow is installed on this device
          </p>
        )}

        {state === "ios" && (
          <div
            className="rounded-md px-3 py-2.5 flex items-start gap-2.5"
            style={{
              background: "var(--df-chip-fill)",
              border: "0.5px solid var(--df-chip-border)",
            }}
          >
            <Share
              className="h-4 w-4 mt-0.5 shrink-0"
              style={{ color: "var(--df-accent)" }}
            />
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--df-text-secondary)" }}
            >
              On iPhone or iPad, tap <strong style={{ color: "var(--df-text-primary)" }}>Share</strong>{" "}
              in Safari, then{" "}
              <strong style={{ color: "var(--df-text-primary)" }}>
                <span className="inline-flex items-center gap-1">
                  <SquarePlus className="h-3.5 w-3.5" />
                  Add to Home Screen
                </span>
              </strong>
              .
            </p>
          </div>
        )}

        {(state === "unsupported" || state === "detecting") && (
          <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
            One-tap install shows up in Chrome, Edge, and Samsung Internet once the
            browser is ready — you can also use your browser menu&rsquo;s
            &ldquo;Install app&rdquo; / &ldquo;Add to Home Screen&rdquo; at any time.
          </p>
        )}
      </div>
    </section>
  );
}
