import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";

import { AppShell } from "@/components/dayflow/AppShell";
import { LandingLazy } from "./landing-lazy";

// ============================================================
// Dayflow AI — public landing route (Phase 6.5 / B2)
// ------------------------------------------------------------
// Unauthenticated visitors get the brand-motion hero (220vh
// runway, scroll-driven logo formation, "Open Dayflow" CTA).
// Authenticated users pass straight through to the app shell —
// the middleware only lets unauthenticated GET / reach this page;
// every other protected route still redirects to /auth.
// ============================================================

export const metadata: Metadata = {
  title: "Dayflow AI — Your day, drawn in rhythm",
  description:
    "Dayflow turns workouts, work, sleep, water, and meals into one clear timeline — with habit streaks, weekly reviews, and a grounded AI coach. Local-first, private by default.",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  if (user) return <AppShell />;
  return <LandingLazy />;
}
