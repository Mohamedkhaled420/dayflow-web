// ============================================================
// Focus Triad — Voice agent WebSocket relay (Deepgram v1/converse)
// ------------------------------------------------------------
// WHY A RELAY: the live Deepgram Voice Agent endpoint
// (wss://agent.deepgram.com/v1/agent/converse) authenticates via
// the Authorization header ONLY — query params and WebSocket
// subprotocols are rejected with 401 (verified 2026-10-09), so a
// browser cannot connect directly without leaking the API key.
// This route keeps the key server-side: the browser opens a
// same-origin WebSocket here (cookies authenticate the upgrade),
// and we pipe frames both ways to Deepgram.
//
// Server-authoritative configuration: the CLIENT cannot send a
// Settings message — we build it here after Deepgram's Welcome,
// from env-configured models + the Dia prompt. The only client
// control message we honor is df:Inject (text the user typed in
// the talk dock), which we translate into an InjectUserMessage.
// Everything else the client sends is ignored; everything
// Deepgram sends is forwarded verbatim (Welcome, SettingsApplied,
// ConversationText, UserStartedSpeaking, AgentThinking, History,
// AgentAudioDone, Error/Warning + binary linear16 audio frames).
//
// Runs on Vercel Fluid Compute (WebSockets are public beta on all
// plans since 2026-06-22). maxDuration 300 caps a voice session
// at five minutes; the client treats the close as a normal
// session end and can immediately reconnect.
//
// Cost note (researched 2026-10, deepgram.com/pricing):
//   Standard tier = $0.075/min of CONNECTION time, all-inclusive
//   (Flux STT + a managed Standard-tier LLM + Flux TTS). Every
//   Standard think model costs the same, so the model is a pure
//   env swap with zero cost delta. Advanced-tier LLMs (gpt-5,
//   claude-sonnet, gemini-pro) triple the per-minute rate and
//   are deliberately not used.
//
// DAILY VOICE QUOTA (Plus monetization, 2026-10-17): free plan
// gets 5 min/day, Plus ($14.99/yr) is unlimited modulo a 2 h
// abuse guard. The gate runs HERE before the upgrade; the meter
// (record_voice_seconds RPC, migration 0016) flushes connected
// seconds every 60 s + on close, so a killed instance loses at
// most 59 s (in the USER's favor). Until the migration is
// applied the usage reads fail soft to 0 — voice stays on.
//
// VOICE + LATENCY TUNING (live-probed 2026-10-13,
// scripts/probe-dia-voice.mjs + probe-dia-functions.mjs):
//   - flux-kit-en (the old default) is "Kit" — a BRITISH MALE
//     voice; that was the man's voice users heard. Hannah
//     (flux-hannah-en) is Deepgram's #1 featured feminine voice
//     for casual chat. Sienna/Alexis verified as alternates.
//   - gemini-3.1-flash-lite is NOT available on this API key
//     ("model not available"); gpt-5.4-nano IS, handles the
//     tool calls correctly (log_water 500ml, log_sleep
//     bedtime/wake/duration all exact), and answers faster.
//   - Eager end-of-turn (eager_eot_threshold) lets the LLM start
//     BEFORE the user's turn is formally closed — the single
//     biggest perceived-latency win; eot_threshold 0.6 + a 3.5s
//     backstop keep Dia from cutting you off mid-pause.
// ============================================================

import WebSocket from "ws";
import { createClient } from "@/utils/supabase/server";
import { experimental_upgradeWebSocket } from "@vercel/functions";
import { RATE_RULES, allowRequest } from "@/lib/rate-limit";
import { voiceQuotaSeconds, voiceUsageDayKey } from "@/lib/voice-quota";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Deepgram's live Voice Agent endpoint (the documented v2 path
 *  still 404s in production; the AsyncAPI reference + probing
 *  both land here). */
const DG_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse";

/** Prompt budget — the relay re-caps the context block so a huge
 *  query string can never bloat every LLM turn. */
const MAX_CTX_CHARS = 4_000;

