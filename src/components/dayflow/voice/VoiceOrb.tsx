"use client";

// ============================================================
// Dayflow AI — Dia's voice stage (reference "Dayflow (5).html" #vs)
// ------------------------------------------------------------
// The voice-first hero of the Coach pane's Talk view: Dia's new
// body — the flowing-light SOUL ORB — plus the live waveform and
// the voice-state label. Ported 1:1 from the mockup's #ow / #bw /
// #wv2 / #vl quartet: the mockup layers a WebGL energy ball
// (SoulOrb, vendored in ./soul-orb.js — the "isn't as I attached"
// piece) BEHIND the SVG glass shell; when GL is live the shell's
// own soul glow + ripples hide (.gl, reference line: .orbw.gl
// #orb .soul,.rp{display:none}) and the SVG keeps only the glass
// body + liquid + outline. Without WebGL2 the SVG degrades to
// exactly the mockup's fallback — same paths, now correctly
// colored via --sl (the Phase-16 port left it undefined, which
// painted the soul gradients black).
//
//   orb states (data-s) : idle | listen | think | speak
//   orb moods (class)   : happy (poke) · care · sleepy (late hour)
//   eye tracking        : --ex/--ey follow the pointer (cLook)
//   audio level         : --lv from the session meters (vLoop) —
//                         fed to BOTH the SVG (CSS) and the GL ball
//                         (level())
//   waveform            : three phase-shifted sine paths whose
//                         amplitude tracks mic/agent level (cWave)
//
// All animation is CSS; the only JS loops are two cheap rAF/interval
// writers that touch CSS variables directly — zero React renders
// per frame. prefers-reduced-motion freezes every loop (CSS + the
// ball's own media-query gate — it renders one static frame).
// ============================================================

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useTheme } from "next-themes";

/** The vendored SoulOrb instance (./soul-orb.js) — structural type
 * so the .js module needs no declarations. */
interface SoulOrbHandle {
  set(opts: {
    state?: string;
    mood?: string;
    dark?: boolean;
    paused?: boolean;
    active?: boolean;
  }): void;
  level(v: number): void;
  nudge(v: number): void;
  destroy(): void;
}

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
  const ballRef = useRef<SoulOrbHandle | null>(null);
  const pathsRef = useRef<Array<SVGPathElement | null>>([null, null, null]);
  const lookRaf = useRef(0);
  const [gl, setGl] = useState(false);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

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
      ballRef.current?.level(level);
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

  // The flowing-light ball (reference cBallInit): dynamically
  // imported so the ~54KB shader bundle never touches the server
  // or the main chunk. Degrades to the SVG soul when WebGL2 is
  // missing (createSoulOrb → null → no .gl class).
  useEffect(() => {
    let dead = false;
    void import("./soul-orb").then((mod) => {
      if (dead || !bwRef.current) return;
      try {
        ballRef.current = mod.createSoulOrb(bwRef.current, {
          state,
          mood,
          dark,
          paused: !active,
          active,
        }) as SoulOrbHandle | null;
      } catch {
        ballRef.current = null;
      }
      setGl(!!ballRef.current);
    });
    return () => {
      dead = true;
      ballRef.current?.destroy();
      ballRef.current = null;
    };
    // init-once; live values flow through the effects below
  }, []);

  // Live state → the ball (reference cBallState). gl in the deps:
  // re-apply once the async import actually creates the ball, so
  // values that changed while it streamed in are not lost.
  useEffect(() => {
    ballRef.current?.set({ state, mood, dark });
  }, [state, mood, dark, gl]);

  // Stage visibility → pause/resume (reference cBallRun: the
  // keep-alive pane can be off-tab while still mounted).
  useEffect(() => {
    ballRef.current?.set({ paused: !active, active });
  }, [active, gl]);

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

  // Poke (reference cHappy): squash-stretch on the shell + a
  // burst of energy in the ball + the parent's mood/haptics.
  const poke = () => {
    if (!reducedMotion) {
      ballRef.current?.nudge(0.9);
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
        {/* the flowing-light ball (reference #bw) — canvas appended
            here by the vendored SoulOrb; inset -10% so the glow
            bleeds past the glass like the reference */}
        <div ref={bwRef} className="dfc-bw" aria-hidden="true" />
        {/* ---- Dia's glass shell (reference ORB svg) ---- */}
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
