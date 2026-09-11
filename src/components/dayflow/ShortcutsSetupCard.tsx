"use client";

// ============================================================
// ShortcutsSetupCard — Apple Shortcuts setup (Phase 4 T3)
// in Settings → Profile.
//
// Gives the user everything an iOS Shortcut needs to talk to the
// ingest webhook (src/app/api/shortcuts/ingest/route.ts):
//   1. The exact webhook URL for THIS deployment (derived from
//      window.location.origin, so it is correct in dev, preview,
//      and production alike).
//   2. A copy-paste JSON payload template per metric type.
//   3. The Authorization: Bearer session token the route demands
//      (Amendment #12 — no client-side secrets; this is the user's
//      own live session JWT, shown only to them).
//   4. A "Test Connection" button that fires a dummy 250 ml
//      hydration tap with the live session and asserts HTTP 200 +
//      { success: true } — proving the exact Shortcut config works
//      before the user leaves the browser.
// ============================================================

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, LoaderCircle, Workflow, Zap } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { hapticSelect, hapticSuccess } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";

type MetricType = "hydration_tap" | "sleep_sync" | "workout_sync";

/** Body templates that mirror the ingest route's Zod schema exactly. */
const TEMPLATES: Record<MetricType, string> = {
  hydration_tap: JSON.stringify(
    { metricType: "hydration_tap", payload: { volumeMl: 250 } },
    null,
    2
  ),
  sleep_sync: JSON.stringify(
    { metricType: "sleep_sync", payload: { sleepMinutes: 450 } },
    null,
    2
  ),
  workout_sync: JSON.stringify(
    { metricType: "workout_sync", payload: { workoutType: "Run" } },
    null,
    2
  ),
};

const METRIC_TABS: { id: MetricType; label: string }[] = [
  { id: "hydration_tap", label: "Water" },
  { id: "sleep_sync", label: "Sleep" },
  { id: "workout_sync", label: "Workout" },
];

const noopSubscribe = () => () => {};

