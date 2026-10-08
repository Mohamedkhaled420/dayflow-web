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
// Phase 15 (Settings sheet): two localStorage switches steer it —
//   dayflow-sky-off     "1"  → the dynamic sky is disabled (no
//                             data-sky attribute at all)
//   dayflow-sky-preview "h"  → a fractional hour (0–24) the
//                             Settings preview slider set; the
//                             whole app live-previews that time
// Both are applied immediately via the "dayflow-sky-change"
// event the Settings sheet dispatches (no remount needed).
//
// Deliberately NOT tied to the theme (light/dark): dark mode
// keeps the same bucket and just dims the stops (20% mix into
// the night window), like the reference's body::before
// opacity:.2.
// ============================================================

import { useEffect } from "react";

export type SkyBucket = "morning" | "day" | "evening" | "night";

export const SKY_OFF_KEY = "dayflow-sky-off";
export const SKY_PREVIEW_KEY = "dayflow-sky-preview";
export const SKY_CHANGE_EVENT = "dayflow-sky-change";

/** Hour → sky bucket (reference boundaries). */
export function skyBucketFor(date: Date): SkyBucket {
  return skyBucketForHour(date.getHours() + date.getMinutes() / 60);
}

/** Fractional hour (0–24) → sky bucket — the preview slider's
 *  unit (boundaries match the reference: 5 / 11 / 17 / 21). */
export function skyBucketForHour(h: number): SkyBucket {
  if (h >= 5 && h < 11) return "morning";
  if (h < 17) return "day";
  if (h < 21) return "evening";
  return "night";
}

/** Read the preview hour (null = follow the real clock). */
export function skyPreviewHour(): number | null {
  try {
    const raw = window.localStorage.getItem(SKY_PREVIEW_KEY);
    if (raw === null) return null;
    const h = Number(raw);
    return Number.isFinite(h) && h >= 0 && h <= 24 ? h : null;
  } catch {
    return null;
  }
}

export function skyDisabled(): boolean {
  try {
    return window.localStorage.getItem(SKY_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

/** The shared apply — one source of truth for every trigger. */
function applySky() {
  const root = document.documentElement;
  if (skyDisabled()) {
    delete root.dataset.sky;
    return;
  }
  const preview = skyPreviewHour();
  const h =
    preview ?? new Date().getHours() + new Date().getMinutes() / 60;
  root.dataset.sky = skyBucketForHour(h);
}

/** Client-only sync — mounted once inside the authenticated shell. */
export function SkySync() {
  useEffect(() => {
    applySky();
    const id = setInterval(applySky, 5 * 60_000);
    const onVis = () => {
      if (!document.hidden) applySky();
    };
    const onChange = () => applySky();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(SKY_CHANGE_EVENT, onChange);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(SKY_CHANGE_EVENT, onChange);
    };
  }, []);
  return null;
}
