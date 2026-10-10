// ============================================================
// Dayflow AI — durable per-user rate limiting (audit P0-5)
// ------------------------------------------------------------
// Serverless-safe replacement for the old in-memory Map (which
// reset on every lambda cold start). The counter lives in
// Postgres behind the consume_rate_limit() SECURITY DEFINER
// RPC (migration 0013): the user's own JWT authorizes the call,
// the function counts the sliding window atomically, and users
// can neither read nor reset their counters.
//
// Failure policy: FAIL-OPEN. If Postgres is unreachable the
// request is allowed — availability beats strictness for an
// abuse-prevention limiter; the shared model quota still has
// its own server-side guards.
// ============================================================

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** One limiter definition: name + budget. */
export interface RateRule {
  /** Counter bucket name ('coach', 'voice', ...). */
  bucket: string;
  /** Max hits per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_RULES = {
  /** Coach chat (was 12 / 5 min in-memory). */
  coach: { bucket: "coach", limit: 12, windowSeconds: 300 } as RateRule,
  /** Voice agent sessions are heavier — tighter budget. */
  voice: { bucket: "voice", limit: 6, windowSeconds: 300 } as RateRule,
} satisfies Record<string, RateRule>;

/**
 * Consume one hit for the caller. Uses the request's cookie
 * session when present, else the presented Bearer JWT (same
 * dual credential pattern as the coach route's verifyRequester).
 * Returns true when the request is allowed.
 */
export async function allowRequest(
  rule: RateRule,
  authHeader: string | null
): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const cookieStore = await cookies();

    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    const client = createServerClient(url, key, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
      ...(bearer ? { global: { headers: { Authorization: `Bearer ${bearer}` } } } : {}),
    });

    const { data, error } = await client.rpc("consume_rate_limit", {
      p_bucket: rule.bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      // Unknown RPC (migration not applied yet?) or DB issue —
      // fail-open, loudly.
      console.warn("[rate-limit] rpc error:", error.message);
      return true;
    }
    return data === true;
  } catch (e) {
    console.warn("[rate-limit] failed open:", e);
    return true;
  }
}
