"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  CalendarRange,
  Clock3,
  MessageCircle,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { LogoBadge } from "@/components/dayflow/LogoBadge";
import { TimelineView } from "@/components/dayflow/TimelineView";
import { DailyView } from "@/components/dayflow/DailyView";
import { WeeklyView } from "@/components/dayflow/WeeklyView";
import { ChatView } from "@/components/dayflow/ChatView";
import { AgentsView } from "@/components/dayflow/AgentsView";
import { SettingsView } from "@/components/dayflow/SettingsView";

export type TabId =
  | "timeline"
  | "daily"
  | "weekly"
  | "chat"
  | "agents"
  | "settings";

const TABS: {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "daily", label: "Daily", icon: CalendarDays },
  { id: "weekly", label: "Weekly", icon: CalendarRange },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "agents", label: "Agents", icon: Sparkles },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell() {
  const [tab, setTab] = useState<TabId>("timeline");

  const select = useCallback((t: TabId) => setTab(t), []);

  const content = useMemo(() => {
    switch (tab) {
      case "timeline":
        return <TimelineView />;
      case "daily":
        return <DailyView />;
      case "weekly":
        return <WeeklyView />;
      case "chat":
        return <ChatView />;
      case "agents":
        return <AgentsView />;
      case "settings":
        return <SettingsView onNavigate={select} />;
    }
  }, [tab, select]);

  return (
    <div className="df-window w-full min-h-screen sm:p-[15px]">
      {/* mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center gap-1 px-3 py-2 backdrop-blur-xl border-b border-white/20 dark:border-white/10">
        <LogoBadge size={30} className="mr-1" />
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => select(t.id)}
            aria-label={t.label}
            aria-current={tab === t.id}
            className={`df-press flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] font-medium ${
              tab === t.id
                ? "text-[var(--df-text-primary)] bg-white/60 dark:bg-white/10"
                : "text-[var(--df-text-muted)]"
            }`}
          >
            <t.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {t.label}
          </button>
        ))}
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
                icon={
                  <t.icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
                }
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
          <div className="df-panel h-full min-h-[calc(100vh-30px)] lg:min-h-[calc(100vh-30px)] overflow-hidden">
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
