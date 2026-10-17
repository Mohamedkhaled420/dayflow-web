// ============================================================
// Focus Triad — daily voice quota (Plus monetization constants)
// ------------------------------------------------------------
// The single source of truth for the voice quota numbers, shared
// by the relay (enforcement), /api/billing/status (reporting),
// Settings and the coach pane (display). Keep it dependency-free
// so both server routes and client components can import it.
//
// Approved model (2026-10-17):
//   Free plan : 5 minutes of Dia voice per day
//   Plus      : $14.99/yr — unlimited voice (soft abuse guard)
//
// Enforcement lives server-side in /api/ai/voice-agent; these
// constants only shape WHAT is enforced and what the UI shows.
// ============================================================

/** Free plan: 5 minutes of live Dia voice per UTC day. */
export const FREE_VOICE_SECONDS_PER_DAY = 300;

/** Plus: effectively unlimited — the 2 h/day guard exists purely
 *  to bound runaway cost (a stuck client streaming forever); no
 *  human conversation approaches it. */
export const PLUS_VOICE_SECONDS_PER_DAY = 7_200;

/** The quota that applies to a plan ('plus' → the soft guard,
 *  anything else → the free allowance). */
export function voiceQuotaSeconds(
  plan: "free" | "plus" | null | undefined
): number {
  return plan === "plus"
    ? PLUS_VOICE_SECONDS_PER_DAY
    : FREE_VOICE_SECONDS_PER_DAY;
}

/** Today's UTC date key (YYYY-MM-DD) — MUST match the relay's
 *  `day` column convention (migration 0016). */
export function voiceUsageDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** "4:37" / "12:05" clock formatting for quota displays. */
export function formatVoiceClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