const LISTEN_MODEL = process.env.DEEPGRAM_LISTEN_MODEL ?? "flux-general-en";
const THINK_MODEL = process.env.DEEPGRAM_THINK_MODEL ?? "gpt-5.4-nano";
const SPEAK_MODEL = process.env.DEEPGRAM_SPEAK_MODEL ?? "flux-hannah-en";
/** Slightly brisker delivery (Flux accepts 0.5–1.5 in 0.05 steps)
 * — part of the "why is she a little slow" fix. */
const SPEAK_SPEED = 1.05;

/** Turn-taking latency knobs (Flux listen models only; verified
 * accepted by v1/converse 2026-10-13). Eager mode starts the LLM
 * before the turn formally ends; 0.6 final threshold + 3.5s
 * silence backstop balance speed against interruptions. */
const EAGER_EOT_THRESHOLD = 0.5;
const EOT_THRESHOLD = 0.6;
const EOT_TIMEOUT_MS = 3_500;

/** Tools Dia may invoke mid-conversation (client-side — the
 * browser executes them; see sendSettings for the protocol). */
const AGENT_FUNCTIONS = [
  {
    name: "log_water",
    description:
      "Log water the user drank. Call whenever the user mentions drinking water or asks to log it.",
    parameters: {
      type: "object",
      properties: {
        amount_ml: {
          type: "number",
          description: "Amount in milliliters (a glass is about 250, a bottle about 500)",
        },
      },
      required: ["amount_ml"],
    },
  },
  {
    name: "log_workout",
    description:
      "Log a workout the user did or just finished. Call for any exercise: run, gym, yoga, swim, sports, walk.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Short workout name, e.g. 'Morning run', 'Gym upper body', 'Yoga'",
        },
        duration_minutes: {
          type: "number",
          description: "Duration in minutes if mentioned or clearly inferable",
        },
        active_calories: {
          type: "number",
          description: "Calories burned, only if the user stated a number",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "log_meal",
    description:
      "Log a meal or snack the user ate. Estimate calories and macros from the description when not stated.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Meal name, e.g. 'Chicken sandwich', 'Oatmeal with berries'" },
        calories: { type: "number", description: "Estimated calories for the whole meal" },
        protein_g: { type: "number", description: "Estimated protein grams" },
        carbs_g: { type: "number", description: "Estimated carb grams" },
        fat_g: { type: "number", description: "Estimated fat grams" },
      },
      required: ["name", "calories"],
    },
  },
  {
    name: "log_sleep",
    description:
      "Log sleep the user had — last night, a nap, or a planned night they confirm. Call whenever the user mentions sleeping, bedtime, waking up, or asks to log sleep. NEVER log sleep with log_activity.",
    parameters: {
      type: "object",
      properties: {
        duration_minutes: {
          type: "number",
          description: "Sleep length in minutes (7 hours = 420, 8 hours = 480). Use when the user gives a duration or a from-to range.",
        },
        bedtime: {
          type: "string",
          description: "Bedtime as 24-hour HH:MM, e.g. '03:00' for 3 AM. Only when the user says when they fell asleep.",
        },
        wake_time: {
          type: "string",
          description: "Wake time as 24-hour HH:MM, e.g. '10:00' for 10 AM. Only when the user says when they woke up.",
        },
      },
    },
  },
  {
    name: "log_activity",
    description:
      "Log a time block that is not sleep, water, food, or exercise: work, study, chores, hobbies, leisure, socializing.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What they did, e.g. 'Deep work on thesis'" },
        category: {
          type: "string",
          enum: ["work", "personal", "leisure", "other"],
          description: "Best-fit category",
        },
        duration_minutes: { type: "number", description: "Duration in minutes if known" },
      },
      required: ["title"],
    },
  },
] as const;

/** Names the relay is willing to forward a function response for. */
const FUNCTION_NAMES = new Set<string>(AGENT_FUNCTIONS.map((f) => f.name));

/**
 * Same auth gate as /api/ai/coach (Amendment #12): the canonical
 * cookie-session client first. A browser WebSocket handshake
 * cannot carry a Bearer header, so unlike the coach route there
 * is no Bearer leg — cookie only. Returns the LIVE client too:
 * the quota gate below and the usage meter inside the socket
 * both need it (plan + voice_usage reads go through the user's
 * own RLS; the meter RPC runs as the user via SECURITY DEFINER).
 */
