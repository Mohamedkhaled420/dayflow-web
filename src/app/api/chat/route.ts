import { NextRequest, NextResponse } from "next/server";
import {
  activitiesForDay,
  categoryById,
  computeDaySummary,
  durationMinutes,
  fmtDuration,
  fmtRange,
  weekStats,
  weeklyAppUsage,
  weeklyCategoryTotals,
  agentThreads,
} from "@/lib/demo-data";

// ============================================================
// Chat grounded in the work journal.
// - With apiKey -> forwards the conversation to OpenAI-compatible
//   / Gemini endpoints (bring-your-own-key, works on Vercel).
// - Without a key -> deterministic, journal-grounded answers
//   computed locally from the timeline data. Zero config needed.
// ============================================================

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const FOCUS_CATEGORIES = new Set([
  "research",
  "coding",
  "review",
  "debugging",
  "learning",
  "planning",
]);

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMessage[]; apiKey?: string; provider?: string };
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

  // ---- optional live LLM passthrough (bring your own key) ----
  if (body.apiKey) {
    try {
      const reply = await callLLM(body.apiKey, messages);
      if (reply) return NextResponse.json({ reply });
    } catch (err) {
      // fall through to grounded answers; surface a short hint
      const hint =
        err instanceof Error ? err.message.slice(0, 120) : "provider error";
      return NextResponse.json({
        reply: `The configured LLM provider failed (${hint}). Falling back to your local journal data:\n\n${answerFromJournal(
          lastUser
        )}`,
      });
    }
  }

  return NextResponse.json({ reply: answerFromJournal(lastUser) });
}

// ---------------- grounded local answers ----------------

