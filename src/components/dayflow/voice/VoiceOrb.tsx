"use client";

// ============================================================
// Dayflow AI — Dia's voice stage (reference "Dayflow (5).html" #vs)
// ------------------------------------------------------------
// The voice-first hero of the Coach pane's Talk view: Dia's new
// body — a layered SVG soul orb — plus the live waveform and the
// voice-state label. Ported 1:1 from the mockup's #ow / #wv2 /
// #vl trio (the mockup's optional WebGL layer degrades to exactly
// this SVG when unavailable — we ship the graceful path, which
// keeps the PWA at its Lighthouse budget).
//
//   orb states (data-s) : idle | listen | think | speak
//   orb moods (class)   : happy (poke) · care · sleepy (late hour)
//   eye tracking        : --ex/--ey follow the pointer (cLook)
//   audio level         : --lv from the session meters (vLoop)
//   waveform            : three phase-shifted sine paths whose
//                         amplitude tracks mic/agent level (cWave)
//
// All animation is CSS; the only JS loops are two cheap rAF/interval
// writers that touch CSS variables directly — zero React renders
// per frame. prefers-reduced-motion freezes every loop (CSS).
// ============================================================

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export type VoiceStageState = "idle" | "listen" | "think" | "speak";

/** Labels — reference vSet copy, verbatim. */
const STATE_LABELS: Record<VoiceStageState, string> = {
  idle: "Tap to talk to Dia",
  listen: "Dia is listening",
  think: "Dia is thinking",
  speak: "Dia is speaking · tap to interrupt",
};

/** Live level pair written by the session (never React state). */
export interface VoiceLevels {
  input: number;
  output: number;
}

