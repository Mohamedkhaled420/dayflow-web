"use client";

import dynamic from "next/dynamic";

// The landing page (hero + story runway + features + FAQ + dock)
// is needed ONLY by unauthenticated visitors. Code-splitting it
// here keeps the welcome suite's chunks out of the authenticated
// app shell's initial JS (Phase 6.5 bundle budget, kept).
// ssr:true keeps the copy server-rendered for crawlers.
const LandingView = dynamic(
  () => import("@/components/focus-triad/landing/LandingView").then((m) => m.LandingView),
);

export function LandingLazy() {
  return <LandingView />;
}