export function ShortcutsSetupCard() {
  const { toast } = useToast();
  // Exact deployment origin (dev / preview / production), read through
  // useSyncExternalStore so there is no hydration mismatch and no
  // effect-phase setState. Snapshot is a string — referentially stable.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
  const [metric, setMetric] = useState<MetricType>("hydration_tap");
  const [token, setToken] = useState("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  // Copied feedback per row: "url" | "payload" | "token" | null
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    // Surface the live session JWT + its expiry for the Bearer header.
    let alive = true;
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (!alive || !session) return;
        setToken(session.access_token);
        setTokenExpiresAt(session.expires_at ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const copy = async (key: string, value: string, label: string) => {
    hapticSelect();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast({ title: "Copy failed", description: "Select the text and copy manually." });
      return;
    }
    setCopied(key);
    toast({ title: `${label} copied` });
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  };

  const testConnection = async () => {
    if (testing) return;
    hapticSelect();
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) {
        throw new Error("No active session — sign in again, then retry.");
      }
      const res = await fetch(`${window.location.origin}/api/shortcuts/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: TEMPLATES.hydration_tap,
      });
      const body: unknown = await res.json().catch(() => ({}));
      const ok = res.status === 200 && !!body && (body as { success?: boolean }).success === true;
      if (ok) {
        hapticSuccess();
        setTestResult({
          ok: true,
          message: "200 OK — the webhook is live and a 250 ml test tap was logged to today.",
        });
      } else {
        const detail =
          body && typeof body === "object" && "error" in body
            ? ` — ${(body as { error?: string }).error}`
            : "";
        setTestResult({ ok: false, message: `Ingest answered ${res.status}${detail}.` });
      }
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : "Network error — is the app online?",
      });
    } finally {
      setTesting(false);
    }
  };

  const tokenMinutesLeft = tokenExpiresAt
    ? Math.max(0, Math.round((tokenExpiresAt * 1000 - Date.now()) / 60000))
    : null;

  return (
    <section
      className="rounded-lg p-4 mt-4"
      style={{
        background: "var(--df-daily-grid-fill)",
        border: "0.5px solid var(--df-daily-grid-border)",
      }}
      aria-label="Apple Shortcuts setup"
    >
      <h2
        className="text-[13px] font-bold flex items-center gap-2"
        style={{ color: "var(--df-text-primary)" }}
      >
        <span style={{ color: "var(--df-accent)" }}>
          <Workflow className="h-4 w-4" />
        </span>
        Apple Shortcuts
      </h2>
      <p
        className="mt-2 text-[12.5px] leading-relaxed"
        style={{ color: "var(--df-text-secondary)" }}
      >
        Log water, sleep, and workouts from iOS Shortcuts, Widgets, or the Action
        Button — no app switch needed. Configure the Shortcut once with the URL,
        token, and payload below, then tap it from anywhere.
      </p>

      {/* --- webhook URL --- */}
      <div className="mt-3">
        <label
          className="text-[10.5px] font-bold uppercase tracking-[0.06em] block"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Webhook URL
        </label>
        <div className="mt-1.5 flex gap-2 max-w-full items-center">
          <code
            className="flex-1 min-w-0 truncate rounded-md px-3 h-9 flex items-center text-[12px]"
            style={{
              background: "var(--df-input-fill)",
              border: "0.5px solid var(--df-input-border)",
              color: "var(--df-text-primary)",
            }}
            title={origin ? `${origin}/api/shortcuts/ingest` : undefined}
          >
            {origin ? `${origin}/api/shortcuts/ingest` : "resolving…"}
          </code>
          <button
            onClick={() => copy("url", `${origin}/api/shortcuts/ingest`, "Webhook URL")}
            disabled={!origin}
            aria-label="Copy webhook URL"
            className="df-press df-btn-secondary h-9 px-3 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
          >
            {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "url" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* --- bearer token --- */}
      <div className="mt-3.5">
        <label
          className="text-[10.5px] font-bold uppercase tracking-[0.06em] block"
          style={{ color: "var(--df-text-secondary)" }}
        >
          Authorization token (Bearer)
        </label>
        <div className="mt-1.5 flex gap-2 max-w-full items-center">
          <code
            className="flex-1 min-w-0 truncate rounded-md px-3 h-9 flex items-center text-[12px]"
            style={{
              background: "var(--df-input-fill)",
              border: "0.5px solid var(--df-input-border)",
              color: "var(--df-text-secondary)",
            }}
            title={token || undefined}
          >
            {token ? `${token.slice(0, 18)}…${token.slice(-6)}` : "sign-in session required"}
          </code>
          <button
            onClick={() => copy("token", token, "Token")}
            disabled={!token}
            aria-label="Copy authorization token"
            className="df-press df-btn-secondary h-9 px-3 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
          >
            {copied === "token" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "token" ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
          In the Shortcut&rsquo;s &ldquo;Get Contents of URL&rdquo; action, add a request header:
          Authorization = Bearer &lt;token&gt;. Session tokens expire
          {tokenMinutesLeft !== null ? ` (~${tokenMinutesLeft} min left on this one)` : ""} and
          refresh while you use the app — if the Shortcut starts getting 401s, come back and
          copy a fresh one.
        </p>
      </div>

      {/* --- payload template --- */}
      <div className="mt-3.5">
        <label
          className="text-[10.5px] font-bold uppercase tracking-[0.06em] block"
          style={{ color: "var(--df-text-secondary)" }}
        >
          JSON payload
        </label>
        <div
          className="mt-1.5 inline-flex rounded-[7px] p-[3px] flex-wrap gap-0.5"
          style={{
            background: "var(--df-segment-track)",
            border: "0.5px solid var(--df-segment-track-border)",
          }}
          role="tablist"
          aria-label="Payload metric type"
        >
          {METRIC_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={metric === t.id}
              onClick={() => {
                hapticSelect();
                setMetric(t.id);
              }}
              className="df-press px-3.5 h-[26px] rounded-[5px] text-[12px] font-semibold"
              style={
                metric === t.id
                  ? {
                      background: "var(--df-control-fill)",
                      border: "0.5px solid var(--df-control-border)",
                      boxShadow: "inset 0 0 0 2px var(--df-control-glow)",
                      color: "var(--df-text-primary)",
                    }
                  : { color: "var(--df-segment-inactive)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2 max-w-full items-start">
          <pre
            className="flex-1 min-w-0 overflow-x-auto rounded-md px-3 py-2.5 text-[11.5px] leading-relaxed"
            style={{
              background: "var(--df-input-fill)",
              border: "0.5px solid var(--df-input-border)",
              color: "var(--df-text-primary)",
            }}
            aria-label={`${metric} payload template`}
          >
            <code>{TEMPLATES[metric]}</code>
          </pre>
          <button
            onClick={() => copy("payload", TEMPLATES[metric], "Payload")}
            aria-label="Copy JSON payload"
            className="df-press df-btn-secondary h-9 px-3 text-[12.5px] font-semibold flex items-center gap-1.5 shrink-0"
          >
            {copied === "payload" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "payload" ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
          Set the request body type to JSON and paste this. Swap the numbers for Shortcut
          inputs (e.g. Ask for Input → sleep minutes).
        </p>
      </div>

      {/* --- test connection --- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={testConnection}
          disabled={testing}
          className="df-press df-btn-primary px-4 h-9 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-60"
        >
          {testing ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          {testing ? "Testing…" : "Test connection"}
        </button>
        {testResult && (
          <p
            className="flex-1 min-w-[200px] text-[11.5px] leading-relaxed"
            style={{
              color: testResult.ok ? "var(--df-accent-text)" : "var(--df-destructive-text)",
            }}
            role="status"
          >
            {testResult.message}
          </p>
        )}
      </div>
      {!testResult && (
        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--df-text-muted)" }}>
          Sends one dummy 250 ml hydration tap with your live session and asserts a 200 —
          expect it to appear in today&rsquo;s water log.
        </p>
      )}
    </section>
  );
}
