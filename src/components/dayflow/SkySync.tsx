"use client";

// ============================================================
// Dayflow AI — SkySync (Phase 14, reference "Dayflow (4).html")
// ------------------------------------------------------------
// The living sky: sets <html data-sky="morning|day|evening|night">
// from the USER'S clock so the app-surface gradient (see
// --df-sky-gradient / the data-sky bucket blocks in theme.css)
// always matches the time of day — at load, on every 5-minute
// tick, and the moment a suspended PWA/tab becomes visible again
// (iOS throttles timers in the background, so visibilitychange
// is the reliable "user just opened the app" signal).
//
// The buckets mirror the reference frame scripts exactly:
//   5–11   morning   lemon → powder → rose → orchid
//   11–17  day       frosted blue → aqua → aquamarine → celadon
//   17–21  evening   powder → rose → orchid → mauve
//   21–5   night     mauve → ice blue → frosted blue → aquamarine
//
// Deliberately NOT tied to the theme (light/dark): dark mode
// keeps the same bucket and just dims the stops (20% mix into
// the night window), like the reference's body::before
// opacity:.2.
// ============================================================

import { useEffect } from "react";

export type SkyBucket = "morning" | "day" | "evening" | "night";

/** Hour → sky bucket (reference boundaries). */
export function skyBucketFor(date: Date): SkyBucket {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h < 17) return "day";
  if (h < 21) return "evening";
  return "night";
}

/** Client-only sync — mounted once inside the authenticated shell. */
export function SkySync() {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.dataset.sky = skyBucketFor(new Date());
    };
    apply();
    const id = setInterval(apply, 5 * 60_000);
    const onVis = () => {
      if (!document.hidden) apply();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}
