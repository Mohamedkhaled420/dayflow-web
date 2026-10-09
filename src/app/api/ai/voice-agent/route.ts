// ============================================================
// Dayflow AI — Voice agent WebSocket relay (Deepgram v1/converse)
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
//   Standard think model costs the same — gpt-4o-mini (default
//   here, the most battle-tested for voice latency) and
//   gemini-3.1-flash-lite cost IDENTICALLY, so the model is a
//   pure env swap with zero cost delta. Advanced-tier LLMs
//   (gpt-5, claude-sonnet, gemini-pro) triple the per-minute
//   rate and are deliberately not used.
// ============================================================

import WebSocket from "ws";
import { createClient } from "@/utils/supabase/server";
import { experimental_upgradeWebSocket } from "@vercel/functions";

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
const THINK_MODEL = process.env.DEEPGRAM_THINK_MODEL ?? "gpt-4o-mini";
const SPEAK_MODEL = process.env.DEEPGRAM_SPEAK_MODEL ?? "flux-kit-en";

/**
 * Same auth gate as /api/ai/coach (Amendment #12): the canonical
 * cookie-session client first. A browser WebSocket handshake
 * cannot carry a Bearer header, so unlike the coach route there
 * is no Bearer leg — cookie only.
 */
async function verifyRequester(): Promise<string | null> {
  const cookieClient = await createClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  return user?.id ?? null;
}

function diaPrompt(name: string, ctx: string): string {
  const lines = [
    "# Role",
    "You are Dia, the warm voice companion inside Dayflow — a calm, private life-tracking app.",
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
  const userId = await verifyRequester();
  if (!userId) {
    return Response.json(
      { code: "INVALID_SESSION", error: "Sign in again — your session expired." },
      { status: 401 }
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

  // 3. Session shaping inputs from the client (its own data,
  //    over its own authenticated connection).
  const url = new URL(req.url);
  const ctx = (url.searchParams.get("ctx") ?? "").slice(0, MAX_CTX_CHARS);
  const name = (url.searchParams.get("name") ?? "").replace(/[^A-Za-z '\-]/g, "").slice(0, 24);
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

      const stopKeepAlive = () => {
        if (keepAlive !== null) {
          clearInterval(keepAlive);
          keepAlive = null;
        }
      };

      const closeBoth = (code = 1000) => {
        stopKeepAlive();
        try {
          if (dg.readyState <= WebSocket.OPEN) dg.close(code);
        } catch { /* already closing */ }
        try {
          if (client.readyState <= WebSocket.OPEN) client.close(code);
        } catch { /* already closing */ }
      };

      // Server-built Settings, sent once Deepgram says hello.
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
                provider: { type: "deepgram", version: "v2", model: LISTEN_MODEL },
              },
              think: {
                provider: { type: "open_ai", model: THINK_MODEL, temperature: 0.6 },
                prompt: diaPrompt(name, ctx),
              },
              speak: {
                provider: { type: "deepgram", version: "v2", model: SPEAK_MODEL },
              },
              // Spoken the moment the session is configured.
              greeting:
                hour >= 21 || hour < 5
                  ? `Hey ${name || "there"}. It's late — I'm here if you want to talk.`
                  : `Hey ${name || "there"}, I'm Dia. What's on your mind?`,
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
        // The ONLY honored control: text the user typed in the
        // talk dock, so typed input gets a spoken answer too.
        try {
          const msg = JSON.parse(data.toString()) as { type?: string; content?: string };
          if (msg?.type === "df:Inject" && typeof msg.content === "string") {
            dg.send(
              JSON.stringify({
                type: "InjectUserMessage",
                content: msg.content.slice(0, 2_000),
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
