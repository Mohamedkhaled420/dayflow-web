"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import { LogoMark } from "@/components/brand/LogoMark";
import { LogoLoop } from "@/components/brand/LogoLoop";
import { SplashScreen } from "@/components/brand/SplashScreen";
import { bootDayflowSync, useDayflowStore } from "@/store/useDayflowStore";
import {
  MorningTriadGate,
  readMorningTriad,
} from "@/components/dayflow/MorningTriadGate";
import { hapticSelect, haptic } from "@/lib/haptics";
import { useDockHidden, watchDockKeyboard } from "@/hooks/use-dock-visibility";
import { useKeyboardTracking } from "@/components/ui/Sheet";
import { DiaCompanion } from "@/components/companion/DiaCompanion";
import { TAB_ACCENTS } from "@/styles/palette";

// Phase 13 bundle diet: every tab view is code-split and streams in
// behind the boot skeleton. The four pill panes stay MOUNTED once
// loaded (keep-alive, like the reference iframe panes) so tab
// switches are instant crossfades with preserved scroll + state.
const TodayView = dynamic(() => import("./TodayView").then((m) => m.TodayView), {
  ssr: false,
  loading: ViewSkeleton,
});
const NutritionView = dynamic(
  () => import("./NutritionView").then((m) => m.NutritionView),
  { ssr: false, loading: ViewSkeleton }
);
const TrainingView = dynamic(
  () => import("./workout/TrainingView").then((m) => m.TrainingView),
  { ssr: false, loading: ViewSkeleton }
);
const HabitsView = dynamic(() => import("./HabitsView").then((m) => m.HabitsView), {
  ssr: false,
  loading: ViewSkeleton,
});
const ChatView = dynamic(() => import("./ChatView").then((m) => m.ChatView), {
  ssr: false,
  loading: ViewSkeleton,
});
const WeeklyView = dynamic(() => import("./WeeklyView").then((m) => m.WeeklyView), {
  ssr: false,
  loading: ViewSkeleton,
});
const SettingsView = dynamic(
  () => import("./SettingsView").then((m) => m.SettingsView),
  { ssr: false, loading: ViewSkeleton }
);

/** Brand loader shown while a lazy view chunk streams in. */
function ViewSkeleton() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-8"
      aria-label="Loading view"
      role="status"
    >
      <LogoLoop size="md" label="Loading view" />
      <p className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
        Loading…
      </p>
    </div>
  );
}

export type TabId =
  | "today"
  | "nutrition"
  | "training"
  | "habits"
  | "journal"
  | "weekly"
  | "settings";

/** The Focus surface is the Today pane (PRD §4.2 / §4.9). */
const FOCUS_TAB: TabId = "today";

/** The four pill tabs — order IS the pill column order. */
const PILL_TABS: { id: Extract<TabId, "today" | "nutrition" | "training" | "habits">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "nutrition", label: "Nutrition" },
  { id: "training", label: "Training" },
  { id: "habits", label: "Habits" },
];

const TAB_ICON: Record<string, ReactNode> = {
  today: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  nutrition: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 5-3.5 8h3.5" />
    </svg>
  ),
  training: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
    </svg>
  ),
  habits: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </svg>
  ),
};

/** Cross-pane log intents — the plus FAB / quick-menu fire these;
 *  the owning pane opens its sheet when the nonce changes. */
export type LogAction = "block" | "meal" | "workout";

