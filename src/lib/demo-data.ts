// ============================================================
// Dayflow demo dataset
// The native Mac app captures your screen to build the timeline.
// Screen capture cannot run in a browser, so the web app ships with a
// realistic sample day so every view (timeline, daily, weekly, chat)
// works end-to-end. Replace with real data by wiring an ingestion API.
// ============================================================

export interface Category {
  id: string;
  name: string;
  colorHex: string;
  order: number;
  isIdle?: boolean;
}

export const CATEGORIES: Category[] = [
  { id: "research", name: "Research", colorHex: "#8BAAFF", order: 0 },
  { id: "coding", name: "Coding", colorHex: "#CF8FFF", order: 1 },
  { id: "review", name: "Code review", colorHex: "#90DDF0", order: 2 },
  { id: "debugging", name: "Debugging", colorHex: "#6E66D4", order: 3 },
  { id: "communication", name: "Communication", colorHex: "#88E5DF", order: 4 },
  { id: "learning", name: "Learning", colorHex: "#B984FF", order: 5 },
  { id: "planning", name: "Planning", colorHex: "#6AADFF", order: 6 },
  { id: "distraction", name: "Distraction", colorHex: "#FF706B", order: 7 },
  { id: "idle", name: "Idle", colorHex: "#A0AEC0", order: 8, isIdle: true },
];

export const categoryById = (id: string): Category =>
  CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export interface Activity {
  id: string;
  title: string;
  categoryId: string;
  start: string; // "HH:MM" 24h
  end: string; // "HH:MM" 24h
  summary: string;
  app: string;
  dayOffset: number; // 0 = today, -1 = yesterday ... for date navigation
}

const D = (dayOffset: number): Activity[] =>
  ACTIVITIES.filter((a) => a.dayOffset === dayOffset);

