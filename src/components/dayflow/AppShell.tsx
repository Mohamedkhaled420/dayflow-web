"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  CalendarRange,
  Clock3,
  Flame,
  MessageCircle,
  Settings as SettingsIcon,
} from "lucide-react";
import { LogoBadge } from "@/components/dayflow/LogoBadge";
import { TimelineView } from "@/components/dayflow/TimelineView";
import { DailyView } from "@/components/dayflow/DailyView";
import { WeeklyView } from "@/components/dayflow/WeeklyView";
import { HabitsView } from "@/components/dayflow/HabitsView";
import { ChatView } from "@/components/dayflow/ChatView";
import { SettingsView } from "@/components/dayflow/SettingsView";
import { rehydrateDayflow } from "@/lib/store";
import { hapticSelect } from "@/lib/haptics";
import { springSoft } from "@/lib/motion";

export type TabId = "timeline" | "daily" | "weekly" | "habits" | "chat" | "settings";

const TABS: {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "daily", label: "Daily", icon: CalendarDays },
  { id: "weekly", label: "Weekly", icon: CalendarRange },
  { id: "habits", label: "Habits", icon: Flame },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

/** Apple house-style spring: critically damped, ~0.3s response. */

export function AppShell() {
  const [tab, setTab] = useState<TabId>("timeline");
  const [ready, setReady] = useState(false);
  const reducedMotion = useReducedMotion();

  // Rehydrate the persisted store after mount: the first render uses the
  // deterministic seed so server HTML and the hydration pass match exactly.
  useEffect(() => {
    let cancelled = false;
    rehydrateDayflow().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const select = useCallback((t: TabId) => {
    hapticSelect();
    setTab(t);
  }, []);

  const content = useMemo(() => {
    if (!ready) return <BootSkeleton />;
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
    <div className="df-window w-full min-h-screen sm:p-[15px]">
      {/* mobile top bar — slim status chrome; navigation moved to the dock */}
      <div className="lg:hidden sticky top-0 z-40 h-[52px] px-4 flex items-center gap-2 df-material">
        <LogoBadge size={28} />
        <span
          className="text-[13.5px] font-bold tracking-[-0.01em]"
          style={{ color: "var(--df-text-primary)" }}
        >
          {activeTab.label}
        </span>
      </div>

      <div className="flex items-stretch max-w-[1440px] mx-auto">
        {/* left gutter: logo + vertical sidebar */}
        <aside className="hidden lg:flex w-[80px] shrink-0 flex-col items-center justify-between py-2">
          <div className="df-rise" style={{ animationDelay: "0ms" }}>
            <LogoBadge size={40} />
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
          <div
            className="df-panel h-full overflow-hidden
              min-h-[calc(100dvh-140px-env(safe-area-inset-bottom))]
              sm:min-h-[calc(100dvh-170px-env(safe-area-inset-bottom))]
              lg:min-h-[calc(100vh-30px)]
              pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-0"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                transition={reducedMotion ? { duration: 0.15 } : springSoft}
                className="h-full"
              >
                {content}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* mobile floating tab dock — translucent material, content scrolls under,
          respects the home-indicator safe area */}
      <nav
        aria-label="Primary"
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))]"
      >
        <div className="df-dock mx-auto w-full max-w-[430px] rounded-[22px] flex items-stretch p-1.5">
          {TABS.map((t) => (
            <DockItem
              key={t.id}
              label={t.label}
              active={tab === t.id}
              onClick={() => select(t.id)}
              icon={<t.icon className="h-[19px] w-[19px]" strokeWidth={1.9} />}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Soft loading state shown while the local data store rehydrates. */
function BootSkeleton() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8" aria-label="Loading your data">
      <div
        className="w-10 h-10 rounded-[10px] animate-pulse"
        style={{ background: "var(--df-control-fill)" }}
      />
      <div className="w-48 h-3 rounded-full animate-pulse" style={{ background: "var(--df-chip-fill)" }} />
      <div className="w-64 h-3 rounded-full animate-pulse" style={{ background: "var(--df-chip-fill)", animationDelay: "120ms" }} />
      <p className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
        Loading your local data…
      </p>
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
