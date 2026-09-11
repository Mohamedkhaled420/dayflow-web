"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CalendarDays,
  CalendarRange,
  Clock3,
  Flame,
  NotebookPen,
  Settings as SettingsIcon,
} from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";
import { LogoLoop } from "@/components/brand/LogoLoop";
import { SplashScreen } from "@/components/brand/SplashScreen";
import { bootDayflowSync, useDayflowStore } from "@/store/useDayflowStore";
import {
  MorningTriadGate,
  readMorningTriad,
} from "@/components/dayflow/MorningTriadGate";
import { LiquidGlass, LiquidGlassFilters } from "@/components/ui/LiquidGlass";
import { hapticSelect } from "@/lib/haptics";
import { springSoft } from "@/lib/motion";

// Phase 4 bundle diet: every tab view is code-split and streams in
// behind the boot skeleton, so none of the view bundles ride the
// initial JS payload. The dock shows the same BootSkeleton the
// rehydration gate already paints, so the swap is invisible.
const TimelineView = dynamic(
  () => import("./TimelineView").then((m) => m.TimelineView),
  { ssr: false, loading: ViewSkeleton }
);
const DailyView = dynamic(() => import("./DailyView").then((m) => m.DailyView), {
  ssr: false,
  loading: ViewSkeleton,
});
const WeeklyView = dynamic(() => import("./WeeklyView").then((m) => m.WeeklyView), {
  ssr: false,
  loading: ViewSkeleton,
});
const HabitsView = dynamic(() => import("./HabitsView").then((m) => m.HabitsView), {
  ssr: false,
  loading: ViewSkeleton,
});
const ChatView = dynamic(() => import("./ChatView").then((m) => m.ChatView), {
  ssr: false,
  loading: ViewSkeleton,
});
const SettingsView = dynamic(() => import("./SettingsView").then((m) => m.SettingsView), {
  ssr: false,
  loading: ViewSkeleton,
});

/** Brand loader shown while a lazy view chunk streams in (Phase 6.5:
 *  replaces the generic skeleton — md loop, centered, no wall). */
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

export type TabId = "timeline" | "daily" | "weekly" | "habits" | "chat" | "settings";

/** The Focus surface is the circadian Timeline (PRD §4.2 / §4.9). */
const FOCUS_TAB: TabId = "timeline";

