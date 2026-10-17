// ============================================================
// Focus Triad — browser voice session (talk mode engine)
// ------------------------------------------------------------
// One class owning the WHOLE browser side of a voice turn:
//   • the same-origin WebSocket to /api/ai/voice-agent (the
//     Deepgram relay — see that route for why the browser can't
//     talk to Deepgram directly),
//   • mic capture: getUserMedia → AudioWorklet → linear16
//     16 kHz mono frames (Deepgram's input format),
//   • playback: 24 kHz linear16 frames from the agent scheduled
//     into a gapless AudioBuffer queue, with barge-in flush,
//   • level meters (input + output RMS, 0..1) for the orb and
//     the reference waveform,
//   • a typed event surface the Coach pane maps onto the
//     reference state machine: idle | listen | think | speak.
//
// Protocol (client → relay): binary audio frames, plus one JSON
// control { type: "df:Inject", content } for typed turns.
// Protocol (relay → client): verbatim Deepgram events. The ones
// we consume: SettingsApplied (start streaming), UserStarted-
// Speaking (barge-in + listen), ConversationText (captions),
// AgentThinking (think), binary (speak), AgentAudioDone (drain
// watch), History (transcript), Error/Warning, Close.
//
// Reduced motion is NOT handled here — the UI decides how to
// animate; this class only reports levels and states.
// ============================================================

/** UI state, mirroring the reference (vSet). */
export type VoiceState = "idle" | "listen" | "think" | "speak";

/** One finalized turn, for the transcript sheet. */
export interface VoiceHistoryItem {
  role: "user" | "assistant";
  content: string;
}

/** One tool call Dia wants the APP to execute (Deepgram
 * FunctionCallRequest.functions[] entry, parsed). */
export interface VoiceFunctionCall {
  id: string;
  name: string;
  /** Parsed JSON arguments ({} when unparsable). */
  args: Record<string, unknown>;
}

export interface VoiceSessionEvents {
  /** State machine transitions (idle only after a full stop). */
  onState(s: VoiceState): void;
  /** Live user caption (interim + final STT text). */
  onUserText(text: string, final: boolean): void;
  /** Live agent caption — may fire repeatedly for one turn as
   *  the reply streams; the UI replaces, not appends. */
  onAgentText(text: string): void;
  /** Finalized turn for the transcript sheet. */
  onHistory(item: VoiceHistoryItem): void;
  /** Audio levels 0..1 — `in` while listening, `out` while the
   *  agent speaks. Drives the orb scale + waveform amplitude. */
  onLevel(input: number, output: number): void;
  /** Session actually opened + configured (SettingsApplied). */
  onReady(): void;
  /** Dia wants the app to DO something (log water / a workout /
   *  a meal / a block). Execute it, then call
   *  session.respondFunctionCall(id, name, content) with a short
   *  JSON result — the agent speaks the confirmation. */
  onFunctionCall(fn: VoiceFunctionCall): void;
  /** Fatal session problem — UI falls back to typed mode. */
  onError(message: string): void;
  /** The socket closed. `unexpected` is true when the session
   *  died without the user asking for it (server cap, network
   *  drop, upstream error) — the UI may seamlessly reconnect
   *  via start({ resume: true }). */
  onClose(unexpected: boolean): void;
}

/** The capture worklet is served SAME-ORIGIN from
 *  /voice-capture-worklet.js — a static file is what the
 *  production CSP allows (AudioWorklet module loads match
 *  against script-src, and blob: is deliberately NOT granted
 *  there). The inlined copy below stays as a fallback for
 *  hosts without a CSP; it MUST stay in sync with
 *  public/voice-capture-worklet.js. */
const WORKLET_URL = "/voice-capture-worklet.js";
const CAPTURE_WORKLET_FALLBACK = /* js */ `
class DFCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.rest = null;
    this.sincePost = 0;
    this.level = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    // average-groups of ratio samples into one 16k sample
    const out = [];
    let i = 0;
    if (this.rest) { out.push(this.rest); this.rest = null; }
    for (; i + this.ratio <= ch.length; i += this.ratio) {
      let acc = 0;
      for (let j = 0; j < this.ratio; j++) acc += ch[i + j];
      out.push(acc / this.ratio);
    }
    if (i < ch.length) {
      let acc = 0, n = 0;
      for (; i < ch.length; i++) { acc += ch[i]; n++; }
      this.rest = acc / Math.max(1, n);
    }
    // rms level (smoothed)
    let s = 0;
    for (let k = 0; k < out.length; k++) s += out[k] * out[k];
    const rms = Math.sqrt(s / Math.max(1, out.length));
    this.level = Math.max(this.level * 0.75, Math.min(1, rms * 4));
    this.sincePost += out.length;
    if (this.sincePost >= 1600) { // ~10 level posts / second
      this.sincePost = 0;
      this.port.postMessage({ level: this.level });
    }
    if (out.length) {
      const pcm = new Int16Array(out.length);
      for (let k = 0; k < out.length; k++) {
        pcm[k] = Math.max(-32768, Math.min(32767, Math.round(out[k] * 32767)));
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor("df-capture", DFCapture);
`;

