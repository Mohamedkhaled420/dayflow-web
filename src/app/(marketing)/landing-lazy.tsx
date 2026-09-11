"use client";

import dynamic from "next/dynamic";

// The landing hero (LogoFormation + marketing copy) is needed ONLY by
// unauthenticated visitors. Code-splitting it here keeps the
// formation's chunks out of the authenticated app shell's initial
// JS — Phase 6.5 bundle budget: <= +4KB gzipped vs main (B1 brief).
// Default ssr:true keeps the copy server-rendered for crawlers.
const LandingHero = dynamic(
  () => import("./landing-hero").then((m) => m.LandingHero),
);

export function LandingLazy() {
  return <LandingHero />;
}