async function verifyRequester(): Promise<{
  userId: string;
  client: Awaited<ReturnType<typeof createClient>>;
} | null> {
  const cookieClient = await createClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (!user) return null;
  return { userId: user.id, client: cookieClient };
}

function diaPrompt(name: string, ctx: string): string {
  const lines = [
    "# Role",
    "You are Dia, the warm voice companion inside Focus Triad — a calm, private life-tracking app.",
    "You are speaking ALOUD over a phone-like voice call with the user. Everything you say is synthesized to speech.",
    "",
    "# Voice rules",
    "- Speak naturally and warmly, like a kind coach on a call.",
    "- Keep replies to 1-3 short spoken sentences (under ~220 characters) unless the user asks for detail.",
    "- Never use markdown, lists, code, emoji, or special symbols — they get spoken literally.",
    "- Ask at most one follow-up question, and only when it genuinely helps.",
    "- If the user interrupts or changes topic, follow them gracefully.",
    "",
    "# What you know",
    "The user's recent logged context (most recent last):",
    ctx.trim() ? ctx : "(no entries logged yet — ask how things are going)",
    "",
    "# Actions",
    "You can log things FOR the user by calling your functions: log_water, log_workout, log_meal, log_sleep, and log_activity for any other time block.",
    "- When the user mentions something they drank, ate, did, or slept — call the matching function instead of just talking about it, then confirm in one short warm sentence.",
    "- SLEEP ALWAYS GOES TO log_sleep. When the user gives a range like 'slept from 3 AM to 10 AM', pass bedtime='03:00', wake_time='10:00' and duration_minutes=420. When they only give a duration, pass duration_minutes alone.",
    "- For meals, estimate calories yourself from the description; mention your estimate when confirming so they can correct you.",
    "- If a needed detail is truly missing (like what they ate), ask ONE short question first instead of guessing.",
    "- Never call a function for something the user is only asking ABOUT; only when they want it logged.",
    "",
    "# Style",
    "- Ground advice in the logged context when relevant; otherwise stay general.",
    "- Be encouraging about small wins; never judgmental about misses.",
    "- For medical, legal, or financial questions, gently defer to professionals.",
  ];
  if (name) lines.push(`- The user's first name is ${name}; use it occasionally, not every sentence.`);
  return lines.join("\n");
}