/** A focused product-engineering day, captured in 15–60 min cards. */
const ACTIVITIES: Activity[] = [
  // ---------- today (offset 0) ----------
  {
    id: "t1",
    title: "Reading Dayflow architecture docs",
    categoryId: "research",
    start: "08:52",
    end: "09:18",
    summary:
      "Reviewed the timeline engine design doc and the provider routing layer. Collected notes for the dashboard refactor.",
    app: "Chrome",
    dayOffset: 0,
  },
  {
    id: "t2",
    title: "Building auth module in Next.js",
    categoryId: "coding",
    start: "09:22",
    end: "10:14",
    summary:
      "Implemented session routes, middleware guards, and the sign-in sheet. Wired Prisma models and added tests for token refresh.",
    app: "VS Code",
    dayOffset: 0,
  },
  {
    id: "t3",
    title: "Fixing hydration mismatch in dashboard",
    categoryId: "debugging",
    start: "10:18",
    end: "10:39",
    summary:
      "Traced a server/client render divergence to a locale-formatted date. Stabilized with a deterministic formatter.",
    app: "VS Code",
    dayOffset: 0,
  },
  {
    id: "t4",
    title: "Team standup and sprint planning",
    categoryId: "communication",
    start: "10:45",
    end: "11:22",
    summary:
      "Shared progress on the timeline refactor. Agreed to split the weekly dashboard work into two PRs.",
    app: "Slack",
    dayOffset: 0,
  },
  {
    id: "t5",
    title: "Reviewing PR #482 — timeline virtualization",
    categoryId: "review",
    start: "11:26",
    end: "12:04",
    summary:
      "Left 11 comments on list virtualization and scroll restoration. Approved after the windowing fix.",
    app: "GitHub",
    dayOffset: 0,
  },
  {
    id: "t6",
    title: "Lunch break",
    categoryId: "idle",
    start: "12:05",
    end: "12:48",
    summary: "Away from the desk.",
    app: "—",
    dayOffset: 0,
  },
  {
    id: "t7",
    title: "Dashboard components and chart theming",
    categoryId: "coding",
    start: "13:02",
    end: "14:06",
    summary:
      "Built the donut chart, summary cards, and category legend. Ported light/dark theme tokens from the design file.",
    app: "VS Code",
    dayOffset: 0,
  },
  {
    id: "t8",
    title: "Watching conference talks",
    categoryId: "distraction",
    start: "14:10",
    end: "14:31",
    summary:
      "Drifted into a React conference playlist after hitting a blocker. Caught it after 21 minutes.",
    app: "YouTube",
    dayOffset: 0,
  },
  {
    id: "t9",
    title: "Studying incremental rendering patterns",
    categoryId: "learning",
    start: "14:40",
    end: "15:36",
    summary:
      "Read streaming SSR articles and skimmed two RFCs on partial prerendering to unblock the dashboard work.",
    app: "Chrome",
    dayOffset: 0,
  },
  {
    id: "t10",
    title: "Reviewing PR #489 — weekly API",
    categoryId: "review",
    start: "15:42",
    end: "16:16",
    summary:
      "Validated date bucketing at the 4am day boundary. Requested a regression test for DST weeks.",
    app: "GitHub",
    dayOffset: 0,
  },
  {
    id: "t11",
    title: "Integrating the weekly data API",
    categoryId: "coding",
    start: "16:22",
    end: "17:08",
    summary:
      "Connected the weekly overview to the aggregation endpoint, added caching and loading skeletons.",
    app: "VS Code",
    dayOffset: 0,
  },
  {
    id: "t12",
    title: "Writing the release changelog",
    categoryId: "communication",
    start: "17:12",
    end: "17:39",
    summary:
      "Drafted v2.4.0 release notes, triaged inbound support messages, and updated the roadmap thread.",
    app: "Slack",
    dayOffset: 0,
  },
  {
    id: "t13",
    title: "Chasing a flaky timeline test",
    categoryId: "debugging",
    start: "17:44",
    end: "18:21",
    summary:
      "Isolated a race in the activity loader with a seeded clock. Added a deterministic test fixture.",
    app: "Terminal",
    dayOffset: 0,
  },

  // ---------- yesterday (offset -1) ----------
  {
    id: "y1",
    title: "Triaging inbox and planning the day",
    categoryId: "planning",
    start: "09:05",
    end: "09:36",
    summary:
      "Cleared 12 support emails, wrote a three-item priority list, and queued the dashboard refactor.",
    app: "Mail",
    dayOffset: -1,
  },
  {
    id: "y2",
    title: "Refactoring timeline card layout",
    categoryId: "coding",
    start: "09:40",
    end: "10:52",
    summary:
      "Extracted the card chrome into shared components and fixed hour-line alignment on long cards.",
    app: "VS Code",
    dayOffset: -1,
  },
  {
    id: "y3",
    title: "Design review: weekly dashboard",
    categoryId: "communication",
    start: "11:00",
    end: "11:41",
    summary:
      "Walked through the sankey prototype with design. Agreed to ship the donut and heatmap first.",
    app: "Figma",
    dayOffset: -1,
  },
  {
    id: "y4",
    title: "Reading SSR streaming internals",
    categoryId: "learning",
    start: "13:10",
    end: "14:02",
    summary:
      "Deep dive into the rendering pipeline source. Took notes for the partial-prerender experiment.",
    app: "Chrome",
    dayOffset: -1,
  },
  {
    id: "y5",
    title: "Fixing day-boundary off-by-one",
    categoryId: "debugging",
    start: "14:10",
    end: "14:55",
    summary:
      "Activities crossing 4am landed on the wrong day. Centralized boundary math and added table tests.",
    app: "VS Code",
    dayOffset: -1,
  },
  {
    id: "y6",
    title: "Pairing on provider routing",
    categoryId: "coding",
    start: "15:10",
    end: "16:18",
    summary:
      "Pair-programmed the OpenAI-compatible fallback chain with prompt-per-provider overrides.",
    app: "VS Code",
    dayOffset: -1,
  },
  {
    id: "y7",
    title: "Scrolling tech news",
    categoryId: "distraction",
    start: "16:24",
    end: "16:41",
    summary: "Short drift through news feeds between tasks.",
    app: "Chrome",
    dayOffset: -1,
  },
  {
    id: "y8",
    title: "Writing provider routing tests",
    categoryId: "review",
    start: "16:48",
    end: "17:40",
    summary:
      "Covered routing edge cases: missing keys, model overrides, and local endpoint discovery.",
    app: "VS Code",
    dayOffset: -1,
  },

  // ---------- 2 days ago (offset -2) ----------
  {
    id: "m1",
    title: "Weekly review and planning",
    categoryId: "planning",
    start: "09:30",
    end: "10:20",
    summary:
      "Reviewed last week's focus patterns, moved two carryover tickets forward, and blocked deep-work slots.",
    app: "Dayflow",
    dayOffset: -2,
  },
  {
    id: "m2",
    title: "Building the heatmap component",
    categoryId: "coding",
    start: "10:30",
    end: "12:00",
    summary:
      "Grid layout, intensity scale, and tooltip wiring for the weekly focus heatmap.",
    app: "VS Code",
    dayOffset: -2,
  },
  {
    id: "m3",
    title: "Mentorship session",
    categoryId: "communication",
    start: "13:30",
    end: "14:20",
    summary:
      "Onboarding walkthrough for the new teammate: repo tour, release process, and testing conventions.",
    app: "Slack",
    dayOffset: -2,
  },
  {
    id: "m4",
    title: "Optimizing timeline scroll",
    categoryId: "coding",
    start: "14:30",
    end: "15:45",
    summary:
      "Virtualized the activity list; dropped jank on 200-card days from 40ms to 4ms per frame.",
    app: "VS Code",
    dayOffset: -2,
  },
  {
    id: "m5",
    title: "Reading up on queue backpressure",
    categoryId: "learning",
    start: "16:00",
    end: "16:50",
    summary: "Notes on bounded queues for the capture pipeline.",
    app: "Chrome",
    dayOffset: -2,
  },
];