/** Fixed audio formats, matching the relay's Settings. */
const IN_RATE = 16_000;
const OUT_RATE = 24_000;

// ------------------------------------------------------------
// ONE live voice session per tab — a module-level registry.
// The React tree can race itself (keep-alive panes, remounts,
// stale closures): a session can end up live while the UI's
// sessionRef points elsewhere or at nothing. Without a global
// arbiter those orphans stack — two mics, two greetings, double
// metering, and a stop that only kills the tracked one. Every
// new session EVICTS the previous one, and the UI can ask for
// any ghost to be killed outright.
// ------------------------------------------------------------
let liveVoiceSession: VoiceSession | null = null;

/** Is any voice session alive in this tab (even one the UI
 *  lost track of)? */
export function hasLiveVoiceSession(): boolean {
  return liveVoiceSession !== null;
}

/** Kill whatever voice session is alive in this tab — tracked
 *  or ghost. Safe when nothing is live. */
export function stopLiveVoiceSession(): void {
  liveVoiceSession?.stop();
}

export class VoiceSession {
  private ev: VoiceSessionEvents;
  private ws: WebSocket | null = null;
  private micCtx: AudioContext | null = null;
  private outCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private workletUrl: string | null = null;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private drainTimer: ReturnType<typeof setInterval> | null = null;
  private nextPlayAt = 0;
  private outLevel = 0;
  private inLevel = 0;
  private state: VoiceState = "idle";
  private ended = false;
  private agentDone = false;
  /** True once the relay accepted us and applied Settings —
   *  i.e. the session can actually LISTEN. Before this, taps
   *  must neither claim "listening" nor interrupt/stop: the
   *  socket is still handshaking and killing it would fail the
   *  whole start (and flip the UI into voice-failed mode). */
  private configured = false;
  /** While set, incoming agent audio must NOT flip the UI to
   *  "speak" — covers the brief tail of her previous turn that
   *  is still in flight right after a barge-in. */
  private suppressSpeakUntil = 0;
  /** The user interrupted the CURRENT turn — drop her remaining
   *  audio chunks until the turn formally ends (AgentAudioDone)
   *  or a new one begins. Without this, "Interrupt" only muted
   *  the beat between two chunks and she resumed mid-sentence. */
  private mutedTurn = false;

  constructor(events: VoiceSessionEvents) {
    this.ev = events;
  }

  get currentState(): VoiceState {
    return this.state;
  }

  /** Has the relay configured this session (SettingsApplied)?
   *  Until then the socket is still handshaking — there is
   *  nothing to interrupt and nothing listening yet. */
  get isLive(): boolean {
    return this.configured;
  }

  private setState(s: VoiceState) {
    if (this.state === s) return;
    this.state = s;
    this.ev.onState(s);
  }

