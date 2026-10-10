"use client";

// ============================================================
// Focus Triad — Dia's voice stage (reference "Dayflow (5).html" #vs)
// ------------------------------------------------------------
// The voice-first hero of the Coach pane's Talk view: Dia's new
// body — the CRYSTALIZED BALL (ogl, ./CrystalizedBall.tsx) — plus
// the live waveform and the voice-state label.
//
//   orb states (data-s) : idle | listen | think | speak
//   orb moods (class)   : happy (poke) · care · sleepy (late hour)
//   state → ball        : color tint + energy ladder (crackle /
//                         sparks / speed / glow below), audio level
//                         streams through levelRef → the ball's
//                         surge envelope (breathes with the voice,
//                         zero React renders per frame)
//   eye tracking        : --ex/--ey follow the pointer (cLook) —
//                         SVG fallback only
//   audio level         : --lv from the session meters (vLoop) —
//                         fed to BOTH the SVG (CSS) and the ball
//   waveform            : three phase-shifted sine paths whose
//                         amplitude tracks mic/agent level (cWave)
//
// Without WebGL2 the SVG glass shell stays fully visible (the
// crystal ball reports !ready and never mounts a canvas). All
// animation is CSS + the ball's own GL loop; the only JS loops
// here are two cheap rAF writers that touch CSS variables
// directly. prefers-reduced-motion freezes every loop (the ball
// renders one static frame on its own).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";

import { BALL_STATE_LOOK } from "./ball-looks";

// Code-split: the ogl + shader payload never touches the server
// or the main chunk (same contract the vendored SoulOrb had).
const CrystalizedBall = dynamic(() => import("./CrystalizedBall").then((m) => m.default), { ssr: false });

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
  active,
}: {
  state: VoiceStageState;
  mood: "happy" | "care" | "sleepy" | "";
  levelsRef: RefObject<VoiceLevels>;
  onPoke: () => void;
  reducedMotion: boolean;
  /** On-stage (this Coach pane visible AND Talk view). Pauses the
   * GL ball + pointer tracking when false (reference cBallRun). */
  active: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<SVGSVGElement>(null);
  const bwRef = useRef<HTMLDivElement>(null);
  const pathsRef = useRef<Array<SVGPathElement | null>>([null, null, null]);
  const lookRaf = useRef(0);
  /** Live audio level for the crystal ball (0..1, per-frame read). */
  const ballLevelRef = useRef(0);
  const [gl, setGl] = useState(false);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  // Phone budget: coarse pointers / small viewports run fewer
  // dust particles (the field pass is resolution-capped by the
  // ball's own 4.5M-pixel budget; this trims the vertex load).
  const particleCount = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse), (max-width: 640px)").matches
        ? 8000
        : 15000,
    []
  );

  const look = BALL_STATE_LOOK[state] ?? BALL_STATE_LOOK.idle;
  // Late-hour mood: dim + slow the ball a touch.
  const moodGlow = mood === "sleepy" ? -0.2 : mood === "happy" ? 0.12 : 0;
  const moodSpeed = mood === "sleepy" ? 0.75 : 1;

  // Level loop (reference vLoop/cWave): writes --lv on the orb,
  // redraws the three waveform paths from the live levels AND
  // feeds the crystal ball's energy envelope.
  //
  // IDLE keeps a gentle RESTING wave (~0.16 amplitude, the mockup's
  // flat 0.05 left a ~66px dead band under the orb — the "big blank
  // space" on the Coach page). The loop also stops drawing while
  // this pane is off-stage or the tab is hidden (reference cBallRun
  // battery rule), and prefers-reduced-motion gets ONE static
  // resting frame instead of a live loop.
  useEffect(() => {
    const draw = (t: number, level: number) => {
      const orb = orbRef.current;
      if (orb) orb.style.setProperty("--lv", level.toFixed(3));
      ballLevelRef.current = state === "idle" ? level * 0.5 : level;
      const L = state === "idle" ? 0.16 : Math.min(1, level + 0.06);
      const P = [
        [1, 1.9, 0, 1],
        [1.6, 2.7, 2.1, 0.7],
        [2.3, 3.4, 4.2, 0.5],
      ];
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

    const currentLevel = () => {
      const lv = levelsRef.current ?? { input: 0, output: 0 };
      if (state === "listen") return Math.min(1, lv.input * 1.6 + 0.08);
      if (state === "speak") return Math.min(1, lv.output * 1.6 + 0.08);
      if (state === "think") return 0.12 + 0.06 * Math.sin(performance.now() / 300);
      return 0.05;
    };

    if (reducedMotion) {
      // One static resting frame — the wave is still VISIBLE (the
      // mockup's strokes), it just never animates.
      draw(0, 0.05);
      return;
    }

    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      // Off-stage (keep-alive pane not on the Coach tab) or hidden
      // tab: skip the work entirely, resume on the next frame.
      if (!active || document.hidden) return;
      draw(t, currentLevel());
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ballLevelRef.current = 0;
    };
  }, [state, levelsRef, reducedMotion, active]);

  // Eye tracking (reference cLook) — SVG fallback only. Pointer →
  // --ex/--ey on the orb; while idle Dia glances around on her own
  // every few s.
  useEffect(() => {
    const orb = orbRef.current;
    if (!orb || reducedMotion || gl) return;
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
  }, [state, mood, reducedMotion, gl]);

  // Poke (reference cHappy): squash-stretch on the SVG shell (when
  // it's the visible body) — with the crystal ball live, its own
  // pointerdown kick provides the burst of arcs + particle stir.
  // The parent's mood/haptics fire either way.
  const poke = () => {
    if (!reducedMotion && !gl) {
      orbRef.current
        ?.animate(
          [
            { transform: "scale(1, 1)" },
            { transform: "scale(1.13, 0.84)", offset: 0.25 },
            { transform: "scale(0.92, 1.12)", offset: 0.55 },
            { transform: "scale(1, 1)" },
          ],
          { duration: 560, easing: "ease-out" },
        )
        ?.finished.catch(() => {
          /* cancelled — fine */
        });
    }
    onPoke();
  };

  return (
    <div ref={rootRef} className="dfc-vs-stage" data-s={state}>
      <button
        type="button"
        className={`dfc-orbw${gl ? " gl" : ""}${mood ? ` dfc-mood-${mood}` : ""}`}
        onClick={poke}
        aria-label="Say hi to Dia"
      >
        {/* the crystal ball (replaces the flowing-light #bw layer) —
            inset -10% so the glow bleeds past the glass like the
            reference; the ball fills ~103% of the wrapper */}
        <div ref={bwRef} className="dfc-bw" aria-hidden="true">
          <CrystalizedBall
            preset="plasma"
            color={look.color}
            theme={dark ? "dark" : "light"}
            size={0.86}
            particleCount={particleCount}
            crackle={look.crackle}
            sparks={look.sparks}
            speed={look.speed * moodSpeed}
            glow={look.glow + moodGlow}
            haze={look.haze}
            fill={state === "think" ? 0.62 : 0.5}
            levelRef={ballLevelRef}
            paused={!active}
            interactive
            hoverStrength={0.7}
            onReady={setGl}
          />
        </div>
        {/* ---- Dia's glass shell (SVG fallback, no WebGL2) ---- */}
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
