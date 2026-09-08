"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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

export function AppShell() {
  const [tab, setTab] = useState<TabId>("timeline");
  const [ready, setReady] = useState(false);

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

  const select = useCallback((t: TabId) => setTab(t), []);

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

  return (
    <div className="df-window w-full min-h-[100dvh] overflow-x-hidden sm:p-[15px]">
      {/* mobile header */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 df-mobile-header">
        <div className="flex items-center gap-2.5">
          <LogoBadge size={30} />
          <div>
            <p className="text-[13px] font-semibold leading-none" style={{ color: "var(--df-text-primary)" }}>Dayflow</p>
            <p className="mt-1 text-[10px] leading-none" style={{ color: "var(--df-text-muted)" }}>Plan your day</p>
          </div>
        </div>
        <button
          onClick={() => select("settings")}
          aria-label="Settings"
          aria-current={tab === "settings"}
          className="df-press grid size-9 place-items-center rounded-full border border-white/50 bg-white/45"
          style={{ color: "var(--df-text-secondary)" }}
        >
          <SettingsIcon className="size-[17px]" strokeWidth={1.8} />
        </button>
      </header>

      <div className="flex items-stretch max-w-[1440px] mx-auto pb-16 lg:pb-0">
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
          <div className="df-panel h-full min-h-[calc(100dvh-54px)] lg:min-h-[calc(100vh-30px)] overflow-hidden rounded-none sm:rounded-lg">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="h-full"
              >
                {content}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <nav aria-label="Mobile primary" className="lg:hidden fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-white/60 bg-[color:var(--df-mobile-nav-fill)] px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl">
        {TABS.filter((item) => item.id !== "settings").map((t) => (
          <button
            key={t.id}
            onClick={() => select(t.id)}
            aria-label={t.label}
            aria-current={tab === t.id}
            className={`df-press flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] font-medium ${tab === t.id ? "text-[var(--df-text-primary)]" : "text-[var(--df-text-muted)]"}`}
          >
            <span className={`grid size-7 place-items-center rounded-lg ${tab === t.id ? "bg-[var(--df-control-fill)]" : ""}`}>
              <t.icon className="size-[17px]" strokeWidth={1.8} />
            </span>
            {t.label}
          </button>
        ))}
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
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active}
      className="df-press group w-[61px] rounded-[14px] py-2 flex flex-col items-center gap-[3px]"
    >
      <span className="relative w-[37px] h-[37px] grid place-items-center">
        {active && (
          <span
            className="absolute inset-0 rounded-[10px]"
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