export const activitiesForDay = (dayOffset: number): Activity[] => {
  const list = D(dayOffset);
  return list.length > 0
    ? list
    : D(0).map((a) => ({
        ...a,
        id: `${a.id}-shift${dayOffset}`,
        dayOffset,
      }));
};

export const toMinutes = (hm: string): number => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

export const fmtRange = (a: Activity): string => {
  const fmt = (hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };
  return `${fmt(a.start)} – ${fmt(a.end)}`;
};

export const durationMinutes = (a: Activity): number =>
  toMinutes(a.end) - toMinutes(a.start);

export const fmtDuration = (mins: number): string => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

// ---------- day summary (right panel) ----------

export interface FocusBlock {
  activityId: string;
  start: string;
  end: string;
  minutes: number;
}

export interface DaySummary {
  totalCaptured: number;
  totalFocus: number;
  totalDistracted: number;
  longestFocus: { title: string; minutes: number } | null;
  categoryTotals: { categoryId: string; minutes: number }[];
}

const FOCUS_CATEGORIES = new Set([
  "research",
  "coding",
  "review",
  "debugging",
  "learning",
  "planning",
]);

export function computeDaySummary(acts: Activity[]): DaySummary {
  let totalFocus = 0;
  let totalDistracted = 0;
  const totals = new Map<string, number>();
  let longest: { title: string; minutes: number } | null = null;

  for (const a of acts) {
    const mins = durationMinutes(a);
    totals.set(a.categoryId, (totals.get(a.categoryId) ?? 0) + mins);
    if (a.categoryId === "distraction") totalDistracted += mins;
    if (FOCUS_CATEGORIES.has(a.categoryId)) {
      totalFocus += mins;
      if (!longest || mins > longest.minutes) {
        longest = { title: a.title, minutes: mins };
      }
    }
  }

  const categoryTotals = [...totals.entries()]
    .map(([categoryId, minutes]) => ({ categoryId, minutes }))
    .sort((x, y) => y.minutes - x.minutes);

  return {
    totalCaptured: acts.reduce((s, a) => s + durationMinutes(a), 0),
    totalFocus,
    totalDistracted,
    longestFocus: longest,
    categoryTotals,
  };
}

// ---------- targets (day goal) ----------

export interface DayTarget {
  label: string;
  categoryId: string;
  plannedMinutes: number;
  doneMinutes: number;
}

export const todayTargets: DayTarget[] = [
  {
    label: "Ship the weekly dashboard",
    categoryId: "coding",
    plannedMinutes: 180,
    doneMinutes: 165,
  },
  {
    label: "Review open PRs",
    categoryId: "review",
    plannedMinutes: 90,
    doneMinutes: 68,
  },
  {
    label: "Study SSR streaming",
    categoryId: "learning",
    plannedMinutes: 60,
    doneMinutes: 56,
  },
];