  /**
   * Open the relay socket + (unless `micless`) the mic. Resolves
   * when the socket is OPEN (not yet SettingsApplied — watch
   * onReady), rejects on connection failure.
   *
   * `resume` marks a seamless RECONNECT after an unexpected
   * drop: the relay then skips Dia's greeting so the call feels
   * continuous (the upstream conversation context still resets
   * — that is a per-connection fact of Deepgram's agent API,
   * not a choice made here).
   */
  async start(opts: {
    ctx: string;
    name: string;
    mic: boolean;
    resume?: boolean;
  }): Promise<void> {
    if (this.ws) return;
    this.ended = false;

    // Register + evict: at most ONE live voice session per tab.
    // If a previous session somehow survived (component races,
    // remounts, a lost sessionRef), it dies NOW — its socket,
    // its mic, its metering. This is the anti-ghost guarantee.
    if (liveVoiceSession && liveVoiceSession !== this) {
      liveVoiceSession.stop();
    }
    // Deliberate "alias" of this into the module registry — the
    // registry is BY DESIGN the session's global handle.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    liveVoiceSession = this;

    // iOS/Safari gesture rule: AudioContexts created OUTSIDE the
    // tap's task can come up suspended and STAY that way — the
    // mic then feeds silence and Dia's replies never play. Both
    // contexts are created + resumed here, synchronously inside
    // the user-gesture task (start() runs from the mic button's
    // handler, before the first await below).
    try {
      if (!this.micCtx) this.micCtx = new AudioContext({ sampleRate: 48_000 });
      if (this.micCtx.state === "suspended") void this.micCtx.resume();
      if (!this.outCtx) this.outCtx = new AudioContext({ sampleRate: OUT_RATE });
      if (this.outCtx.state === "suspended") void this.outCtx.resume();
    } catch {
      // Pre-AudioContext browsers — mic loading below will then
      // fail VISIBLY instead of silently.
    }

    const qs = new URLSearchParams({ ctx: opts.ctx, name: opts.name });
    if (opts.resume) qs.set("resume", "1");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/ai/voice-agent?${qs}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    const opened = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 15_000);
      ws.addEventListener("open", () => { clearTimeout(t); resolve(); }, { once: true });
      ws.addEventListener(
        "message",
        (e) => {
          // A JSON error body (401/402/503) arrives as the first
          // frame when the relay refused the upgrade. The `code`
          // rides along on the rejected Error so callers can tell
          // a quota wall (VOICE_QUOTA) from a mic/permission
          // failure and show the right UI for each.
          if (typeof e.data === "string") {
            try {
              const m = JSON.parse(e.data) as { type?: string; error?: string; code?: string };
              if (m?.type === "Error" || m?.error) {
                clearTimeout(t);
                const err = new Error(m.error ?? "voice unavailable") as Error & {
                  code?: string;
                };
                if (m.code) err.code = m.code;
                reject(err);
              }
            } catch { /* normal events flow below */ }
          }
        },
        { once: true }
      );
      ws.addEventListener("close", () => { clearTimeout(t); reject(new Error("closed")); }, { once: true });
    });
    try {
      await opened;
    } catch (e) {
      // The socket never opened (or the relay refused the
      // upgrade): make sure nothing dangles in CONNECTING, and
      // that the registry doesn't keep a dead session wedged
      // (that would make every later mic tap a ghost-kill).
      if (liveVoiceSession === this) liveVoiceSession = null;
      try { ws.close(); } catch { /* already gone */ }
      throw e;
    }

    if (opts.mic) {
      try {
        await this.openMic();
      } catch (e) {
        // The socket is open but the mic is not: WITHOUT this
        // the session would leak — an orphan relay socket that
        // keeps metering quota (and a live Deepgram leg) until
        // the platform cap kills it, with zero handlers attached
        // (they are only wired after openMic below). End it now.
        this.stop();
        throw e;
      }
    }

    ws.addEventListener("message", (e) => this.onFrame(e.data));
    ws.addEventListener("close", () => this.handleClose());
    ws.addEventListener("error", () => { /* close handler drives UI */ });
  }

  /** Text the user typed — the agent answers by voice. */
  inject(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "df:Inject", content: text }));
      this.setState("think");
      this.ev.onUserText(text, true);
    }
  }

  /** Answer a FunctionCallRequest — `content` is a short JSON
   *  string the think model reads before replying. */
  respondFunctionCall(id: string, name: string, content: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "df:FunctionCallResponse",
          id,
          name,
          content: content.slice(0, 1_000),
        })
      );
    }
  }

  /** Stop agent audio locally (barge / tap-to-interrupt). The
   *  remainder of the CURRENT turn is dropped, not just muted:
   *  the upstream keeps streaming for a beat after the tap. */
  interrupt() {
    this.flushPlayback();
    this.agentDone = false;
    this.mutedTurn = true;
  }

  /** Graceful end of the whole session. */
  stop() {
    this.ended = true;
    this.configured = false;
    if (liveVoiceSession === this) liveVoiceSession = null;
    // Kill scheduled audio BEFORE tearing the contexts down so
    // nothing plays past the tap, and no post-stop frame can
    // resurrect playback (onFrame ignores frames once ended).
    this.flushPlayback();
    this.agentDone = false;
    try { this.ws?.close(1000); } catch { /* noop */ }
    this.teardownAudio();
    this.setState("idle");
  }

  // ---------------- inbound protocol ----------------

  private onFrame(data: unknown) {
    // The session was stopped — ignore stragglers. Without this,
    // a frame landing after stop() could schedule audio on a
    // FRESH AudioContext (playChunk creates one when missing)
    // and Dia would keep talking past her own funeral.
    if (this.ended) return;
    if (typeof data === "string") {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(data) as Record<string, unknown>; } catch { return; }
      switch (msg.type) {
        case "SettingsApplied":
          this.nextPlayAt = this.outCtx ? this.outCtx.currentTime : 0;
          this.configured = true;
          this.setState("listen");
          this.ev.onReady();
          break;
        case "UserStartedSpeaking":
          // Barge-in: kill scheduled audio + buffered frames NOW.
          this.flushPlayback();
          this.agentDone = false;
          // Her interrupted turn's audio can keep arriving for a
          // beat — that tail must not flip the UI back to
          // "speak" while the user is talking. (Audio-wise a
          // sub-second tail after a barge is normal voice UX;
          // muting the whole NEXT reply would be worse — the
          // upstream does not always emit AgentThinking, so
          // mutedTurn is reserved for the explicit tap.)
          this.suppressSpeakUntil = Date.now() + 800;
          this.setState("listen");
          break;
        case "ConversationText": {
          const role = msg.role as string;
          const content = (msg.content as string) ?? "";
          if (role === "user") this.ev.onUserText(content, false);
          else {
            // A fresh assistant reply is streaming — whatever was
            // interrupted before it is over. (AgentThinking is not
            // guaranteed upstream, so this is the reliable unmute.)
            this.mutedTurn = false;
            this.ev.onAgentText(content);
          }
          break;
        }
        case "AgentThinking":
          // A new agent turn genuinely began — any barge
          // suppression or turn mute is over.
          this.suppressSpeakUntil = 0;
          this.mutedTurn = false;
          this.setState("think");
          break;
        case "FunctionCallRequest": {
          // Deepgram v1 shape: { functions: [{ id, name,
          // arguments (JSON string), client_side }], ... } — one
          // request can batch parallel calls; emit each separately.
          const fns = Array.isArray(msg.functions) ? msg.functions : [];
          for (const f of fns) {
            const id = typeof f?.id === "string" ? f.id : "";
            const name = typeof f?.name === "string" ? f.name : "";
            if (!id || !name) continue;
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(typeof f.arguments === "string" ? f.arguments : "{}") as Record<string, unknown>;
            } catch { /* model sent bad JSON — empty args */ }
            this.suppressSpeakUntil = 0;
            this.mutedTurn = false;
            this.setState("think");
            this.ev.onFunctionCall({ id, name, args });
          }
          break;
        }
        case "AgentAudioDone":
          this.agentDone = true;
          this.mutedTurn = false; // the turn is over — unmute
          this.watchDrain();
          break;
        case "History":
          if (msg.role === "user" || msg.role === "assistant") {
            this.ev.onHistory({ role: msg.role, content: (msg.content as string) ?? "" });
          }
          break;
        case "Error":
          this.ev.onError(String(msg.description ?? "voice error"));
          break;
        case "Warning":
        case "Welcome":
        case "LatencyReport":
        case "EndOfTurn":
        default:
          break;
      }
      return;
    }
    // Binary: agent audio, linear16 24 kHz mono.
    this.playChunk(data as ArrayBuffer);
  }

  // ---------------- mic ----------------

  private async openMic() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.micStream = stream;
    // Abort-safe: if the session was ended while getUserMedia
    // was pending, the stream just resolved onto a DEAD session
    // — release it HERE or the track (and the browser's mic
    // indicator) leaks forever. This was the "Dia is still
    // listening" ghost: stop raced the mic open, the track
    // landed after teardown, and nothing ever stopped it.
    if (this.ended) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      this.micStream = null;
      throw new Error("session ended while opening the mic");
    }
    const ctx = this.micCtx ?? new AudioContext({ sampleRate: 48_000 });
    this.micCtx = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createMediaStreamSource(stream);

    // Load the capture processor. Order matters:
    //   1. the same-origin static file — the only path the
    //      production CSP permits (script-src 'self'; worklets
    //      are NOT covered by worker-src — see
    //      public/voice-capture-worklet.js for the postmortem),
    //   2. the inline Blob fallback — for hosts without a CSP.
    // A silent micless session is FORBIDDEN: if both fail the
    // user would hear Dia but never be heard — the exact
    // "stopped listening" failure this class must never hide.
    const loadWorklet = async () => {
      try {
        await ctx.audioWorklet.addModule(WORKLET_URL);
        return;
      } catch {
        /* fall through to the blob attempt */
      }
      const blob = new Blob([CAPTURE_WORKLET_FALLBACK], { type: "text/javascript" });
      this.workletUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(this.workletUrl);
    };

    let node: AudioWorkletNode;
    try {
      await loadWorklet();
      node = new AudioWorkletNode(ctx, "df-capture");
    } catch (e) {
      this.ev.onError("Microphone capture could not start — voice is unavailable.");
      throw e instanceof Error ? e : new Error("worklet failed");
    }
    node.port.onmessage = (e: MessageEvent) => {
      const d = e.data as ArrayBuffer | { level: number };
      if (d instanceof ArrayBuffer) {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(d);
      } else {
        this.inLevel = d.level;
        this.reportLevels();
      }
    };
    src.connect(node);
    // Do NOT connect to destination — no echo.
    this.worklet = node;
  }

  // ---------------- playback ----------------

  private playChunk(buf: ArrayBuffer) {
    // Interrupted turn — the user asked for quiet; drop the
    // rest of this turn's audio instead of scheduling it.
    if (this.mutedTurn) return;
    if (!this.outCtx) this.outCtx = new AudioContext({ sampleRate: OUT_RATE });
    const ctx = this.outCtx;
    if (ctx.state === "suspended") void ctx.resume();

    const ints = new Int16Array(buf);
    if (ints.length === 0) return;
    const floats = new Float32Array(ints.length);
    let rms = 0;
    for (let i = 0; i < ints.length; i++) {
      const v = ints[i] / 32768;
      floats[i] = v;
      rms += v * v;
    }
    rms = Math.sqrt(rms / ints.length);

    const audio = ctx.createBuffer(1, floats.length, OUT_RATE);
    audio.copyToChannel(floats, 0);

    const source = ctx.createBufferSource();
    source.buffer = audio;
    source.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime + 0.02, this.nextPlayAt);
    source.start(startAt);
    this.nextPlayAt = startAt + audio.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.watchDrain();
    };

    // Output level decays as the scheduled audio plays out.
    this.outLevel = Math.min(1, rms * 2.5);
    // New audio invalidates any earlier AgentAudioDone — the
    // upstream streams sentence-by-sentence, and a done event
    // from a PREVIOUS turn must not drain this one mid-reply
    // (that race stranded the orb on "listen" while she was
    // still talking).
    this.agentDone = false;
    // The old `state !== "listen"` guard kept the GREETING on
    // "listen" forever (SettingsApplied sets listen before the
    // first chunk lands). Barge-in tails are now covered by the
    // suppression window instead, so genuinely audible agent
    // audio always shows "speak".
    if (Date.now() >= this.suppressSpeakUntil) this.setState("speak");
  }

  private watchDrain() {
    if (!this.agentDone) return;
    if (this.sources.size > 0) return;
    if (this.drainTimer !== null) return;
    // Small grace: the next chunk of a long reply can land right
    // after AgentAudioDone + source end (chunk scheduling race).
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      if (this.agentDone && this.sources.size === 0 && !this.ended) {
        // Session stays live and listening — Flux keeps the turn
        // open for the user's next utterance.
        this.setState("listen");
      }
    }, 350);
  }

  private flushPlayback() {
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already ended */ }
    }
    this.sources.clear();
    this.nextPlayAt = this.outCtx ? this.outCtx.currentTime : 0;
    this.outLevel = 0;
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
  }

  // ---------------- lifecycle ----------------

  private reportLevels() {
    const decayedOut = this.outLevel;
    this.outLevel = Math.max(0, this.outLevel - 0.08);
    this.ev.onLevel(this.state === "listen" ? this.inLevel : 0, this.state === "speak" ? decayedOut : 0);
  }

  private handleClose() {
    const wasLive = this.ws !== null;
    const unexpected = wasLive && !this.ended;
    this.ws = null;
    if (liveVoiceSession === this) liveVoiceSession = null;
    if (!wasLive) return;
    this.teardownAudio();
    this.flushPlayback();
    this.agentDone = false;
    this.setState("idle");
    this.ev.onClose(unexpected);
  }

  private teardownAudio() {
    try { this.worklet?.disconnect(); } catch { /* noop */ }
    this.worklet = null;
    try { this.micStream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    this.micStream = null;
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
    const mic = this.micCtx;
    this.micCtx = null;
    if (mic && mic.state !== "closed") void mic.close().catch(() => undefined);
    // The output context is reused across turns within a session
    // and closed with the session.
    const out = this.outCtx;
    this.outCtx = null;
    if (out && out.state !== "closed") void out.close().catch(() => undefined);
    this.inLevel = 0;
    this.outLevel = 0;
  }
}

/** Cheap level sampler when only playback matters (SSE fallback
 *  speaking through speechSynthesis has no audio graph). */
export function fakeLevelPulse(): number {
  return 0.25 + Math.random() * 0.5;
}

// Keep IN_RATE referenced for future format changes / debugging.
void IN_RATE;
