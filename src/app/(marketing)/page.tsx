import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";

import { AppShell } from "@/components/focus-triad/AppShell";
import { LandingLazy } from "./landing-lazy";

// ============================================================
// Focus Triad — public landing route (Phase 6.5 / B2)
// ------------------------------------------------------------
// Unauthenticated visitors get the brand-motion hero (220vh
// runway, scroll-driven logo formation, "Open Focus Triad" CTA).
// Authenticated users pass straight through to the app shell —
// the middleware only lets unauthenticated GET / reach this page;
// every other protected route still redirects to /auth.
// ============================================================

export const metadata: Metadata = {
  title: "Focus Triad — Your day, drawn in rhythm",
  description:
    "Focus Triad turns workouts, work, sleep, water, and meals into one clear timeline — with habit streaks, weekly reviews, and a grounded AI coach. Local-first, private by default.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; upgraded?: string; canceled?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  if (user) {
    // Home-screen app shortcuts deep-link with ?tab=coach etc. —
    // resolved on the SERVER so the first paint already shows the
    // right pane (no hydration flash, no effect-setState).
    // The payment return (?upgraded=1 / ?canceled=1) rides the
    // same server-resolved path: NOWPayments redirects here after
    // the hosted checkout, and the AppShell turns it into a
    // confirmation + plan poll instead of a silent dead landing.
    const { tab, upgraded, canceled } = await searchParams;
    const billingReturn =
      upgraded === "1" ? "upgraded" : canceled === "1" ? "canceled" : undefined;
    return <AppShell initialTab={tab} billingReturn={billingReturn} />;
  }
  return <LandingLazy />;
}