// ---------- daily view ----------

export interface StandupData {
  dateLabel: string;
  highlights: string[];
  priorities: string[];
  blockers: string[];
}

export const standup: StandupData = {
  dateLabel: "Today",
  highlights: [
    "Refactored the timeline card layout and fixed hour-line alignment",
    "Pair-programmed the provider routing fallback chain",
    "Fixed the 4am day-boundary off-by-one with table tests",
  ],
  priorities: [
    "Finish wiring the weekly data API with caching",
    "Land PR #482 (timeline virtualization) after comments are addressed",
    "Write the v2.4.0 release changelog",
  ],
  blockers: [
    "Waiting on design sign-off for the sankey diagram before shipping it",
  ],
};

/** GitHub-style hourly grid: 30-min cells across 9am–7pm. */
export const dailyGrid = (() => {
  const cells: { hour: number; half: 0 | 1; focus: boolean }[] = [];
  const focusSlots = new Set<string>();
  for (const a of D(0)) {
    if (!FOCUS_CATEGORIES.has(a.categoryId)) continue;
    const s = toMinutes(a.start);
    const e = toMinutes(a.end);
    for (let t = Math.ceil(s / 30) * 30; t < e; t += 30) {
      focusSlots.add(`${t}`);
    }
  }
  for (let hour = 9; hour < 19; hour++) {
    for (const half of [0, 1] as const) {
      const t = hour * 60 + half * 30;
      cells.push({ hour, half, focus: focusSlots.has(`${t}`) });
    }
  }
  return cells;
})();

// ---------- weekly view ----------

export interface WeekdayStat {
  label: string;
  dateLabel: string;
  focusMinutes: number;
  distractionMinutes: number;
  capturedMinutes: number;
}

export const weekStats: WeekdayStat[] = [
  {
    label: "Mon",
    dateLabel: "Sep 1",
    focusMinutes: 212,
    distractionMinutes: 34,
    capturedMinutes: 286,
  },
  {
    label: "Tue",
    dateLabel: "Sep 2",
    focusMinutes: 268,
    distractionMinutes: 21,
    capturedMinutes: 341,
  },
  {
    label: "Wed",
    dateLabel: "Sep 3",
    focusMinutes: 245,
    distractionMinutes: 46,
    capturedMinutes: 322,
  },
  {
    label: "Thu",
    dateLabel: "Sep 4",
    focusMinutes: 331,
    distractionMinutes: 12,
    capturedMinutes: 398,
  },
  {
    label: "Fri",
    dateLabel: "Sep 5",
    focusMinutes: 305,
    distractionMinutes: 28,
    capturedMinutes: 377,
  },
  {
    label: "Sat",
    dateLabel: "Sep 6",
    focusMinutes: 118,
    distractionMinutes: 8,
    capturedMinutes: 152,
  },
  {
    label: "Sun",
    dateLabel: "Sep 7",
    focusMinutes: 94,
    distractionMinutes: 15,
    capturedMinutes: 128,
  },
];

export const weeklyCategoryTotals: { categoryId: string; minutes: number }[] =
  [
    { categoryId: "coding", minutes: 812 },
    { categoryId: "review", minutes: 264 },
    { categoryId: "debugging", minutes: 229 },
    { categoryId: "research", minutes: 198 },
    { categoryId: "learning", minutes: 176 },
    { categoryId: "communication", minutes: 154 },
    { categoryId: "planning", minutes: 96 },
    { categoryId: "distraction", minutes: 164 },
  ];

/** Heatmap: 7 days x 12 hour-slots (8am–8pm), 0..3 intensity. */
export const weeklyHeatmap: number[][] = [
  [0, 1, 2, 2, 3, 1, 2, 1, 0, 1, 2, 0],
  [1, 2, 3, 2, 3, 2, 1, 0, 1, 2, 1, 0],
  [0, 1, 2, 3, 1, 2, 2, 1, 0, 1, 1, 1],
  [1, 2, 3, 3, 3, 1, 0, 2, 1, 2, 2, 0],
  [1, 2, 2, 3, 3, 2, 1, 1, 2, 1, 0, 1],
  [0, 0, 1, 2, 1, 0, 0, 1, 2, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0],
];