export function AppShell() {
  const [tab, setTab] = useState<TabId>(FOCUS_TAB);
  const [ready, setReady] = useState(false);
  // Morning Triad: the gate is DERIVED (profile + Focus tab + the
  // localStorage day-record), never set from an effect.
  const [triadDismissed, setTriadDismissed] = useState(false);
  const [triadNonce, setTriadNonce] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<{
    action: LogAction;
    nonce: number;
  } | null>(null);
  const longPress = useRef(false);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();
  void reducedMotion;

  const profileRow = useDayflowStore((s) => s.profile);
  const isSyncing = useDayflowStore((s) => s.isSyncing);
  const workoutLogs = useDayflowStore((s) => s.workoutLogs);

  // Dock avoidance (S2, Rule B): ref-counted hide requests — the
  // keyboard watcher is global; log sheets + the fullscreen journal
  // editor register their own requests. The pill slides away while
  // ANY request is active (the reference body.full behavior).
  const dockHidden = useDockHidden();
  useEffect(() => watchDockKeyboard(), []);
  useKeyboardTracking();

  // Morning Triad gate conditions (PRD §4.9).
  const triadRequired = useMemo(() => {
    const occ =
      profileRow?.occupational_context &&
      typeof profileRow.occupational_context === "object" &&
      !Array.isArray(profileRow.occupational_context)
        ? (profileRow.occupational_context as Record<string, unknown>)
        : {};
    const status = typeof occ.status === "string" ? occ.status : "";
    const enforce = occ.enforceMorningAnchor === true;
    return status !== "employed_structured" && enforce;
  }, [profileRow]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(useDayflowStore.persist.rehydrate())
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    void bootDayflowSync();
    return () => {
      cancelled = true;
    };
  }, []);

  const triadOpen =
    triadRequired &&
    ready &&
    tab === FOCUS_TAB &&
    !triadDismissed &&
    !readMorningTriad();
  void triadNonce;

  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  // Training pill dot: a workout is due today and none is logged yet.
  const trainingDue = useMemo(
    () => !workoutLogs.some((w) => (w.logged_at ?? "").slice(0, 10) === todayKey),
    [workoutLogs, todayKey]
  );

  const go = useCallback(
    (t: TabId) => {
      hapticSelect();
      setTab(t);
      setMenuOpen(false);
    },
    []
  );

  const fire = useCallback((action: LogAction) => {
    setPending({ action, nonce: Date.now() });
  }, []);

  /** Reference plus behavior: contextual quick-action on the active
   *  pane (meal sheet on Nutrition, generator on Training), the
   *  quick-log menu everywhere else. */
  const onPlus = useCallback(() => {
    if (longPress.current) return;
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    haptic();
    if (tab === "nutrition") {
      fire("meal");
    } else if (tab === "training") {
      fire("workout");
    } else {
      setMenuOpen(true);
    }
  }, [tab, menuOpen, fire]);

  const onPlusPointerDown = useCallback(() => {
    longPress.current = false;
    lpTimer.current = setTimeout(() => {
      longPress.current = true;
      setMenuOpen(true);
      haptic();
    }, 480);
  }, []);
  const cancelLongPress = useCallback(() => {
    if (lpTimer.current) clearTimeout(lpTimer.current);
  }, []);

  // Close the menu on any outside pointer.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest?.("[data-dfx-menu],[data-dfx-fab]")) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const menuAction = useCallback(
    (action: LogAction, destTab: TabId) => {
      setMenuOpen(false);
      // Reference cadence: land on the pane first, then open the
      // sheet ~420ms later so the crossfade reads as intentional.
      setTab(destTab);
      setTimeout(() => fire(action), 420);
    },
    [fire]
  );

  // Keyboard: Escape closes the menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const accent =
    tab === "journal"
      ? TAB_ACCENTS.today
      : tab === "weekly"
        ? TAB_ACCENTS.habits
        : tab === "settings"
          ? TAB_ACCENTS.today
          : TAB_ACCENTS[tab];
  const pillIndex = PILL_TABS.findIndex((t) => t.id === tab);

  const overflowPane = useMemo(() => {
    switch (tab) {
      case "journal":
        return <ChatView />;
      case "weekly":
        return <WeeklyView />;
      case "settings":
        return <SettingsView onNavigate={go} />;
      default:
        return null;
    }
  }, [tab, go]);

  const blockNonce = pending?.action === "block" ? pending.nonce : 0;
  const mealNonce = pending?.action === "meal" ? pending.nonce : 0;
  const workoutNonce = pending?.action === "workout" ? pending.nonce : 0;

  return (
    <div
      className="df-app dfx-root w-full"
      style={{ ["--dfx-accent" as string]: accent }}
    >
      {/* Shell header — brand + the overflow destinations (Journal,
          Weekly, Settings) that live outside the four pill tabs. */}
      <header className="dfx-header">
        <div className="flex min-w-0 items-center gap-2.5">
          <LogoMark size={26} />
          <div className="flex items-center gap-1.5">
            <p
              className="text-[13px] font-semibold leading-none"
              style={{ color: "var(--df-text-primary)" }}
            >
              Dayflow
            </p>
            {isSyncing && <LogoLoop size="sm" />}
          </div>
        </div>
        <div className="dfx-header-actions">
          <button
            className={`dfx-hbtn${tab === "journal" ? " on" : ""}`}
            onClick={() => go("journal")}
            aria-label="Journal"
            aria-current={tab === "journal" ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            className={`dfx-hbtn${tab === "weekly" ? " on" : ""}`}
            onClick={() => go("weekly")}
            aria-label="Weekly review"
            aria-current={tab === "weekly" ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="16" height="15" rx="3" />
              <path d="M4 10h16M9 3v4M15 3v4" />
            </svg>
          </button>
          <button
            className={`dfx-hbtn${tab === "settings" ? " on" : ""}`}
            onClick={() => go("settings")}
            aria-label="Settings"
            aria-current={tab === "settings" ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>
      </header>

      {/* The stages — four keep-alive panes crossfading between
          tabs, plus the on-demand overflow panes. */}
      {!ready ? (
        <SplashScreen />
      ) : (
        <div className="dfx-stages">
          <div className={`dfx-pane${tab === "today" ? " on" : ""}`} aria-hidden={tab !== "today"}>
            <TodayView blockNonce={blockNonce} />
          </div>
          <div className={`dfx-pane${tab === "nutrition" ? " on" : ""}`} aria-hidden={tab !== "nutrition"}>
            <NutritionView mealNonce={mealNonce} />
          </div>
          <div className={`dfx-pane${tab === "training" ? " on" : ""}`} aria-hidden={tab !== "training"}>
            <TrainingView generateNonce={workoutNonce} />
          </div>
          <div className={`dfx-pane${tab === "habits" ? " on" : ""}`} aria-hidden={tab !== "habits"}>
            <HabitsView />
          </div>
          {overflowPane && (
            <div className="dfx-pane on">{overflowPane}</div>
          )}
        </div>
      )}

      {/* The glass pill nav + plus FAB (reference #nav). Slides away
          while any dock-hide request is active (keyboard / sheets). */}
      <nav className={`dfx-nav${dockHidden ? " dfx-hidden" : ""}`} aria-label="Main">
        <div
          className="dfx-pill"
          style={{ ["--dfx-i" as string]: pillIndex < 0 ? 0 : pillIndex }}
          role="tablist"
        >
          <i className="dfx-hl" aria-hidden="true" style={{ opacity: pillIndex < 0 ? 0 : 1 }} />
          {PILL_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              className={`dfx-tab${tab === t.id ? " on" : ""}`}
              onClick={() => go(t.id)}
              aria-label={t.label}
              aria-selected={tab === t.id}
            >
              {TAB_ICON[t.id]}
              {t.label}
              {t.id === "training" && trainingDue && <b className="dfx-dot" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <button
          className={`dfx-fab${menuOpen ? " x" : ""}`}
          onPointerDown={onPlusPointerDown}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onClick={onPlus}
          aria-label="Log something"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          data-dfx-fab
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </nav>

      {/* The quick-log menu (reference #menu) — floats above the
          FAB, tinted per action. */}
      <div className={`dfx-menu${menuOpen ? " on" : ""}`} role="menu" aria-label="Quick log" data-dfx-menu>
        <button
          role="menuitem"
          style={{ ["--dfx-k" as string]: TAB_ACCENTS.training }}
          onClick={() => menuAction("workout", "training")}
        >
          <i>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
            </svg>
          </i>
          Log a workout
        </button>
        <button
          role="menuitem"
          style={{ ["--dfx-k" as string]: TAB_ACCENTS.nutrition }}
          onClick={() => menuAction("meal", "nutrition")}
        >
          <i>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 5-3.5 8h3.5" />
            </svg>
          </i>
          Log a meal
        </button>
        <button
          role="menuitem"
          style={{ ["--dfx-k" as string]: TAB_ACCENTS.today }}
          onClick={() => menuAction("block", "today")}
        >
          <i>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="16" height="15" rx="3" />
              <path d="M4 10h16M9 3v4M15 3v4" />
            </svg>
          </i>
          Log a block
        </button>
      </div>

      {/* Dia — the living 3D companion (lazy three.js chunk). */}
      <DiaCompanion />

      {/* Morning Triad gate (T1d) — gates the Focus tab. */}
      <MorningTriadGate
        open={triadOpen}
        onUnlocked={() => {
          setTriadDismissed(false);
          setTriadNonce((n) => n + 1);
        }}
        onClose={() => {
          setTriadDismissed(true);
          setTriadNonce((n) => n + 1);
          setTab((current) => (current === FOCUS_TAB ? "habits" : current));
        }}
      />
    </div>
  );
}
