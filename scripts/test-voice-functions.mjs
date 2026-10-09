// ============================================================
// Live probe: Deepgram v1 Voice Agent function calling
// ------------------------------------------------------------
// Verifies the exact protocol surface for giving Dia the ability
// to ACT (log water/workouts/meals) mid-conversation:
//   1. Settings.think.functions — tool definitions
//   2. FunctionCallRequest (server → us) — { id, name, input }
//   3. FunctionCallResponse (us → server) — { id, name, output }
//   4. The agent then speaks a natural confirmation.
// Run: node scripts/test-voice-functions.mjs
// ============================================================

import WebSocket from "ws";
import { readFileSync } from "node:fs";

const KEY = (
  process.env.DEEPGRAM_API_KEY ??
  readFileSync("/home/z/my-project/.deepgram-key", "utf8")
).trim();

const URL_ = "wss://agent.deepgram.com/v1/agent/converse";

const ws = new WebSocket(URL_, {
  headers: { Authorization: `Token ${KEY}` },
  perMessageDeflate: false,
});
ws.binaryType = "nodebuffer";

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
let sawFunctionCall = false;
let spoke = false;
let audioBytes = 0;

const FUNCTIONS = [
  {
    name: "log_water",
    description:
      "Log the user's water intake. Call this whenever the user says they drank water or asks to log water.",
    parameters: {
      type: "object",
      properties: {
        amount_ml: {
          type: "number",
          description: "Amount in milliliters, e.g. 250 for a glass",
        },
      },
      required: ["amount_ml"],
    },
  },
];

ws.on("open", () => {
  log("OPEN — sending Settings with functions");
  ws.send(
    JSON.stringify({
      type: "Settings",
      audio: {
        input: { encoding: "linear16", sample_rate: 16000 },
        output: { encoding: "linear16", sample_rate: 24000, container: "none" },
      },
      agent: {
        language: "en",
        listen: { provider: { type: "deepgram", version: "v2", model: "flux-general-en" } },
        think: {
          provider: { type: "open_ai", model: "gpt-4o-mini", temperature: 0.6 },
          prompt:
            "You are Dia, a warm voice coach inside a life-tracking app. You can log the user's water via the log_water function. When the user mentions drinking water, call log_water with the amount, then confirm warmly in one short sentence.",
          functions: FUNCTIONS,
        },
        speak: { provider: { type: "deepgram", version: "v2", model: "flux-kit-en" } },
        greeting: "Hi, I'm Dia. What did you drink today?",
      },
    })
  );
  // KeepAlive so the probe isn't reaped while idle.
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
  }, 10_000);
});

ws.on("message", (data, isBinary) => {
  if (isBinary) {
    audioBytes += data.length;
    return;
  }
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }
  switch (msg.type) {
    case "Welcome":
      log("Welcome");
      break;
    case "SettingsApplied":
      log("SettingsApplied ✓ (functions accepted)");
      // Text turn instead of mic audio: InjectUserMessage.
      setTimeout(() => {
        log("→ InjectUserMessage: 'I just drank two big glasses of water, log that'");
        ws.send(
          JSON.stringify({
            type: "InjectUserMessage",
            content: "I just drank two big glasses of water, log that",
          })
        );
      }, 800);
      break;
    case "FunctionCallRequest": {
      sawFunctionCall = true;
      log("★ RAW FunctionCallRequest:", data.toString().slice(0, 500));
      const out = JSON.stringify({
        ok: true,
        message: "Logged 500 ml of water",
      });
      const respFormat = process.env.RESP_FORMAT ?? "array";
      let payload;
      if (respFormat === "array") {
        // mirrored: functions array with id/name/output
        payload = {
          type: "FunctionCallResponse",
          functions: msg.functions.map((f) => ({
            id: f.id,
            name: f.name,
            output: out,
          })),
        };
      } else if (respFormat === "single") {
        payload = { type: "FunctionCallResponse", id: msg.functions[0].id, name: msg.functions[0].name, output: out };
      } else {
        payload = { type: "FunctionCallResponse", id: msg.functions[0].id, name: msg.functions[0].name, content: out };
      }
      log("← FunctionCallResponse (" + respFormat + "):", JSON.stringify(payload).slice(0, 300));
      ws.send(JSON.stringify(payload));
      break;
    }
    case "ConversationText":
      if (msg.role === "assistant") {
        spoke = true;
        log("ASSISTANT:", String(msg.content).slice(0, 160));
      } else {
        log("USER:", String(msg.content).slice(0, 160));
      }
      break;
    case "AgentThinking":
      log("AgentThinking…");
      break;
    case "AgentAudioDone":
      log(`AgentAudioDone (audio bytes: ${audioBytes})`);
      setTimeout(() => {
        log(
          `\n=== RESULT: FunctionCallRequest ${sawFunctionCall ? "RECEIVED ✓" : "never arrived ✗"}; agent spoke: ${spoke ? "yes" : "no"} ===`
        );
        process.exit(sawFunctionCall && spoke ? 0 : 1);
      }, 1500);
      break;
    case "Error":
      log("ERROR:", JSON.stringify(msg));
      break;
    case "Warning":
      log("WARNING:", JSON.stringify(msg));
      break;
    case "History":
      break;
    default:
      log(msg.type);
  }
});

ws.on("close", (code, reason) => {
  log("CLOSE", code, reason.toString());
  process.exit(sawFunctionCall ? 0 : 1);
});
ws.on("error", (e) => {
  log("SOCKET ERROR", e.message);
  process.exit(1);
});

// Hard stop after 45s.
setTimeout(() => {
  log("timeout — aborting");
  process.exit(1);
}, 45_000);
