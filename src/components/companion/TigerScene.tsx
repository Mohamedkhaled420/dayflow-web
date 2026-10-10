"use client";

// ============================================================
// Focus Triad — TigerScene (Dia's 3D body, Phase: Companion)
// ------------------------------------------------------------
// Renders the white-tiger GLB (860KB, meshopt-compressed, 67k
// tris) inside a small transparent R3F canvas. The source model
// has no skeleton, so ALL life is procedural whole-body motion:
//   - float bob + lateral sway (idle breathing)
//   - mood-driven hops / droops / head tilts (see moods.ts)
//   - poke squash-and-stretch spring (volume-preserving)
//   - celebrate spin-hop
//   - subtle look-at-pointer (she watches you)
//   - soft contact shadow that tracks her height
// Reduced motion: static pose, single demand render.
// ============================================================

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as THREE from "three";
import type { CompanionMood } from "./moods";
import { Crown, Headband, StageAura } from "./Cosmetics";
import type { CompanionStage } from "@/lib/companion/progress";
import { COMPANION_LIGHTS } from "@/styles/palette";

const MODEL_URL = "/models/dia-tiger.glb";

// Mood → procedural animation parameters (amplitudes/frequencies).
const MOOD_ANIM: Record<
  CompanionMood,
  {
    bobAmp: number;
    bobFreq: number;
    hopAmp: number;
    hopFreq: number;
    swayAmp: number;
    swayFreq: number;
    tilt: number;
    spin: number;
    sink: number;
  }
> = {
  idle: { bobAmp: 0.028, bobFreq: 1.5, hopAmp: 0, hopFreq: 0, swayAmp: 0.05, swayFreq: 0.7, tilt: 0, spin: 0, sink: 0 },
  happy: { bobAmp: 0.02, bobFreq: 2.2, hopAmp: 0.1, hopFreq: 3.1, swayAmp: 0.07, swayFreq: 1.1, tilt: 0, spin: 0, sink: 0 },
  thirsty: { bobAmp: 0.012, bobFreq: 0.7, hopAmp: 0, hopFreq: 0, swayAmp: 0.03, swayFreq: 0.45, tilt: 0.13, spin: 0, sink: 0.015 },
  sleepy: { bobAmp: 0.016, bobFreq: 0.5, hopAmp: 0, hopFreq: 0, swayAmp: 0.025, swayFreq: 0.35, tilt: 0.2, spin: 0, sink: 0.03 },
  thinking: { bobAmp: 0.018, bobFreq: 1.1, hopAmp: 0, hopFreq: 0, swayAmp: 0.045, swayFreq: 0.9, tilt: 0.11, spin: 0, sink: 0 },
  celebrating: { bobAmp: 0.02, bobFreq: 2.6, hopAmp: 0.16, hopFreq: 4.2, swayAmp: 0.06, swayFreq: 1.6, tilt: 0, spin: 8.5, sink: 0 },
};

/** Shared pointer position (-1..1), updated on window pointermove. */
function usePointerRef() {
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return pointer;
}

export interface CompanionCosmetics {
  headband: boolean;
  crown: boolean;
}