const TABS: {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "daily", label: "Daily", icon: CalendarDays },
  { id: "weekly", label: "Weekly", icon: CalendarRange },
  { id: "habits", label: "Habits", icon: Flame },
  { id: "chat", label: "Journal", icon: NotebookPen },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell() {
  const [tab, setTab] = useState<TabId>("timeline");
  const [ready, setReady] = useState(false);
  // Morning Triad: the gate is DERIVED (profile + Focus tab + the
  // localStorage day-record), never set from an effect. Dismissal
  // and unlock are user events; triadNonce forces the re-render
  // that re-reads the day-record.
  const [triadDismissed, setTriadDismissed] = useState(false);
  const [triadNonce, setTriadNonce] = useState(0);
  const reducedMotion = useReducedMotion();

  const profileRow = useDayflowStore((s) => s.profile);
  const isSyncing = useDayflowStore((s) => s.isSyncing);

  // Morning Triad gate conditions (PRD §4.9): only when the
  // occupational status is NOT 'employed_structured' and the
  // morning anchor is enforced on the profile.
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

  // Rehydrate the Delta Sync store's IndexedDB snapshot after
  // mount (the first render uses empty state so server HTML and
  // the hydration pass match exactly), then pull server deltas in
  // the background — never blocking first paint.
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

  // The gate shows whenever a gated user is ON the Focus tab without
  // today's anchor record — boot included, no effect needed.
  const triadOpen =
    triadRequired &&
    ready &&
    tab === FOCUS_TAB &&
    !triadDismissed &&
    !readMorningTriad();
  void triadNonce;

  const select = useCallback(
    (t: TabId) => {
      hapticSelect();
      if (t === FOCUS_TAB && triadRequired && !readMorningTriad()) {
        // Gate the Focus tab behind the morning check-in (T1d):
        // switch onto Focus, where the derived gate takes over.
        setTab(t);
        return;
      }
      setTab(t);
    },
    [triadRequired]
  );

  const content = useMemo(() => {
    if (!ready) return <SplashScreen />;
    switch (tab) {
      case "timeline":
        return <TimelineView />;
      case "daily":
        return <DailyView />;
      case "weekly":
        return <WeeklyView />;
      case "habits":
        return <HabitsView />;
      case "chat":
        return <ChatView />;
      case "settings":
        return <SettingsView onNavigate={select} />;
    }
  }, [tab, ready, select]);

  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="df-window w-full min-h-[100dvh] overflow-x-hidden sm:p-[15px]">
      {/* T1 material filters — mounted once, referenced by the two
          Liquid Glass surfaces (mobile dock + Habits Log CTA). */}
      <LiquidGlassFilters />

      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 pt-[max(0.65rem,env(safe-area-inset-top))] pb-2.5 df-mobile-header">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-semibold leading-none" style={{ color: "var(--df-text-primary)" }}>Dayflow</p>
            {/* Phase 6.5: sync indicator beside the title (never in the dock) */}
            {isSyncing && <LogoLoop size="sm" />}
          </div>
          <p className="mt-1 text-[10px] leading-none" style={{ color: "var(--df-text-muted)" }}>{activeTab.label}</p>
        </div>
        <button onClick={() => select("settings")} aria-label="Settings" aria-current={tab === "settings"} className="df-press grid size-9 place-items-center rounded-full border border-white/50 bg-white/45" style={{ color: "var(--df-text-secondary)" }}>
          <SettingsIcon className="size-[17px]" strokeWidth={1.8} />
        </button>
      </header>

      <div className="flex items-stretch max-w-[1440px] mx-auto pb-16 lg:pb-0">
        {/* left gutter: logo + vertical sidebar */}
        <aside className="hidden lg:flex w-[80px] shrink-0 flex-col items-center justify-between py-2">
          <div className="df-rise" style={{ animationDelay: "0ms" }}>
            <LogoMark size={40} />
          </div>
          <nav
            aria-label="Primary"
            className="df-rise flex flex-col items-center gap-[5px]"
            style={{ animationDelay: "150ms" }}
          >
            {TABS.map((t) => (
              <SidebarButton
                key={t.id}
                label={t.label}
                active={tab === t.id}
                onClick={() => select(t.id)}
                icon={<t.icon className="h-[17px] w-[17px]" strokeWidth={1.8} />}
              />
            ))}
          </nav>
          <div className="h-6" />
        </aside>

        {/* main panel */}
        <div
          className="flex-1 min-w-0 df-rise"
          style={{ animationDelay: "100ms" }}
        >
          <div className="df-panel h-full min-h-[calc(100dvh-54px)] lg:min-h-[calc(100vh-30px)] overflow-hidden rounded-none sm:rounded-lg pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-0">
            {/* popLayout (not "wait"): lazy view chunks can resolve while
                their tab child is exiting — mode="wait" deadlocks in that
                window (exit never completes, the next tab never mounts).
                popLayout lets the entering view take the layout flow
                immediately while the old one pops out and fades. */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={tab}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                transition={reducedMotion ? { duration: 0.15 } : springSoft}
                className="h-full min-w-0 w-full max-w-full overflow-hidden"
              >
                {content}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile dock — Liquid Glass T1 surface #1 (PRD §6.2, max 2). */}
      <LiquidGlass
        filterCss="url(#lg-dock) blur(18px) saturate(1.7)"
        className="df-mobile-dock lg:hidden fixed inset-x-3 bottom-2 z-50"
        style={{
          background: "var(--df-mobile-nav-fill)",
          border: "0.5px solid var(--df-chip-border)",
        }}
      >
        <nav
          aria-label="Mobile primary"
          className="flex items-center justify-around px-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5"
        >
          {TABS.filter((item) => item.id !== "settings").map((t) => (
            <DockItem
              key={t.id}
              label={t.label}
              active={tab === t.id}
              onClick={() => select(t.id)}
              icon={<t.icon className="size-[17px]" strokeWidth={1.8} />}
            />
          ))}
        </nav>
      </LiquidGlass>

      {/* Morning Triad gate (T1d) — gates the Focus tab. */}
      <MorningTriadGate
        open={triadOpen}
        onUnlocked={() => {
          // Day-record written inside the gate — re-read via nonce.
          setTriadDismissed(false);
          setTriadNonce((n) => n + 1);
        }}
        onClose={() => {
          // Staying out of Focus: land on the Daily tab instead.
          setTriadDismissed(true);
          setTriadNonce((n) => n + 1);
          setTab((current) => (current === FOCUS_TAB ? "daily" : current));
        }}
      />
    </div>
  );
}

function DockItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active}
      className="df-press flex-1 min-w-0 h-[52px] rounded-[16px] flex flex-col items-center justify-center gap-[3px]"
      style={{ color: active ? "var(--df-accent-text)" : "var(--df-text-muted)" }}
    >
      <motion.span
        className="grid place-items-center"
        animate={
          reducedMotion ? undefined : { scale: active ? 1.08 : 1, y: active ? -0.5 : 0 }
        }
        transition={springSoft}
      >
        {icon}
      </motion.span>
      <span
        className="text-[9.5px] font-semibold leading-none"
        style={{ opacity: active ? 1 : 0.8 }}
      >
        {label}
      </span>
    </button>
  );
}

function SidebarButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active}
      className="df-press group w-[61px] rounded-[14px] py-2 flex flex-col items-center gap-[3px]"
    >
      <span className="relative w-[37px] h-[37px] grid place-items-center">
        {active && (
          <motion.span
            className="absolute inset-0 rounded-[10px]"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            transition={springSoft}
            style={{
              background: "var(--df-sidebar-selected-fill)",
              border: "0.58px solid var(--df-sidebar-selected-border)",
              boxShadow:
                "inset 0 0 0 2px var(--df-sidebar-selected-glow), 0 1px 2px var(--df-panel-shadow)",
            }}
          />
        )}
        <span
          className="relative z-10"
          style={{
            color: active
              ? "var(--df-sidebar-label-active)"
              : "var(--df-sidebar-label)",
          }}
        >
          {icon}
        </span>
      </span>
      <span
        className="text-[11.5px] font-medium leading-none"
        style={{
          color: active
            ? "var(--df-sidebar-label-active)"
            : "var(--df-sidebar-label)",
        }}
      >
        {label}
      </span>
    </button>
  );
}
