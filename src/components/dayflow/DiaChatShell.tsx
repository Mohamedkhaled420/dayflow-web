"use client";

// ============================================================
// Dayflow AI — Dia chat shell (Phase 8, decision 3 revision)
// ------------------------------------------------------------
// The browser chrome is NOT marketing decoration: it is the
// functional shell of the Journal/Coach surface — "a browser
// into your own life".
//   traffic lights  → live sync status (green / amber / red),
//                     wired by the parent to isSyncing +
//                     navigator.onLine + syncError.
//   back / forward  → walk the journal entry history
//                     (hidden below 400px — collapsed chrome).
//   refresh         → re-run the last coach answer.
//   omnibar         → mode + privacy: 🔒 coach://journal|workout
//                     (click to switch coach context).
// Styling is Notion-quiet: thin hairline borders, flat fills,
// 28px compact controls, no glows. Every color resolves from
// src/styles/theme.css tokens.
// The landing page reuses <DiaChrome static /> as a REAL frame
// of this shell (dogfooding marketing — no fake mockups).
// ============================================================

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Lock, RotateCw } from "lucide-react";

export type DiaSyncState = "ok" | "pending" | "error";
export type DiaCoachMode = "journal" | "workout";

const SYNC_META: Record<DiaSyncState, { dot: string; label: string }> = {
  ok: { dot: "var(--df-sync-ok)", label: "Synced" },
  pending: { dot: "var(--df-sync-pending)", label: "Syncing…" },
  error: { dot: "var(--df-sync-error)", label: "Offline — changes queue locally" },
};

const MODE_TITLE: Record<DiaCoachMode, string> = {
  journal: "Journal coach — CBT & Stoic framing, reads your last 3 entries",
  workout: "Training coach — grounded in your logged sessions",
};

function ChromeIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="df-press grid h-7 w-7 shrink-0 place-items-center rounded-md disabled:opacity-35"
      style={{ color: "var(--df-text-secondary)" }}
    >
      {children}
    </button>
  );
}

export interface DiaChromeProps {
  /** Aggregate sync state driving the traffic lights. */
  sync: DiaSyncState;
  /** Override the auto status label (static landing frames). */
  syncLabel?: string;
  /** Coach context shown in the omnibar. */
  mode: DiaCoachMode;
  /** Omnibar tap → switch coach context. Omit for static frames. */
  onModeChange?: () => void;
  onBack?: () => void;
  backDisabled?: boolean;
  onForward?: () => void;
  forwardDisabled?: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  /** Where you are in the journal history (e.g. "3 / 12"). */
  historyPosition?: string;
}

/**
 * The browser chrome bar itself. Rendered interactive inside
 * ChatView and fully static (spans, no handlers) when no
 * callbacks are passed — the landing frame does exactly that.
 */
export function DiaChrome({
  sync,
  syncLabel,
  mode,
  onModeChange,
  onBack,
  backDisabled = true,
  onForward,
  forwardDisabled = true,
  onRefresh,
  refreshDisabled = true,
  historyPosition,
}: DiaChromeProps) {
  const meta = SYNC_META[sync];
  const statusLabel = syncLabel ?? meta.label;

  const omnibarLabel = onModeChange
    ? `Coach context: ${mode}. Private to your account. Activate to switch to ${
        mode === "journal" ? "training" : "journal"
      } coaching.`
    : `Coach context: ${mode}. Private to your account.`;

  return (
    <header
      className="flex h-10 shrink-0 items-center gap-2 px-3"
      style={{
        background: "var(--df-chrome-fill)",
        borderBottom: "0.5px solid var(--df-chrome-border)",
      }}
    >
      {/* traffic lights = live sync status */}
      <div
        className="flex shrink-0 items-center gap-[6px]"
        role="status"
        aria-live="polite"
        aria-label={`Sync status: ${statusLabel}`}
        title={`Sync status: ${statusLabel}`}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{ background: meta.dot }}
          />
        ))}
        <span
          className="ml-1 hidden text-[10.5px] font-medium sm:inline"
          style={{ color: "var(--df-text-muted)" }}
        >
          {statusLabel}
        </span>
      </div>

      {/* navigation — collapses out below 400px (375px budget) */}
      <div className="flex shrink-0 items-center gap-0.5 max-[400px]:hidden">
        <ChromeIconButton
          label="Older journal entry"
          onClick={onBack}
          disabled={backDisabled || !onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        </ChromeIconButton>
        <ChromeIconButton
          label="Newer journal entry"
          onClick={onForward}
          disabled={forwardDisabled || !onForward}
        >
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </ChromeIconButton>
        {historyPosition && (
          <span
            className="ml-1 hidden text-[10px] font-semibold tabular-nums md:inline"
            style={{ color: "var(--df-text-muted)" }}
            aria-hidden="true"
          >
            {historyPosition}
          </span>
        )}
      </div>

      <ChromeIconButton
        label="Re-run the last coach answer"
        onClick={onRefresh}
        disabled={refreshDisabled || !onRefresh}
      >
        <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
      </ChromeIconButton>

      {/* omnibar = mode + privacy */}
      {onModeChange ? (
        <button
          type="button"
          onClick={onModeChange}
          aria-label={omnibarLabel}
          title={`${omnibarLabel} — ${MODE_TITLE[mode]}`}
          className="df-press flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 text-left text-[11px] font-medium"
          style={{
            background: "var(--df-omnibar-fill)",
            border: "0.5px solid var(--df-omnibar-border)",
            color: "var(--df-text-secondary)",
          }}
        >
          <Lock
            className="h-3 w-3 shrink-0"
            strokeWidth={2}
            style={{ color: "var(--df-sync-ok)" }}
            aria-hidden="true"
          />
          <span className="truncate">coach://{mode}</span>
          <span
            className="ml-auto hidden shrink-0 text-[9.5px] font-semibold uppercase tracking-wide sm:inline"
            style={{ color: "var(--df-text-muted)" }}
          >
            private
          </span>
        </button>
      ) : (
        <div
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium"
          style={{
            background: "var(--df-omnibar-fill)",
            border: "0.5px solid var(--df-omnibar-border)",
            color: "var(--df-text-secondary)",
          }}
          title={`${omnibarLabel} — ${MODE_TITLE[mode]}`}
        >
          <Lock
            className="h-3 w-3 shrink-0"
            strokeWidth={2}
            style={{ color: "var(--df-sync-ok)" }}
            aria-hidden="true"
          />
          <span className="truncate">coach://{mode}</span>
          <span
            className="ml-auto hidden shrink-0 text-[9.5px] font-semibold uppercase tracking-wide sm:inline"
            style={{ color: "var(--df-text-muted)" }}
          >
            private
          </span>
        </div>
      )}
    </header>
  );
}

export interface DiaChatShellProps extends DiaChromeProps {
  /** The scrollable message flow (role="log"). */
  children: ReactNode;
  /** Composer block pinned below the flow. */
  footer: ReactNode;
}

/**
 * Full chat surface: chrome on top, message flow filling the
 * middle (with the STATIC aurora tint behind it — never
 * animated, authenticated-app perf budget), composer below.
 */
export function DiaChatShell({ children, footer, ...chrome }: DiaChatShellProps) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <DiaChrome {...chrome} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* static aurora — decorative, pointer-transparent */}
        <div
          className="df-chat-aurora pointer-events-none absolute inset-x-0 bottom-0 h-44"
          aria-hidden="true"
        />
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
      <div className="relative shrink-0">{footer}</div>
    </div>
  );
}
