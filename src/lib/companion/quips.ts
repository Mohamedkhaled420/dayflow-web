// ============================================================
// Focus Triad — client quip engine (Dia's LLM personality)
// ------------------------------------------------------------
// Two-tier quips: an instant static line (from moods.ts) so the
// bubble NEVER feels dead, upgraded in-place by an LLM line from
// /api/ai/quip when it wins a 2.4s race. If the API is slow,
// rate-limited or down, the static line simply stays — the
// companion degrades to her old self, never to silence.
//
// Discipline:
//   - poke spam never burns quota (12s API gap for pokes)
//   - a general 3s anti-burst gap across all reasons
//   - the last few LLM lines are remembered and sent as
//     "do not repeat" context
//   - failures are swallowed by design
// ============================================================

"use client";

import { pick, type CompanionMood } from "@/components/companion/moods";
import { useCompanionStore } from "@/store/companionStore";

export type QuipReason =
  | "poke"
  | "goal"
  | "pr"
  | "mood"
  | "level"
  | "evolve"
  | "streak";

export interface QuipContext {
  mood: CompanionMood;
  hydrationPct: number;
  goalsMet: number;
  hour: number;
  streak: number;
  level: number;
  stage: "cub" | "hunter" | "legend";
  /** Event context, e.g. PR exercise names. */
  detail?: string;
}

/** How late an LLM line may arrive and still replace the static one. */
const RACE_MS = 2400;
/** Pokes only hit the API at most once per window (spam guard). */
const POKE_API_GAP_MS = 12_000;
/** Any two API calls are at least this far apart. */
const GENERAL_API_GAP_MS = 3000;

const recentLines: string[] = [];
let lastApiAt = 0;

export interface SmartSayOptions {
  /** Show a static line instantly (default true). Set false when the
   *  caller already said something specific (e.g. WorkoutSheet's
   *  "New PR — Bench Press!"). */
  instant?: boolean;
}

/**
 * Say a quip for `reason`: static fallback immediately (unless
 * opted out), then the LLM's line replaces it if it arrives in
 * time. Fire-and-forget — never throws, never blocks.
 */
export function smartSay(
  reason: QuipReason,
  ctx: QuipContext,
  fallbackLines: readonly string[],
  options?: SmartSayOptions
): void {
  const { say } = useCompanionStore.getState();
  const instant = options?.instant !== false;
  if (instant) say(pick(fallbackLines));

  const now = Date.now();
  const gap = reason === "poke" ? POKE_API_GAP_MS : GENERAL_API_GAP_MS;
  if (now - lastApiAt < gap) return; // static stays
  lastApiAt = now;

  const body = {
    reason,
    mood: ctx.mood,
    hydrationPct: ctx.hydrationPct,
    goalsMet: ctx.goalsMet,
    hour: ctx.hour,
    streak: ctx.streak,
    level: ctx.level,
    stage: ctx.stage,
    detail: ctx.detail,
    recent: recentLines.slice(-4),
  };

  fetch("/api/ai/quip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { text?: unknown } | null) => {
      const text =
        typeof data?.text === "string" ? data.text.trim().slice(0, 110) : "";
      if (!text) return; // static stays
      if (Date.now() - now > RACE_MS) return; // too late to replace
      recentLines.push(text);
      if (recentLines.length > 6) recentLines.shift();
      say(text);
    })
    .catch(() => {
      // offline / 5xx — the static line already covers us
    });
}
