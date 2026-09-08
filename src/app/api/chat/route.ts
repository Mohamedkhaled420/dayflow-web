import { NextRequest, NextResponse } from "next/server";

// ============================================================
// Chat grounded in the personal tracker.
// - With apiKey -> forwards the conversation to OpenAI-compatible
//   / Gemini endpoints (bring-your-own-key, works on Vercel).
// - Without a key -> deterministic, tracker-grounded answers
//   computed from the context posted by the client. Zero config.
// ============================================================

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface GoalState {
  label: string;
  done: number;
  target: number;
  unit: "min" | "count";
  met: boolean;
}

interface TrackerContext {
  today?: {
    dateLabel?: string;
    events?: { title: string; category: string; range: string; minutes: number; notes?: string }[];
    goals?: GoalState[];
  };
  week?: {
    days?: {
      label: string;
      dateLabel: string;
      minutesByCategory: Record<string, number>;
      waterGlasses: number;
      sleepMinutes: number;
      totalTracked: number;
    }[];
    workouts?: { count: number; minutes: number; titles: string[] };
    goals?: {
      workMinutesPerDay: number;
      sleepMinutesPerNight: number;
      waterGlassesPerDay: number;
      fitnessSessionsPerWeek: number;
    };
  };
  workoutsToday?: string[];
}

const fmtDur = (mins: number): string => {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
};

