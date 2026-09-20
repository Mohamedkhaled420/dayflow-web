"use client";

// ExerciseThumb — visual tile for exercises everywhere they're listed
// (picker rows, AI plan cards, logger cards).
//
// Renders the generated illustration from /media/exercises/ when one
// exists (see docs/media-assets.md + scripts/sync-media.mjs); until
// then it degrades to a tinted body-part monogram so the UI already
// reads as visual, color-coded, and anything-but-dull with zero
// assets shipped.

import { bodyPartImage, exerciseImageByName } from "@/lib/media";
import { CATEGORY_COLORS } from "@/styles/palette";

const FITNESS = CATEGORY_COLORS.fitness;

/** body part → accent (palette DATA colors only — never raw hex). */
const PART_COLORS: Record<string, string> = {
  chest: CATEGORY_COLORS.fitness,
  back: CATEGORY_COLORS.personal,
  shoulders: CATEGORY_COLORS.work,
  "upper arms": CATEGORY_COLORS.leisure,
  "lower arms": CATEGORY_COLORS.water,
  "upper legs": CATEGORY_COLORS.meals,
  "lower legs": CATEGORY_COLORS.sleep,
  waist: CATEGORY_COLORS.fitness,
  neck: CATEGORY_COLORS.work,
  cardio: CATEGORY_COLORS.water,
};

const initialsOf = (bodyPart: string): string => {
  const words = bodyPart.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

export function ExerciseThumb({
  name,
  bodyPart,
  size = 40,
}: {
  name: string;
  /** library body part — drives the fallback tint; optional */
  bodyPart?: string | null;
  /** px — 40 list rows, 36 logger cards, 48 plan cards */
  size?: number;
}) {
  const part = (bodyPart ?? "").toLowerCase().trim();
  const src = exerciseImageByName(name) ?? (part ? bodyPartImage(part) : null);
  const color = PART_COLORS[part] ?? FITNESS;

  return (
    <span
      aria-hidden="true"
      className="shrink-0 grid place-items-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(8, Math.round(size * 0.28)),
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
        border: `0.5px solid color-mix(in srgb, ${color} 30%, transparent)`,
        color,
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-bold leading-none tracking-wide"
          style={{ fontSize: Math.max(10, Math.round(size * 0.3)) }}
        >
          {initialsOf(part)}
        </span>
      )}
    </span>
  );
}