export function VoiceOrb({
  state,
  mood,
  levelsRef,
  onPoke,
  reducedMotion,
}: {
  state: VoiceStageState;
  mood: "happy" | "care" | "sleepy" | "";
  levelsRef: RefObject<VoiceLevels>;
  onPoke: () => void;
  reducedMotion: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<SVGSVGElement>(null);
  const pathsRef = useRef<Array<SVGPathElement | null>>([null, null, null]);
  const lookRaf = useRef(0);

  // Level loop (reference vLoop/cWave): writes --lv on the orb and
  // redraws the three waveform paths from the live levels.
  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    const P = [
      [1, 1.9, 0, 1],
      [1.6, 2.7, 2.1, 0.7],
      [2.3, 3.4, 4.2, 0.5],
    ];
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const lv = levelsRef.current ?? { input: 0, output: 0 };
      const level =
        state === "listen"
          ? Math.min(1, lv.input * 1.6 + 0.08)
          : state === "speak"
            ? Math.min(1, lv.output * 1.6 + 0.08)
            : state === "think"
              ? 0.12 + 0.06 * Math.sin(t / 300)
              : 0.05;
      const orb = orbRef.current;
      if (orb) orb.style.setProperty("--lv", level.toFixed(3));
      const L = state === "idle" ? 0.05 : Math.min(1, level + 0.06);
      for (let i = 0; i < 3; i++) {
        const p = pathsRef.current[i];
        if (!p) continue;
        const [f, sp, ph, am] = P[i];
        let d = "M0 22";
        for (let x = 0; x <= 300; x += 5) {
          const env = Math.sin((Math.PI * x) / 300);
          d += `L${x} ${(22 + Math.sin((x / 300) * 12.566 * f + (t / 1000) * sp + ph) * L * 17 * am * env).toFixed(1)}`;
        }
        p.setAttribute("d", d);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, levelsRef, reducedMotion]);

  // Eye tracking (reference cLook): pointer → --ex/--ey on the
  // orb; while idle Dia glances around on her own every few s.
  useEffect(() => {
    const orb = orbRef.current;
    if (!orb || reducedMotion) return;
    const setLook = (x: number, y: number) => {
      const r = orb.getBoundingClientRect();
      const dx = (x - (r.left + r.width / 2)) / (window.innerWidth * 0.55);
      const dy = (y - (r.top + r.height / 2)) / (window.innerHeight * 0.55);
      orb.style.setProperty("--ex", Math.max(-1, Math.min(1, dx)).toFixed(2));
      orb.style.setProperty("--ey", Math.max(-1, Math.min(1, dy)).toFixed(2));
    };
    const onMove = (e: PointerEvent) => {
      if (state === "think") return; // Dia is busy thinking
      cancelAnimationFrame(lookRaf.current);
      lookRaf.current = requestAnimationFrame(() => setLook(e.clientX, e.clientY));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    const wander = setInterval(() => {
      if (state !== "idle" || document.hidden || mood === "happy") return;
      if (Math.random() < 0.55) {
        setLook(window.innerWidth * Math.random(), window.innerHeight * Math.random());
      }
    }, 3800);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(lookRaf.current);
      clearInterval(wander);
    };
  }, [state, mood, reducedMotion]);

  return (
    <div ref={rootRef} className="dfc-vs-stage" data-s={state}>
      <button
        type="button"
        className={`dfc-orbw${mood ? ` dfc-mood-${mood}` : ""}`}
        onClick={onPoke}
        aria-label="Say hi to Dia"
      >
        {/* ---- Dia's soul orb (reference ORB svg) ---- */}
        <svg ref={orbRef} className={`dfc-orb ${state}${mood ? ` ${mood}` : ""}`} viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <clipPath id="g-clip">
              <circle cx="100" cy="100" r="84" />
            </clipPath>
            <radialGradient id="g-hi" cx=".35" cy=".25" r=".8">
              <stop className="st-w" offset="0" stopOpacity=".85" />
              <stop className="st-w" offset="1" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="g-soul">
              <stop offset="0" style={{ stopColor: "var(--sl)", stopOpacity: ".8" }} />
              <stop offset=".5" style={{ stopColor: "var(--sl)", stopOpacity: ".24" }} />
              <stop offset="1" style={{ stopColor: "var(--sl)", stopOpacity: "0" }} />
            </radialGradient>
            <radialGradient id="g-core">
              <stop className="st-w" offset="0" stopOpacity=".95" />
              <stop offset=".6" style={{ stopColor: "var(--sl)", stopOpacity: ".35" }} />
              <stop offset="1" style={{ stopColor: "var(--sl)", stopOpacity: "0" }} />
            </radialGradient>
          </defs>
          {/* outer ripples */}
          <circle className="rp" cx="100" cy="100" r="84" />
          <circle className="rp r2" cx="100" cy="100" r="84" />
          <circle className="rp r3" cx="100" cy="100" r="84" />
          {/* glass body + liquid */}
          <circle className="ob" cx="100" cy="100" r="84" />
          <g clipPath="url(#g-clip)">
            <g className="lq">
              <g className="lv2">
                <path className="wv a" d="M-100 0q25-12 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0V200H-100z" />
              </g>
              <g className="lv2 b2">
                <path className="wv b" d="M-100 0q25 12 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0V200H-100z" />
              </g>
            </g>
            <circle cx="100" cy="100" r="84" fill="url(#g-hi)" />
          </g>
          <circle className="or" cx="100" cy="100" r="84" />
          {/* the soul — glow, core, wisps, ripples, thought dots */}
          <g className="soul">
            <g className="bh">
              <g className="hb">
                <circle className="sglow" cx="100" cy="100" r="70" fill="url(#g-soul)" />
                <circle className="core" cx="100" cy="100" r="34" fill="url(#g-core)" />
              </g>
            </g>
            <g className="wsp">
              <ellipse className="ws" cx="100" cy="100" rx="38" ry="11" fill="url(#g-core)" />
              <ellipse className="ws b" cx="100" cy="100" rx="38" ry="11" fill="url(#g-core)" />
              <ellipse className="ws c" cx="100" cy="100" rx="38" ry="11" fill="url(#g-core)" />
            </g>
            <circle className="sr" cx="100" cy="100" r="16" />
            <circle className="sr r2" cx="100" cy="100" r="16" />
            <circle className="sr r3" cx="100" cy="100" r="16" />
            <g className="mts">
              <circle cx="100" cy="60" r="3.8" />
              <circle cx="140" cy="100" r="3.1" />
              <circle cx="78" cy="136" r="2.7" />
            </g>
          </g>
          {/* celebration sparks (happy mood) */}
          <g className="spk">
            <path d="M30 20l2.6 6.4 6.4 2.6-6.4 2.6L30 38l-2.6-6.4L21 29l6.4-2.6z" />
            <path d="M172 70l2 4.8 4.8 2-4.8 2-2 4.8-2-4.8-4.8-2 4.8-2z" />
            <path d="M158 8l1.6 3.8 3.8 1.6-3.8 1.6L158 19l-1.6-4-3.8-1.6 3.8-1.6z" />
          </g>
        </svg>
      </button>

      {/* ---- waveform (reference #wv2) ---- */}
      <svg className="dfc-wv2" viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden="true">
        <path ref={(el) => { pathsRef.current[0] = el; }} className="wa" />
        <path ref={(el) => { pathsRef.current[1] = el; }} className="wb" />
        <path ref={(el) => { pathsRef.current[2] = el; }} className="wc" />
      </svg>

      {/* ---- voice state label (reference #vl) ---- */}
      <p className="dfc-vl" role="status" aria-live="polite">
        {STATE_LABELS[state]}
      </p>
    </div>
  );
}