export async function POST(req: NextRequest) {
  let body: {
    messages?: ChatMessage[];
    apiKey?: string;
    context?: TrackerContext;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = (body.messages ?? []).filter(
    (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content;
  if (!lastUser) {
    return NextResponse.json({ error: "No user message found." }, { status: 400 });
  }

  const ctx = body.context ?? {};

  // ---- optional live LLM passthrough (bring your own key) ----
  if (body.apiKey) {
    try {
      const reply = await callLLM(body.apiKey, messages, ctx);
      if (reply) return NextResponse.json({ reply });
    } catch (err) {
      const hint = err instanceof Error ? err.message.slice(0, 120) : "provider error";
      return NextResponse.json({
        reply: `The configured LLM provider failed (${hint}). Falling back to your local tracker data:\n\n${answerFromTracker(
          lastUser,
          ctx
        )}`,
      });
    }
  }

  return NextResponse.json({ reply: answerFromTracker(lastUser, ctx) });
}

// ---------------- grounded local answers ----------------

function answerFromTracker(q: string, ctx: TrackerContext): string {
  const t = q.toLowerCase();
  const goals = ctx.today?.goals ?? [];
  const events = ctx.today?.events ?? [];
  const weekDays = ctx.week?.days ?? [];
  const weekGoals = ctx.week?.goals;

  const goalOf = (label: string) => goals.find((g) => g.label.toLowerCase().startsWith(label));

  // ---- week summary ----
  if (/\b(week|weekly|this week)\b/.test(t)) {
    if (weekDays.length === 0) return "I don't have weekly data yet — give me a few days of logs.";
    const total = weekDays.reduce((s, d) => s + d.totalTracked, 0);
    const activeDays = weekDays.filter((d) => d.totalTracked > 0 || d.waterGlasses > 0);
    const sleeps = weekDays.filter((d) => d.sleepMinutes > 0);
    const avgSleep = sleeps.length ? sleeps.reduce((s, d) => s + d.sleepMinutes, 0) / sleeps.length : 0;
    const avgWater =
      activeDays.length > 0
        ? weekDays.reduce((s, d) => s + d.waterGlasses, 0) / activeDays.length
        : 0;
    const best = weekDays.reduce((a, b) => (b.totalTracked > a.totalTracked ? b : a));
    const workouts = ctx.week?.workouts;
    const work = weekDays.reduce((s, d) => s + (d.minutesByCategory["work"] ?? 0), 0);
    const personal = weekDays.reduce((s, d) => s + (d.minutesByCategory["personal"] ?? 0), 0);
    const parts: string[] = [
      `Here's your week at a glance${
        activeDays.length > 0 ? ` (${activeDays.length} days with data)` : ""
      }:`,
      `• Tracked in total: ${fmtDur(total)}`,
      `• Work: ${fmtDur(work)} · Personal projects: ${fmtDur(personal)}`,
      `• Sleep: ${fmtDur(avgSleep)} average per night${
        weekGoals ? ` (goal ${fmtDur(weekGoals.sleepMinutesPerNight)})` : ""
      }`,
      `• Water: ${avgWater.toFixed(1)} glasses/day average${
        weekGoals ? ` (goal ${weekGoals.waterGlassesPerDay})` : ""
      }`,
    ];
    if (workouts) {
      parts.push(
        `• Workouts: ${workouts.count} sessions, ${fmtDur(workouts.minutes)} of training${
          weekGoals
            ? ` — goal is ${weekGoals.fitnessSessionsPerWeek}/week ${
                workouts.count >= weekGoals.fitnessSessionsPerWeek ? "✓ met" : "still open"
              }`
            : ""
        }`
      );
    }
    parts.push(`• Most active day: ${best.label} (${best.dateLabel}) with ${fmtDur(best.totalTracked)}`);
    return parts.join("\n");
  }

  // ---- sleep ----
  if (/sleep|tired|rest|bed|night/.test(t)) {
    const g = goalOf("sleep");
    const sleepEvents = events.filter((e) => e.category.toLowerCase() === "sleep");
    if (sleepEvents.length > 0) {
      const e = sleepEvents[0];
      return [
        `Last night: ${e.range} — ${fmtDur(e.minutes)}.${e.notes ? ` ${e.notes}` : ""}`,
        g
          ? `That's ${
              g.met
                ? `at your ${fmtDur(g.target)} target ✓`
                : `${fmtDur(g.target - g.done)} short of your ${fmtDur(g.target)} target`
            }.`
          : "",
        ``,
        `This week per night: ${weekDays
          .map((d) => `${d.label} ${d.sleepMinutes ? fmtDur(d.sleepMinutes) : "—"}`)
          .join(" · ")}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    return "No sleep logged yet — log it from the timeline (an overnight block ending at your wake-up time).";
  }

  // ---- water ----
  if (/water|hydrat|drink|glass/.test(t)) {
    const g = goalOf("water");
    if (g) {
      const remaining = Math.max(0, g.target - g.done);
      return [
        `You've had ${g.done.toFixed(0)} of ${g.target} glasses today${
          g.met ? " — goal met 💧" : `, ${Math.ceil(remaining)} to go.`
        }`,
        ``,
        `This week: ${weekDays
          .map((d) => `${d.label} ${d.waterGlasses > 0 ? d.waterGlasses.toFixed(0) : "—"}`)
          .join(" · ")}`,
        weekGoals
          ? `\nTip: front-load a glass with every meal to stay on pace for ${weekGoals.waterGlassesPerDay}/day.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    return "I couldn't find your hydration numbers for today.";
  }

  // ---- fitness / workouts ----
  if (/fitness|workout|gym|train|exercise|run|lift/.test(t)) {
    const g = goalOf("fitness");
    const w = ctx.week?.workouts;
    const todayWorkouts = events.filter(
      (e) => e.category.toLowerCase() === "fitness" || /gym|run|hiit|swim|yoga|cycling|walk/i.test(e.title)
    );
    const lines: string[] = [];
    if (todayWorkouts.length > 0) {
      for (const e of todayWorkouts) {
        lines.push(`• ${e.title} — ${e.range} (${fmtDur(e.minutes)})${e.notes ? ` — ${e.notes}` : ""}`);
      }
      if (g) {
        lines.push(
          g.met
            ? `Daily fitness goal met ✓ (${fmtDur(g.done)} / ${fmtDur(g.target)}).`
            : `Daily goal: ${fmtDur(g.done)} of ${fmtDur(g.target)}.`
        );
      }
    } else {
      lines.push("No workout logged today yet.");
      if (g && g.done > 0) lines.push(`You did log ${fmtDur(g.done)} of activity.`);
      lines.push("A 20-minute walk still counts — log it from the timeline.");
    }
    if (w && weekGoals) {
      lines.push(
        ``,
        `This week: ${w.count} of ${weekGoals.fitnessSessionsPerWeek} sessions (${fmtDur(
          w.minutes
        )} total).`
      );
      if (w.titles.length > 0) lines.push(...w.titles.map((x) => `• ${x}`));
    }
    return lines.join("\n");
  }

  // ---- work / focus ----
  if (/work|focus|job|deep/.test(t)) {
    const g = goalOf("work");
    const workEvents = events.filter(
      (e) => e.category.toLowerCase() === "work" || e.category.toLowerCase() === "personal work"
    );
    if (workEvents.length > 0) {
      const longest = workEvents.reduce((a, b) => (b.minutes > a.minutes ? b : a));
      return [
        `Today's work blocks:`,
        ...workEvents.map((e) => `• ${e.title} — ${e.range} (${fmtDur(e.minutes)})`),
        ``,
        g
          ? `Work total: ${fmtDur(g.done)} of ${fmtDur(g.target)} target${
              g.met ? " ✓" : ""
            }. Longest block: ${longest.title} (${fmtDur(longest.minutes)}).`
          : `Longest block: ${longest.title} (${fmtDur(longest.minutes)}).`,
        ``,
        `This week: ${weekDays.map((d) => `${d.label} ${fmtDur(d.minutesByCategory["work"] ?? 0)}`).join(" · ")}`,
      ].join("\n");
    }
    return "No work blocks logged today — add one with the Log button on the timeline.";
  }

  // ---- food / meals ----
  if (/food|meal|eat|lunch|dinner|breakfast|diet/.test(t)) {
    const g = goalOf("meals");
    const mealEvents = events.filter((e) => e.category.toLowerCase() === "meals");
    if (mealEvents.length > 0) {
      return [
        `Meals logged today:`,
        ...mealEvents.map((e) => `• ${e.title} — ${e.range}`),
        ``,
        g
          ? `That's ${mealEvents.length} of your ${g.target} daily meals${
              g.met ? " ✓" : ""
            }.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    return "No meals logged today — log breakfast, lunch and dinner to keep the goal honest.";
  }

  // ---- goals ----
  if (/goal|target|progress|streak/.test(t)) {
    if (goals.length === 0) return "No goal data available for today.";
    const met = goals.filter((g) => g.met);
    return [
      `Goals for today — ${met.length}/6 met:`,
      ...goals.map((g) => {
        const val = g.unit === "count" ? `${g.done}/${g.target}` : `${fmtDur(g.done)} / ${fmtDur(g.target)}`;
        return `${g.met ? "✓" : "○"} ${g.label}: ${val}`;
      }),
      ``,
      met.length === 6
        ? "Perfect day — every ring closed."
        : "Open rings are still winnable today — check Habits for details.",
    ].join("\n");
  }

  // ---- fallback: full day recap ----
  if (events.length > 0) {
    return [
      `Here's what your tracker shows for ${ctx.today?.dateLabel ?? "today"}:`,
      ``,
      ...events.map((e) => `• ${e.range} — ${e.title} (${e.category}, ${fmtDur(e.minutes)})`),
      ``,
      goals.length > 0
        ? `Goals: ${goals
            .map((g) => `${g.label} ${g.met ? "✓" : `${g.done}/${g.target}`}`)
            .join(" · ")}.`
        : "",
      `Try asking about your sleep, water, workouts, work time, meals, or the week overall.`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `Nothing is logged for today yet.`,
    `Log a block from the timeline — workouts, work sessions, meals, and sleep all count.`,
    `Then ask me about your sleep, hydration, training load, or weekly totals.`,
  ].join("\n");
}

// ---------------- optional live provider ----------------

async function callLLM(
  apiKey: string,
  messages: ChatMessage[],
  ctx: TrackerContext
): Promise<string | null> {
  const systemPrompt =
    "You are Dayflow's personal-tracker assistant. Be concise and specific. Answer using this tracker data when relevant:\n" +
    JSON.stringify(ctx);

  // Gemini
  if (apiKey.startsWith("AIza")) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: systemPrompt }] },
            ...messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
          ],
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    return (
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ??
      null
    );
  }

  // OpenAI-compatible
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? null;
}