export const heatmapHours = [
  "8a",
  "9a",
  "10a",
  "11a",
  "12p",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
];

export interface AppUsage {
  app: string;
  hours: number;
  colorHex: string;
}

export const weeklyAppUsage: AppUsage[] = [
  { app: "VS Code", hours: 18.5, colorHex: "#CF8FFF" },
  { app: "Chrome", hours: 9.2, colorHex: "#8BAAFF" },
  { app: "Slack", hours: 4.1, colorHex: "#88E5DF" },
  { app: "Terminal", hours: 3.4, colorHex: "#6E66D4" },
  { app: "GitHub", hours: 2.8, colorHex: "#90DDF0" },
  { app: "Figma", hours: 1.2, colorHex: "#B984FF" },
];

export const weeklyHighlights: string[] = [
  "Strongest focus day: Thursday (5h 31m) — dashboard push",
  "Deepest morning streak: 2h 12m without a context switch on Tuesday",
  "Distractions fell 38% after moving news reading to lunch",
];

// ---------- agents ----------

export interface AgentThread {
  id: string;
  agent: "Claude Code" | "Codex" | "Cursor Agent";
  title: string;
  project: string;
  startedAt: string;
  durationMinutes: number;
  messages: number;
  toolCalls: number;
  tokens: number;
  status: "completed" | "running";
}

export const agentThreads: AgentThread[] = [
  {
    id: "a1",
    agent: "Claude Code",
    title: "Fix hydration mismatch in dashboard",
    project: "dayflow-web",
    startedAt: "10:18 AM",
    durationMinutes: 21,
    messages: 14,
    toolCalls: 9,
    tokens: 41200,
    status: "completed",
  },
  {
    id: "a2",
    agent: "Claude Code",
    title: "Write provider routing tests",
    project: "dayflow-web",
    startedAt: "4:48 PM",
    durationMinutes: 34,
    messages: 22,
    toolCalls: 16,
    tokens: 68400,
    status: "completed",
  },
  {
    id: "a3",
    agent: "Codex",
    title: "Refactor day boundary helpers",
    project: "dayflow",
    startedAt: "2:10 PM",
    durationMinutes: 45,
    messages: 18,
    toolCalls: 12,
    tokens: 52900,
    status: "completed",
  },
  {
    id: "a4",
    agent: "Cursor Agent",
    title: "Chart theming pass",
    project: "dayflow-web",
    startedAt: "1:02 PM",
    durationMinutes: 64,
    messages: 31,
    toolCalls: 22,
    tokens: 97300,
    status: "completed",
  },
];

// ---------- chat suggestions ----------

export const chatSuggestions: { icon: string; label: string }[] = [
  { icon: "sun", label: "When was I most focused today?" },
  { icon: "list", label: "What did I work on this morning?" },
  { icon: "clock", label: "How much time went to distractions?" },
  { icon: "calendar", label: "Summarize my week" },
];

// ---------- timeline markdown export ----------

export function timelineToMarkdown(dayOffset: number): string {
  const acts = activitiesForDay(dayOffset);
  const summary = computeDaySummary(acts);
  const now = new Date();
  const day = new Date(now);
  day.setDate(now.getDate() + dayOffset);
  const label = day.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const lines: string[] = [`# Dayflow — ${label}`, ""];
  for (const a of acts) {
    const c = categoryById(a.categoryId);
    lines.push(`## ${a.title}`);
    lines.push(
      `**${fmtRange(a)}** · ${fmtDuration(durationMinutes(a))} · ${c.name}`
    );
    lines.push("");
    lines.push(a.summary);
    lines.push("");
  }
  lines.push("---", "");
  lines.push(`**Total captured:** ${fmtDuration(summary.totalCaptured)}`);
  lines.push(`**Focus time:** ${fmtDuration(summary.totalFocus)}`);
  lines.push(`**Distraction time:** ${fmtDuration(summary.totalDistracted)}`);
  if (summary.longestFocus) {
    lines.push(
      `**Longest focus block:** ${summary.longestFocus.title} (${fmtDuration(
        summary.longestFocus.minutes
      )})`
    );
  }
  return lines.join("\n");
}