function TigerModel({
  mood,
  pokeNonce,
  reducedMotion,
  cosmetics,
}: {
  mood: CompanionMood;
  pokeNonce: number;
  reducedMotion: boolean;
  cosmetics: CompanionCosmetics;
}) {
  const { scene } = useLoader(
    GLTFLoader,
    MODEL_URL,
    (loader: GLTFLoader) => {
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
  );

  const pointer = usePointerRef();

  // Clone so material tweaks never leak into the cached original.
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat && "envMapIntensity" in mat) mat.envMapIntensity = 0.55;
      }
    });
    return clone;
  }, [scene]);

  const rig = useRef<THREE.Group>(null);   // mood layer: bob/hop/sway/tilt/spin
  const poker = useRef<THREE.Group>(null); // poke layer: squash & stretch

  // Entrance (scale 0 → 1, springy) + poke spring state.
  const born = useRef<number | null>(null);
  const poked = useRef<number | null>(null);
  useEffect(() => {
    if (pokeNonce > 0) poked.current = performance.now();
  }, [pokeNonce]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (born.current === null) born.current = t;

    const anim = MOOD_ANIM[mood];
    if (!rig.current || !poker.current) return;

    // ---- entrance spring (0.7 s) ----
    const age = t - born.current;
    const enter = reducedMotion
      ? 1
      : age < 0.7
        ? 1 - Math.exp(-6 * age) * Math.cos(11 * age)
        : 1;

    // ---- mood layer ----
    const hop = anim.hopAmp > 0 ? Math.abs(Math.sin(t * anim.hopFreq)) * anim.hopAmp : 0;
    const bob = Math.sin(t * anim.bobFreq) * anim.bobAmp;
    rig.current.position.y = bob + hop - anim.sink;
    rig.current.rotation.z = Math.sin(t * anim.swayFreq) * anim.swayAmp + anim.tilt;

    // look-at-pointer: subtle yaw/pitch toward the cursor.
    const targetYaw = THREE.MathUtils.clamp(pointer.current.x * 0.32, -0.42, 0.42);
    const targetPitch = THREE.MathUtils.clamp(pointer.current.y * 0.1, -0.12, 0.12);
    if (!reducedMotion) {
      rig.current.rotation.y = THREE.MathUtils.lerp(rig.current.rotation.y, targetYaw, 0.045);
      rig.current.rotation.x = THREE.MathUtils.lerp(rig.current.rotation.x, targetPitch, 0.045);
    }

    // celebrate: continuous spin decaying over ~1.6 s
    if (anim.spin > 0) {
      const spinAge = t - (spinStart.current ?? t);
      if (spinStart.current === null) spinStart.current = t;
      rig.current.rotation.y += anim.spin * Math.exp(-2.2 * spinAge) * delta;
    } else {
      spinStart.current = null;
    }

    rig.current.scale.setScalar(0.92 * enter);

    // ---- poke layer: damped squash & stretch ----
    let sx = 1;
    let sy = 1;
    if (poked.current !== null && !reducedMotion) {
      const pt = (performance.now() - poked.current) / 1000;
      if (pt < 1.1) {
        const decay = Math.exp(-5.2 * pt);
        const osc = Math.cos(13 * pt);
        sy = 1 - 0.34 * decay * osc;
        sx = 1 + 0.24 * decay * osc;
      } else {
        poked.current = null;
      }
    }
    poker.current.scale.set(sx, sy, sx);
  });

  const spinStart = useRef<number | null>(null);

  return (
    <group ref={rig}>
      <group ref={poker}>
        <primitive object={model} />
      </group>
      {/* Worn cosmetics ride the rig (bob/look-at) but not the
          poker — she squashes, her hat stays on. */}
      {cosmetics.headband && <Headband reducedMotion={reducedMotion} />}
      {cosmetics.crown && <Crown reducedMotion={reducedMotion} />}
    </group>
  );
}

/** Soft radial contact shadow that shrinks/fades as she hops. */
function ContactShadow({ mood }: { mood: CompanionMood }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!mat.current || !mesh.current) return;
    const t = state.clock.elapsedTime;
    const anim = MOOD_ANIM[mood];
    const hop = anim.hopAmp > 0 ? Math.abs(Math.sin(t * anim.hopFreq)) * anim.hopAmp : 0;
    const lift = THREE.MathUtils.clamp(hop / 0.16, 0, 1);
    mat.current.opacity = 0.22 - lift * 0.12;
    const s = 1 - lift * 0.22;
    mesh.current.scale.set(s, s, s);
  });
  return (
    <mesh ref={mesh} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.34, 40]} />
      <meshBasicMaterial ref={mat} color={COMPANION_LIGHTS.shadow} transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

export default function TigerScene({
  mood,
  pokeNonce,
  reducedMotion,
  cosmetics,
  stage,
}: {
  mood: CompanionMood;
  pokeNonce: number;
  reducedMotion: boolean;
  cosmetics: CompanionCosmetics;
  stage: CompanionStage;
}) {
  // Warm key light (theme ivory) + cool rim (the app's water blue) —
  // palette-sourced so she always feels part of Focus Triad.
  const keyColor = useMemo(() => new THREE.Color(COMPANION_LIGHTS.keyLight), []);
  const rimColor = useMemo(() => new THREE.Color(COMPANION_LIGHTS.rimLight), []);

  return (
    <Canvas
      frameloop={reducedMotion ? "demand" : "always"}
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true }}
      camera={{ fov: 30, position: [0, 0.62, 2.35] }}
      style={{ pointerEvents: "none" }}
      onCreated={({ camera }) => camera.lookAt(0, 0.52, 0)}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[2.4, 3.4, 3.2]} intensity={1.5} color={keyColor} />
      <directionalLight position={[-3, 2.2, -2.4]} intensity={0.65} color={rimColor} />
      <ContactShadow mood={mood} />
      <StageAura stage={stage} reducedMotion={reducedMotion} />
      <TigerModel
        mood={mood}
        pokeNonce={pokeNonce}
        reducedMotion={reducedMotion}
        cosmetics={cosmetics}
      />
    </Canvas>
  );
}
