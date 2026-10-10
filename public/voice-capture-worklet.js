// ============================================================
// Dayflow AI — mic capture AudioWorklet processor
// ------------------------------------------------------------
// Loaded same-origin by src/lib/voice-agent.ts via
// audioWorklet.addModule("/voice-capture-worklet.js").
//
// WHY A STATIC FILE (not a Blob URL): AudioWorklet module loads
// are governed by the page's CSP **script-src** — NOT worker-src
// (worklets are script-like destinations). A blob: worklet was
// silently blocked by the production CSP (script-src 'self'
// 'unsafe-inline' has no blob:) which killed the mic pipeline
// with zero console-visible symptoms in the app: Dia's greeting
// still played, but user speech never reached Deepgram. Serving
// the processor same-origin keeps the CSP tight AND the mic
// alive. Do not convert this back to a Blob URL without adding
// blob: to script-src (and documenting why).
//
// WHAT IT DOES: downsample the input rate (usually 48 kHz) to
// 16 kHz with an averaging filter, convert to Int16 (Deepgram's
// linear16 input format), and post RMS levels alongside.
// Keep this file dependency-free and ES2020-safe — it runs in
// the AudioWorklet global scope, transpiled by nobody.
// ============================================================
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