export async function GET(req: Request) {
  // 1. Auth — cookies ride the same-origin WS upgrade.
  const requester = await verifyRequester();
  if (!requester) {
    return Response.json(
      { code: "INVALID_SESSION", error: "Sign in again — your session expired." },
      { status: 401 }
    );
  }
  const { userId, client: supabase } = requester;

  // 1b. Per-user session budget (P0-5): a voice call is the most
  // expensive thing a user can start (live STT+LLM+TTS minutes);
  // 6 sessions / 5 min, durable, cookie-session authorized.
  if (!(await allowRequest(RATE_RULES.voice, null))) {
    return Response.json(
      { code: "RATE_LIMITED", error: "That's a lot of calls in a short time — take a short break." },
      { status: 429 }
    );
  }

  // 2. Voice must be configured server-side.
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { code: "VOICE_UNAVAILABLE", error: "Voice is not configured on this deployment." },
      { status: 503 }
    );
  }

  // 2b. Daily voice quota (Plus monetization). Reads ride the
  // caller's own RLS: subscriptions select-own (0014) and
  // voice_usage select-own (0016). Missing table / missing row
  // → 0 used, voice stays available (availability-first, same
  // policy as the rate limiter; enforcement flips on the moment
  // migration 0016 lands). The 402 body carries the numbers so
  // the client's paywall can be exact, not vague.
  let plan: "free" | "plus" = "free";
  {
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("plan")
      .maybeSingle();
    if (!subError && sub?.plan === "plus") plan = "plus";
    else if (subError && !/does not exist|not found/i.test(subError.message)) {
      console.warn("[voice-agent] plan read failed:", subError.message);
    }
  }
  const quotaSeconds = voiceQuotaSeconds(plan);
  let usedSeconds = 0;
  {
    const { data: usage, error: usageError } = await supabase
      .from("voice_usage")
      .select("seconds")
      .eq("user_id", userId)
      .eq("day", voiceUsageDayKey())
      .maybeSingle();
    if (!usageError && usage) usedSeconds = Math.max(0, Number(usage.seconds) || 0);
    else if (usageError && !/does not exist|not found/i.test(usageError.message)) {
      console.warn("[voice-agent] usage read failed:", usageError.message);
    }
  }
  if (usedSeconds >= quotaSeconds) {
    return Response.json(
      {
        code: "VOICE_QUOTA",
        error:
          plan === "plus"
            ? "That's a lot of voice for one day — pick this up tomorrow."
            : "That's your free voice time for today — Plus unlocks unlimited.",
        plan,
        usedSeconds,
        quotaSeconds,
      },
      { status: 402 }
    );
  }

  // 3. Session shaping inputs from the client (its own data,
  //    over its own authenticated connection). `resume=1` marks
  //    a seamless RECONNECT after an unexpected drop — the
  //    greeting is then skipped so a call that hit the platform
  //    cap (maxDuration) or a network blip FEELS continuous.
  const url = new URL(req.url);
  const ctx = (url.searchParams.get("ctx") ?? "").slice(0, MAX_CTX_CHARS);
  const name = (url.searchParams.get("name") ?? "").replace(/[^A-Za-z '\-]/g, "").slice(0, 24);
  const resume = url.searchParams.get("resume") === "1";
  const hour = new Date().getUTCHours();

  return experimental_upgradeWebSocket(
    (client) => {
      // ---- the Deepgram leg ----
      const dg = new WebSocket(DG_AGENT_URL, {
        headers: { Authorization: `Token ${apiKey}` },
        perMessageDeflate: false,
      });
      dg.binaryType = "nodebuffer";

      let settingsSent = false;
      let keepAlive: ReturnType<typeof setInterval> | null = null;

      // ---- daily voice metering (quota source of truth) ----
      // Flush CONNECTED seconds every 60 s and once more at
      // close. A hard instance kill (maxDuration) loses at most
      // 59 s — in the user's favor, never against them. The RPC
      // increments atomically (migration 0016); errors are
      // logged and swallowed — metering must never kill a call.
      let meterLast = Date.now();
      const flushVoiceUsage = () => {
        const now = Date.now();
        const secs = Math.min(600, Math.round((now - meterLast) / 1000));
        meterLast = now;
        if (secs <= 0) return;
        void supabase
          .rpc("record_voice_seconds", { p_seconds: secs })
          .then(({ error }) => {
            if (error && !/does not exist|not found/i.test(error.message)) {
              console.warn("[voice-agent] usage meter failed:", error.message);
            }
          });
      };
      const meterTimer = setInterval(flushVoiceUsage, 60_000);
      const stopMetering = () => {
        clearInterval(meterTimer);
        flushVoiceUsage(); // the partial interval since the last flush
      };

      const stopKeepAlive = () => {
        if (keepAlive !== null) {
          clearInterval(keepAlive);
          keepAlive = null;
        }
      };

      const closeBoth = (code = 1000) => {
        stopKeepAlive();
        stopMetering();
        try {
          if (dg.readyState <= WebSocket.OPEN) dg.close(code);
        } catch { /* already closing */ }
        try {
          if (client.readyState <= WebSocket.OPEN) client.close(code);
        } catch { /* already closing */ }
      };

      // Server-built Settings, sent once Deepgram says hello.
      //
      // FUNCTION CALLING (protocol live-verified 2026-10-10,
      // scripts/test-voice-functions.mjs): declare tools in
      // Settings.think.functions; Deepgram then sends
      // { type: "FunctionCallRequest", functions: [{ id, name,
      // arguments, client_side }] } and expects
      // { type: "FunctionCallResponse", id, name, content } back
      // (the field is CONTENT — anything else is
      // UNPARSABLE_CLIENT_MESSAGE). The request is forwarded to
      // the browser verbatim; the browser executes against the
      // same store the UI uses and answers via
      // df:FunctionCallResponse, which this relay re-validates
      // (the name must be one WE defined) before forwarding.
      const sendSettings = () => {
        if (settingsSent) return;
        settingsSent = true;
        dg.send(
          JSON.stringify({
            type: "Settings",
            audio: {
              input: { encoding: "linear16", sample_rate: 16000 },
              output: { encoding: "linear16", sample_rate: 24000, container: "none" },
            },
            agent: {
              language: "en",
              listen: {
                provider: {
                  type: "deepgram",
                  version: "v2",
                  model: LISTEN_MODEL,
                  // responsiveness (see constants above)
                  eager_eot_threshold: EAGER_EOT_THRESHOLD,
                  eot_threshold: EOT_THRESHOLD,
                  eot_timeout_ms: EOT_TIMEOUT_MS,
                },
              },
              think: {
                provider: { type: "open_ai", model: THINK_MODEL, temperature: 0.6 },
                prompt: diaPrompt(name, ctx),
                // Voice-controlled actions — executed browser-side
                // against the user's own store.
                functions: AGENT_FUNCTIONS.map((f) => ({
                  name: f.name,
                  description: f.description,
                  parameters: f.parameters,
                })),
              },
              speak: {
                provider: {
                  type: "deepgram",
                  version: "v2",
                  model: SPEAK_MODEL,
                  speed: SPEAK_SPEED,
                },
              },
              // Spoken the moment the session is configured —
              // unless this is a resume (see above): a mid-call
              // reconnect greeting would step on the user.
              ...(resume
                ? {}
                : {
                    greeting:
                      hour >= 21 || hour < 5
                        ? `Hey ${name || "there"}. It's late — I'm here if you want to talk.`
                        : `Hey ${name || "there"}, I'm Dia. What's on your mind?`,
                  }),
            },
          })
        );
        // Fluid keeps the instance alive while the socket is open,
        // but a heartbeat costs nothing and guards idle timeouts.
        keepAlive = setInterval(() => {
          if (dg.readyState === WebSocket.OPEN) {
            dg.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 10_000);
      };

      // ---- Deepgram → browser (verbatim) ----
      dg.on("open", sendSettings);
      dg.on("message", (data, isBinary) => {
        if (client.readyState !== WebSocket.OPEN) return;
        try {
          client.send(data, { binary: isBinary });
        } catch { closeBoth(); }
      });
      dg.on("close", () => closeBoth());
      dg.on("error", () => {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "Error",
                description: "VOICE_RELAY_UPSTREAM",
              })
            );
          }
        } catch { /* closing anyway */ }
        closeBoth(1011);
      });

      // ---- browser → Deepgram (allowlisted) ----
      client.on("message", (data, isBinary) => {
        if (dg.readyState !== WebSocket.OPEN) return;
        if (isBinary) {
          // Mic audio: raw linear16 frames, passed through.
          try {
            dg.send(data, { binary: true });
          } catch { closeBoth(); }
          return;
        }
        // The honored controls: text the user typed in the talk
        // dock (spoken answers), and the browser's answer to a
        // function call we forwarded it (name re-validated against
        // the server-defined tool list).
        try {
          const msg = JSON.parse(data.toString()) as {
            type?: string;
            content?: string;
            id?: string;
            name?: string;
          };
          if (msg?.type === "df:Inject" && typeof msg.content === "string") {
            dg.send(
              JSON.stringify({
                type: "InjectUserMessage",
                content: msg.content.slice(0, 2_000),
              })
            );
          } else if (
            msg?.type === "df:FunctionCallResponse" &&
            typeof msg.id === "string" &&
            typeof msg.name === "string" &&
            typeof msg.content === "string" &&
            FUNCTION_NAMES.has(msg.name)
          ) {
            // Deepgram v1 expects { type, id, name, content } —
            // content is a short JSON string for the think model.
            dg.send(
              JSON.stringify({
                type: "FunctionCallResponse",
                id: msg.id.slice(0, 128),
                name: msg.name,
                content: msg.content.slice(0, 1_000),
              })
            );
          }
          // Everything else (including client-forged Settings) is
          // dropped — the server is authoritative.
        } catch { /* not JSON — ignore */ }
      });
      client.on("close", () => closeBoth());
      client.on("error", () => closeBoth());
    },
    // Audio frames are ~3 KB; JSON is tiny. Generous but bounded.
    { maxPayload: 64 * 1024 }
  );
}
