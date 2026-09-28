// ============================================================
// Dayflow — Dia's cosmetics & evolution auras (three.js)
// ------------------------------------------------------------
// Procedural accessories worn by the white tiger. The GLB has no
// rig, so everything here is built from primitives and parented
// INSIDE the mood rig group (she bobs, they bob; she squashes,
// they stay on — worn, not painted).
//
// Placement was calibrated against a rendered screenshot of the
// model (head center ≈ world (0, 0.74), forehead ≈ y 0.82, head
// top ≈ y 0.885, head radius ≈ 0.28) then converted into rig
// space by dividing by the rig's 0.92 scale. Tunables live in
// CALIB below — tweak there, never inline.
//
// Unlocks (see companionProgress store):
//   - Headband: first ever personal record
//   - Crown:    30-day activity streak
//   - Stage aura: Cub (none) -> Hunter (cool halo) -> Legend
//     (gold halo + orbiting sparks)
// ============================================================

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { COMPANION_COSMETICS } from "@/styles/palette";
import type { CompanionStage } from "@/lib/companion/progress";

/** Rig-space placement (rig scales everything by 0.92). */
const CALIB = {
  headbandY: 0.893, // forehead band height
  headbandRadius: 0.235, // hugs the forehead, rides between the ears
  headbandTilt: -0.1, // front dips slightly toward the eyes
  crownY: 0.985, // sits just above the ear tops
  crownRadius: 0.15,
  auraY: 0.035,
  auraRadius: 0.42,
} as const;

/** Shared unlock-pop entrance: overshoot scale-in on mount. */
function usePop(reducedMotion: boolean) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  useEffect(() => {
    born.current = null;
  }, []);
  useFrame((state) => {
    if (!ref.current) return;
    if (born.current === null) born.current = state.clock.elapsedTime;
    const age = state.clock.elapsedTime - born.current;
    const pop = reducedMotion
      ? 1
      : age < 0.6
        ? 1 - Math.exp(-7 * age) * Math.cos(13 * age)
        : 1;
    ref.current.scale.setScalar(Math.max(0.001, pop));
  });
  return ref;
}

// ---------------------------------------------------------------
// Headband — coral training band with a side knot (first PR)
// ---------------------------------------------------------------

export function Headband({ reducedMotion }: { reducedMotion: boolean }) {
  const pop = usePop(reducedMotion);
  const band = useRef<THREE.MeshStandardMaterial>(null);

  return (
    <group ref={pop} position={[0, CALIB.headbandY, 0]} rotation={[CALIB.headbandTilt, 0, 0.05]}>
      <mesh castShadow={false}>
        <torusGeometry args={[CALIB.headbandRadius, 0.045, 12, 40]} />
        <meshStandardMaterial
          ref={band}
          color={COMPANION_COSMETICS.headband}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
      {/* side knot — a little scrunch of fabric, tiger-approved */}
      <mesh position={[CALIB.headbandRadius * 0.92, 0.02, 0.05]}>
        <sphereGeometry args={[0.062, 12, 10]} />
        <meshStandardMaterial
          color={COMPANION_COSMETICS.headbandKnot}
          roughness={0.6}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[CALIB.headbandRadius * 0.98, -0.03, -0.02]}>
        <sphereGeometry args={[0.04, 10, 8]} />
        <meshStandardMaterial
          color={COMPANION_COSMETICS.headbandKnot}
          roughness={0.6}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------
// Crown — gold with three spikes and a front gem (30-day streak)
// ---------------------------------------------------------------

export function Crown({ reducedMotion }: { reducedMotion: boolean }) {
  const pop = usePop(reducedMotion);
  const gold = {
    color: COMPANION_COSMETICS.crown,
    metalness: 0.75,
    roughness: 0.28,
    emissive: COMPANION_COSMETICS.crown,
    emissiveIntensity: 0.12,
  } as const;

  // Three spikes in a front-facing arc (front + two shoulders).
  const spikes: { angle: number; h: number; r: number }[] = [
    { angle: 0, h: 0.13, r: 0.036 }, // front
    { angle: Math.PI * 0.55, h: 0.1, r: 0.03 }, // left shoulder
    { angle: -Math.PI * 0.55, h: 0.1, r: 0.03 }, // right shoulder
  ];

  return (
    <group ref={pop} position={[0, CALIB.crownY, 0]} rotation={[-0.05, 0, 0.1]}>
      <mesh castShadow={false}>
        <torusGeometry args={[CALIB.crownRadius, 0.028, 10, 32]} />
        <meshStandardMaterial {...gold} />
      </mesh>
      {spikes.map((s, i) => {
        const x = Math.sin(s.angle) * CALIB.crownRadius * 0.92;
        const z = Math.cos(s.angle) * CALIB.crownRadius * 0.92;
        return (
          <mesh
            key={i}
            position={[x, s.h / 2 + 0.015, z]}
            rotation={[Math.cos(s.angle) * 0.22, 0, -Math.sin(s.angle) * 0.22]}
          >
            <coneGeometry args={[s.r, s.h, 5]} />
            <meshStandardMaterial {...gold} flatShading />
          </mesh>
        );
      })}
      {/* front gem — the streak jewel */}
      <mesh position={[0, 0.052, CALIB.crownRadius * 0.94]}>
        <icosahedronGeometry args={[0.034, 0]} />
        <meshStandardMaterial
          color={COMPANION_COSMETICS.crownGem}
          metalness={0.3}
          roughness={0.15}
          emissive={COMPANION_COSMETICS.crownGem}
          emissiveIntensity={0.35}
          flatShading
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------
// Stage aura — the evolution halo under her
// ---------------------------------------------------------------

export function StageAura({
  stage,
  reducedMotion,
}: {
  stage: CompanionStage;
  reducedMotion: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const sparks = useRef<THREE.Group>(null);

  const isLegend = stage === "legend";
  const color = isLegend ? COMPANION_COSMETICS.auraLegend : COMPANION_COSMETICS.auraHunter;
  const baseOpacity = isLegend ? 0.5 : 0.32;
  const auraColor = useMemo(() => new THREE.Color(color), [color]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (mat.current) {
      mat.current.opacity = reducedMotion
        ? baseOpacity
        : baseOpacity + Math.sin(t * 1.8) * (baseOpacity * 0.35);
    }
    if (ring.current && !reducedMotion) {
      ring.current.rotation.z = t * 0.5;
      const s = 1 + Math.sin(t * 1.8) * 0.04;
      ring.current.scale.set(s, s, 1);
    }
    if (sparks.current && !reducedMotion) {
      sparks.current.rotation.y = t * 0.9;
    }
  });

  if (stage === "cub") return null;

  return (
    <group position={[0, CALIB.auraY, 0]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[CALIB.auraRadius, 0.011, 8, 48]} />
        <meshBasicMaterial
          ref={mat}
          color={auraColor}
          transparent
          opacity={baseOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]}>
        <ringGeometry args={[CALIB.auraRadius - 0.1, CALIB.auraRadius - 0.085, 40]} />
        <meshBasicMaterial
          color={auraColor}
          transparent
          opacity={baseOpacity * 0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {isLegend && (
        <group ref={sparks}>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2;
            return (
              <mesh
                key={i}
                position={[Math.cos(a) * (CALIB.auraRadius + 0.05), 0.14 + i * 0.05, Math.sin(a) * (CALIB.auraRadius + 0.05)]}
              >
                <icosahedronGeometry args={[0.02, 0]} />
                <meshBasicMaterial
                  color={auraColor}
                  transparent
                  opacity={0.85}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
}
