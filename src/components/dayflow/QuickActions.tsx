"use client";

// ============================================================
// Dayflow AI — quick actions (Phase 11, Lively Pastel)
// ------------------------------------------------------------
// The "How can I help you today?" grid from the reference chat
// home: four pastel category cards (tourism / cooking / sport /
// art), each carrying the reference's photo-cutout treatment —
// a circular, white-ringed illustration — plus a white capsule
// tag and the charcoal prompt preview. Picking a card fills the
// composer through the SAME applyPreset path as the quick chips
// (confirm-before-overwrite discipline preserved).
//
// The illustrations are hand-drawn flat SVGs in the reference's
// vector style (charcoal figures, white accents) — self-contained
// assets that ride the bundle, keep dark mode legible (fixed
// pastel fills, charcoal ink in both modes), and cost zero
// network requests. Every color resolves from theme.css tokens
// or the QUICK_ACTION_COLORS palette export (PRD §5.2 — no raw
// hex in component code).
// ============================================================

import type { ComponentType } from "react";
import { ChefHat, Dumbbell, Palette, Plane } from "lucide-react";
import type { DiaCoachMode } from "@/components/dayflow/DiaChatShell";
import { QUICK_ACTION_COLORS } from "@/styles/palette";

export interface QuickAction {
  id: string;
  /** White capsule tag label (reference categories). */
  label: string;
  /** What lands in the composer when the card is picked. */
  prompt: string;
  /** Coach context the prompt belongs to. */
  mode: DiaCoachMode;
  /** Fixed pastel card fill (content color — same in dark mode). */
  fill: string;
  Tag: ComponentType<{ className?: string }>;
  Art: ComponentType<{ className?: string }>;
}

/* ---- flat-vector illustrations (64 viewBox, drawn at ~44px) ---- */

function TourismArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <ellipse cx="30" cy="55" rx="15" ry="2.5" fill="var(--df-quick-art-shadow)" />
      {/* backpack */}
      <rect x="14" y="27" width="13" height="17" rx="6" fill="var(--df-quick-art-accent)" />
      <rect x="17" y="30" width="7" height="6" rx="2" fill="var(--df-quick-art-ink)" opacity=".28" />
      {/* torso + head */}
      <path
        d="M27 26c0-4.4 3.1-7.5 7.5-7.5S42 21.6 42 26v13.5c0 2.2-1.8 4-4 4h-7c-2.2 0-4-1.8-4-4V26z"
        fill="var(--df-quick-art-ink)"
      />
      <circle cx="34.5" cy="12.5" r="6.5" fill="var(--df-quick-art-ink)" />
      {/* legs, mid-stride */}
      <path d="M30 43.5 25.5 53" stroke="var(--df-quick-art-ink)" strokeWidth="5" strokeLinecap="round" />
      <path d="M38 43.5 44.5 52" stroke="var(--df-quick-art-ink)" strokeWidth="5" strokeLinecap="round" />
      {/* waving arm */}
      <path d="M41 28l7-4" stroke="var(--df-quick-art-accent)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

function CookingArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <ellipse cx="32" cy="55" rx="16" ry="2.5" fill="var(--df-quick-art-shadow)" />
      {/* steam */}
      <path d="M25 17c-2-2 2-4 0-6.5" stroke="var(--df-quick-art-ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M33 17c-2-2 2-4 0-6.5" stroke="var(--df-quick-art-ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M41 17c-2-2 2-4 0-6.5" stroke="var(--df-quick-art-ink)" strokeWidth="2.5" strokeLinecap="round" />
      {/* lid + knob */}
      <rect x="20" y="24" width="24" height="5" rx="2.5" fill="var(--df-quick-art-accent)" />
      <circle cx="32" cy="21.5" r="2.5" fill="var(--df-quick-art-accent)" />
      {/* pot + handles */}
      <rect x="16" y="29" width="32" height="14" rx="7" fill="var(--df-quick-art-ink)" />
      <rect x="11" y="32" width="6" height="3.5" rx="1.75" fill="var(--df-quick-art-ink)" />
      <rect x="47" y="32" width="6" height="3.5" rx="1.75" fill="var(--df-quick-art-ink)" />
      {/* stove legs */}
      <path d="M24 43l-3 8" stroke="var(--df-quick-art-ink)" strokeWidth="4" strokeLinecap="round" />
      <path d="M40 43l3 8" stroke="var(--df-quick-art-ink)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function SportArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <ellipse cx="30" cy="55" rx="15" ry="2.5" fill="var(--df-quick-art-shadow)" />
      {/* head + torso */}
      <circle cx="28" cy="12" r="6.5" fill="var(--df-quick-art-ink)" />
      <path
        d="M28 19c5 0 8 3.5 8 8.5V38c0 2.2-1.8 4-4 4h-8c-2.2 0-4-1.8-4-4V27.5c0-5 3-8.5 8-8.5z"
        fill="var(--df-quick-art-ink)"
      />
      {/* legs */}
      <path d="M24 42l-3 10" stroke="var(--df-quick-art-ink)" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 42l3 10" stroke="var(--df-quick-art-ink)" strokeWidth="5" strokeLinecap="round" />
      {/* arm reaching the dumbbell */}
      <path d="M35 25l11 1" stroke="var(--df-quick-art-ink)" strokeWidth="4.5" strokeLinecap="round" />
      {/* dumbbell */}
      <rect x="46" y="18" width="4.5" height="16" rx="2.25" fill="var(--df-quick-art-accent)" />
      <rect x="41.5" y="15" width="5" height="8.5" rx="2.5" fill="var(--df-quick-art-ink)" />
      <rect x="41.5" y="28.5" width="5" height="8.5" rx="2.5" fill="var(--df-quick-art-ink)" />
      <rect x="50" y="15" width="5" height="8.5" rx="2.5" fill="var(--df-quick-art-ink)" />
      <rect x="50" y="28.5" width="5" height="8.5" rx="2.5" fill="var(--df-quick-art-ink)" />
    </svg>
  );
}

function ArtArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <ellipse cx="32" cy="55" rx="15" ry="2.5" fill="var(--df-quick-art-shadow)" />
      {/* palette */}
      <path
        d="M31 16c-11 0-19 7-19 15.5S20.5 46 29.5 46c3.5 0 4.6-2 3.6-4-1-2 .5-4 3-4h4.4c5.6 0 9.5-4 9.5-9.5S44 16 31 16z"
        fill="var(--df-quick-art-ink)"
      />
      {/* paint blobs */}
      <circle cx="21" cy="26" r="3" fill="var(--df-quick-art-accent)" />
      <circle cx="30.5" cy="22" r="3" fill="var(--df-quick-art-accent)" />
      <circle cx="39" cy="25.5" r="3" fill="var(--df-quick-art-accent)" />
      <circle cx="20.5" cy="35" r="3" fill="var(--df-quick-art-accent)" />
      {/* brush */}
      <path d="M43 39l9-12" stroke="var(--df-quick-art-accent)" strokeWidth="4" strokeLinecap="round" />
      <path d="M51 28.5l3.5-4.5" stroke="var(--df-quick-art-ink)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** The four reference categories. Prompts are grounded in what the
 *  coach actually reads (journal entries / logged workouts). */
export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "trip",
    label: "Tourism",
    prompt: "Help me plan a light travel day around my energy levels — what should I schedule first?",
    mode: "journal",
    fill: QUICK_ACTION_COLORS.trip,
    Tag: Plane,
    Art: TourismArt,
  },
  {
    id: "cooking",
    label: "Cooking",
    prompt: "Suggest 5 high-protein lunches I can prep in under 30 minutes.",
    mode: "journal",
    fill: QUICK_ACTION_COLORS.cooking,
    Tag: ChefHat,
    Art: CookingArt,
  },
  {
    id: "sport",
    label: "Sport",
    prompt: "Create a 30-minute training session for today based on my recent workouts.",
    mode: "workout",
    fill: QUICK_ACTION_COLORS.sport,
    Tag: Dumbbell,
    Art: SportArt,
  },
  {
    id: "art",
    label: "Art",
    prompt: "I want to carve out time for drawing today — help me find the best window for it.",
    mode: "journal",
    fill: QUICK_ACTION_COLORS.art,
    Tag: Palette,
    Art: ArtArt,
  },
];

/** One pastel category card: white capsule tag + circular
 *  white-ringed illustration up top, full charcoal prompt below.
 *  2026-09 iPhone QA fix: the prompt used to clamp to two lines
 *  at 72% width ("Help me plan a light…" / "Suggest 5 high-…"),
 *  which read as broken clipping — the card now grows to fit the
 *  whole prompt and the art sits in the top row, out of the
 *  text's way. */
function QuickCard({ action, onPick }: { action: QuickAction; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="df-press relative flex flex-col gap-2.5 overflow-hidden rounded-[20px] p-3 text-left"
      style={{
        background: action.fill,
        boxShadow: "var(--df-quick-card-shadow)",
      }}
      aria-label={`Ask coach — ${action.label}: ${action.prompt}`}
    >
      <div className="relative z-10 flex items-start justify-between gap-2">
        <span
          className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-[3.5px] text-[9.5px] font-extrabold uppercase leading-none tracking-wide"
          style={{
            background: "var(--df-quick-tag-fill)",
            color: "var(--df-quick-tag-ink)",
          }}
        >
          <action.Tag className="h-3 w-3" aria-hidden="true" />
          {action.label}
        </span>
        <span className="shrink-0" aria-hidden="true">
          <span
            className="grid size-[52px] place-items-center rounded-full"
            style={{
              border: "3px solid var(--df-white)",
              background: "var(--df-quick-ring-bg)",
              boxShadow: "var(--df-quick-ring-shadow)",
            }}
          >
            <action.Art className="h-9 w-9" />
          </span>
        </span>
      </div>
      <span
        className="relative z-10 text-[11.5px] font-bold leading-snug"
        style={{ color: "var(--df-quick-ink)" }}
      >
        {action.prompt}
      </span>
    </button>
  );
}

/** The 2×2 grid (single column below 380px — the cards need room
 *  for the circular art). Constrained on wide chat panes so the
 *  cards keep the reference's compact mobile proportion. */
export function QuickActionGrid({ onPick }: { onPick: (a: QuickAction) => void }) {
  return (
    <div
      className="mt-2 grid max-w-[460px] grid-cols-1 gap-2.5 min-[380px]:grid-cols-2"
      role="list"
      aria-label="How can I help you today — quick prompts"
    >
      {QUICK_ACTIONS.map((a) => (
        <div key={a.id} role="listitem">
          <QuickCard action={a} onPick={() => onPick(a)} />
        </div>
      ))}
    </div>
  );
}