function answerFromJournal(q: string): string {
  const t = q.toLowerCase();

  const today = activitiesForDay(0);
  const summary = computeDaySummary(today);
  const yesterday = activitiesForDay(-1);
  const yesterdaySummary = computeDaySummary(yesterday);

  // week summary
  if (/\b(week|weekly|this week)\b/.test(t)) {
    const focus = weekStats.reduce((s, d) => s + d.focusMinutes, 0);
    const distracted = weekStats.reduce((s, d) => s + d.distractionMinutes, 0);
    const best = weekStats.reduce((a, b) => (b.focusMinutes > a.focusMinutes ? b : a));
    const topCat = weeklyCategoryTotals[0];
    const topApp = weeklyAppUsage[0];
    return [
      `Here's your week at a glance:`,
      `• Focus time: ${fmtDuration(focus)} across 7 days (~${fmtDuration(
        Math.round(focus / 7)
      )}/day)`,
      `• Best day: ${best.label} (${best.dateLabel}) with ${fmtDuration(best.focusMinutes)} focused`,
      `• Distractions: ${fmtDuration(distracted)} total`,
      `• Top category: ${categoryById(topCat.categoryId).name} — ${fmtDuration(topCat.minutes)}`,
      `• Most-used app: ${topApp.app} (${topApp.hours}h)`,
      ``,
      `Yesterday you focused ${yesterdaySummary.totalFocus} minutes vs ${summary.totalFocus} today${
        summary.totalFocus >= yesterdaySummary.totalFocus ? " — trending up." : "."
      }`,
    ].join("\n");
  }

  // focus / most focused question
  if (/focus/.test(t)) {
    const focusActs = today
      .filter((a) => FOCUS_CATEGORIES.has(a.categoryId))
      .sort((a, b) => durationMinutes(b) - durationMinutes(a))
      .slice(0, 3);
    const best = summary.longestFocus;
    return [
      `Today you logged ${fmtDuration(summary.totalFocus)} of focused work.`,
      best
        ? `Your longest focus block was **${best.title}** (${fmtDuration(best.minutes)}).`
        : "",
      ``,
      `Top focus blocks:`,
      ...focusActs.map(
        (a) =>
          `• ${a.title} — ${fmtRange(a)} (${fmtDuration(durationMinutes(a))})`
      ),
      ``,
      `Focus by category: ${summary.categoryTotals
        .filter((c) => FOCUS_CATEGORIES.has(c.categoryId))
        .map((c) => `${categoryById(c.categoryId).name} ${fmtDuration(c.minutes)}`)
        .join(", ")}.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // distraction
  if (/distract|youtube|drift|waste/.test(t)) {
    const d = today.filter((a) => a.categoryId === "distraction");
    return [
      `Distractions today: ${fmtDuration(summary.totalDistracted)}.`,
      ...d.map(
        (a) => `• ${a.title} — ${fmtRange(a)} (${fmtDuration(durationMinutes(a))})`
      ),
      ``,
      d.length
        ? `The drift after lunch cost you about ${fmtDuration(
            summary.totalDistracted
          )}. Catching it within ~20 minutes kept the afternoon recoverable.`
        : "No distracting sessions logged today.",
    ].join("\n");
  }

  // morning / what did I do
  if (/morning|today|what did i|did i work|standup|yesterday/.test(t)) {
    const target = /yesterday/.test(t) ? yesterday : today;
    const targetSummary = /yesterday/.test(t) ? yesterdaySummary : summary;
    const label = /yesterday/.test(t) ? "Yesterday" : "Today";
    return [
      `${label}, you captured ${fmtDuration(targetSummary.totalCaptured)} of activity across ${
        target.length
      } cards:`,
      ``,
      ...target.map(
        (a) =>
          `• **${a.title}** (${categoryById(a.categoryId).name}) — ${fmtRange(a)}, ${fmtDuration(
            durationMinutes(a)
          )}`
      ),
      ``,
      `Focus: ${fmtDuration(targetSummary.totalFocus)} · Distractions: ${fmtDuration(
        targetSummary.totalDistracted
      )}.`,
    ].join("\n");
  }

  // agents
  if (/agent|claude|codex|cursor/.test(t)) {
    return [
      `You ran ${agentThreads.length} agent sessions recently:`,
      ...agentThreads.map(
        (a) =>
          `• **${a.title}** — ${a.agent}, ${a.durationMinutes}m, ${a.messages} messages, ${(
            a.tokens / 1000
          ).toFixed(1)}k tokens`
      ),
      ``,
      `Longest session: ${
        agentThreads.reduce((a, b) => (b.durationMinutes > a.durationMinutes ? b : a)).title
      }.`,
    ].join("\n");
  }

  // apps
  if (/app|application|which app|vs ?code|chrome/.test(t)) {
    return [
      `Your most-used apps this week:`,
      ...weeklyAppUsage.map((a) => `• ${a.app} — ${a.hours}h`),
      ``,
      `VS Code dominates by a wide margin, which matches Coding being your top category.`,
    ].join("\n");
  }

  // fallback: full day recap
  return [
    `Here's what your journal shows for today:`,
    ``,
    ...today.map(
      (a) =>
        `• ${fmtRange(a)} — ${a.title} (${categoryById(a.categoryId).name})`
    ),
    ``,
    `Totals: ${fmtDuration(summary.totalCaptured)} captured · ${fmtDuration(
      summary.totalFocus
    )} focused · ${fmtDuration(summary.totalDistracted)} distracted.`,
    ``,
    `Try asking about your week, focus blocks, distractions, apps, or agent sessions.`,
  ].join("\n");
}

// ---------------- optional live provider ----------------

async function callLLM(apiKey: string, messages: ChatMessage[]): Promise<string | null> {
  // Gemini
  if (apiKey.startsWith("AIza")) {
    const system = {
      role: "user",
      parts: [
        {
          text:
            "You are Dayflow's work-journal assistant. Answer using this journal data when relevant:\n" +
            journalContext(),
        },
      ],
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            system,
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
        {
          role: "system",
          content:
            "You are Dayflow's work-journal assistant. Answer using this journal data when relevant:\n" +
            journalContext(),
        },
        ...messages,
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? null;
}

function journalContext(): string {
  const today = activitiesForDay(0);
  const summary = computeDaySummary(today);
  return [
    `Today's timeline:`,
    ...today.map(
      (a) =>
        `${fmtRange(a)} | ${a.title} | ${categoryById(a.categoryId).name} | ${a.summary}`
    ),
    `Totals: captured ${summary.totalCaptured}m, focus ${summary.totalFocus}m, distraction ${summary.totalDistracted}m.`,
    `Weekly focus per day: ${weekStats.map((d) => `${d.label}=${d.focusMinutes}m`).join(", ")}.`,
  ].join("\n");
}
