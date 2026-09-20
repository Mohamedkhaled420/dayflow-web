#!/usr/bin/env node
// ============================================================
// Sandbox-only mock Groq server (NOT part of the product)
// ------------------------------------------------------------
// Serves just enough of the OpenAI-compatible chat-completions
// API for the Dayflow coach cascade to run end-to-end inside the
// preview sandbox: SSE streaming when body.stream=true, plain
// JSON otherwise. Canned replies exercise the exact failure
// modes the app must handle — think blocks split across deltas,
// markdown (bold/lists/headings/code), and the NOTE/LOG trailing
// protocol the route strips into Coach Notes + log actions.
//
// Run: node scripts/mock-groq.mjs            (port 8788)
// Point the app at it via .env.local:
//   GROQ_API_KEY=mock-key
//   GROQ_BASE_URL=http://localhost:8788/v1/chat/completions
// ============================================================

import http from "node:http";

const PORT = Number(process.env.PORT ?? 8788);

const CANNED_REPLY = [
  "Here's what **stands out** across your recent entries:",
  "",
  "- Energy dips *hard* after back-to-back meetings",
  "- Mood recovers on days with a `morning run`",
  "- 1. Sleep lands around 01:00 most nights",
  "",
  "### One experiment worth trying",
  "Anchor a single deep-work block *before* your first meeting —",
  "the entries suggest the clearest window is early.",
  "",
  "> Small hinges swing big doors.",
  "",
  "```",
  "focus: 09:00-10:30",
  "guard: no meetings before 10:30",
  "```",
  "",
  "NOTE: Take a 10-minute walk after your last meeting today",
  "LOG WATER: 500 ml",
  "LOG WORKOUT: Walk · 10 min",
  "LOG JOURNAL: Felt heavy after meetings; a short walk reset the evening",
].join("\n");

// A "plain" reply with no protocol lines (fallback-shape sanity).
const PLAIN_REPLY =
  "That makes sense. Try naming one thing that went well before you close the laptop tonight — the entries show you sleep better on those days.";

const WORKOUT_JSON = JSON.stringify({
  title: "Foundation Strength",
  focus: "Full body, controlled tempo",
  durationMinutes: 40,
  blocks: [
    { name: "Goblet squat", sets: "3×10", durationMinutes: 12, intensity: "moderate", cue: "Heels down, chest proud" },
    { name: "Push-up ladder", sets: "3×8", durationMinutes: 12, intensity: "moderate", cue: "Elbows 45°" },
    { name: "Dead bug", sets: "3×12", durationMinutes: 10, intensity: "light", cue: "Slow exhale each rep" },
    { name: "Cooldown walk", durationMinutes: 6, intensity: "light", cue: "Nasal breathing" },
  ],
});

const THINK_HEAD = "Let me reflect on the mood pattern before answering.";
// Chunk boundaries are deliberately hostile: think tags and
// markdown markers split MID-token across deltas.
const CHUNKS = [
  "<think>",
  THINK_HEAD.slice(0, 10),
  THINK_HEAD.slice(10) + "</think",
  ">",
  "\n",
  ...CANNED_REPLY.match(/[\s\S]{1,24}/g),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url.includes("/chat/completions")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;
  let parsed = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    /* fall through with defaults */
  }

  const lastUser = [...(parsed.messages ?? [])]
    .reverse()
    .find((m) => m.role === "user")?.content ?? "";
  const wantsJson = parsed.response_format?.type === "json_object";
  const lastUserForLog = [...(parsed.messages ?? [])].reverse().find((m) => m.role === "user")?.content ?? "";
  console.log("[mock-groq] lastUser:", JSON.stringify(lastUserForLog.slice(0, 80)), "| plain?", /plain/i.test(lastUserForLog));

  let reply;
  if (wantsJson) {
    reply = WORKOUT_JSON;
  } else if (/plain/i.test(lastUser) || /no note/i.test(lastUser)) {
    reply = PLAIN_REPLY;
  } else {
    reply = CANNED_REPLY;
  }

  // Simulated reasoning delay before the first token.
  await sleep(150);

  if (!parsed.stream) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "mock-" + Date.now(),
        model: parsed.model ?? "mock-model",
        choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
      })
    );
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
  });

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  // The canned reply streams through the hostile split (think
  // tags + markdown markers cut mid-token); every other reply
  // streams in plain 24-char slices of ITS OWN text.
  const chunks =
    wantsJson || reply !== CANNED_REPLY
      ? (reply.match(/[\s\S]{1,24}/g) ?? [reply])
      : CHUNKS;
  for (const chunk of chunks) {
    send({ choices: [{ index: 0, delta: { content: chunk } }] });
    await sleep(25);
  }
  res.write("data: [DONE]\n\n");
  res.end();
});

server.listen(PORT, () => {
  console.log(`[mock-groq] listening on http://localhost:${PORT}/v1/chat/completions`);
});
