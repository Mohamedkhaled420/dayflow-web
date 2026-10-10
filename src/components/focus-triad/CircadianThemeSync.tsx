"use client";

// ============================================================
// Focus Triad — CircadianThemeSync (the time-of-day app theme)
// ------------------------------------------------------------
// The whole app theme follows the user's clock: light through
// the morning and day buckets, dark through evening and night —
// the SAME 5 / 11 / 17 / 21 boundaries the living sky uses, so
// the gradient and the theme always agree.
//
// How it integrates with next-themes (and why it never fights
// it): next-themes keeps managing the CONCRETE light/dark
// class — this controller just decides WHICH one is applied
// while the user's preference is "time of day":
//
//   localStorage "ft-theme-pref"  the user's PREFERENCE
//     "auto" | "light" | "dark" | "system"  (null = auto)
//   localStorage "theme" (next-themes)  the APPLIED theme
//
// A tiny inline script in the root layout runs BEFORE
// next-themes' bootstrap and aligns "theme" with the clock, so
// a 10 PM load paints dark on the very first frame — no flash,
// no hydration race, and ChromeThemeSync / VoiceOrb keep
// reading useTheme().resolvedTheme like nothing changed.
//
// Triggers (mirror SkySync): mount, a 5-minute tick,
// visibilitychange (iOS suspends timers — this is the real
// "user just opened the app" signal), and the Settings sky
// preview slider event, so dragging the hour preview flips the
// whole theme live too.
// ============================================================

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { SKY_CHANGE_EVENT } from "@/components/focus-triad/SkySync";

/** The preference key — written by the Settings appearance row. */
export const THEME_PREF_KEY = "ft-theme-pref";

export type ThemePref = "auto" | "light" | "dark" | "system";

/** The class that smooths a circadian theme flip (globals.css). */
const THEME_FADE_CLASS = "df-theme-anim";
const THEME_FADE_MS = 950;

/** Hour → dark? Same boundaries as the sky buckets: dark from
 * 17:00 (evening) through 04:59 (night); light 05:00–16:59. */
export function isDarkHour(h: number): boolean {
  return h >= 17 || h < 5;
}

/** Read the stored preference (null-safe, defaults to "auto"). */
export function readThemePref(): ThemePref {
  try {
    const raw = window.localStorage.getItem(THEME_PREF_KEY);
    if (raw === "auto" || raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
    // Legacy values: a stored next-themes "theme" that was set
    // before preferences existed (old "Auto" button = system).
    const applied = window.localStorage.getItem("theme");
    if (applied === "light" || applied === "dark") return applied;
    if (applied === "system") return "system";
    return "auto";
  } catch {
    return "auto";
  }
}

/** Persist the preference (Settings appearance row). */
export function writeThemePref(pref: ThemePref) {
  try {
    if (pref === "auto") window.localStorage.removeItem(THEME_PREF_KEY);
    else window.localStorage.setItem(THEME_PREF_KEY, pref);
  } catch {
    /* private mode — the in-memory theme still applies */
  }
}

/** The effective fractional hour: the user's real clock (the
 *  Settings preview slider was retired — the sky always follows
 *  the actual time of day). */
function effectiveHour(): number {
  return new Date().getHours() + new Date().getMinutes() / 60;
}

/** Smooth the flip: enable the color transitions for ~1s. */
function withThemeFade(apply: () => void) {
  const root = document.documentElement;
  if (root.classList.contains(THEME_FADE_CLASS)) {
    apply();
    return;
  }
  root.classList.add(THEME_FADE_CLASS);
  apply();
  window.setTimeout(() => root.classList.remove(THEME_FADE_CLASS), THEME_FADE_MS);
}

/**
 * The controller — mounted once inside the ThemeProvider tree.
 * Only acts while the preference is "auto"; the concrete light /
 * dark / system preferences are next-themes' business alone.
 */
export function CircadianThemeSync() {
  const { setTheme } = useTheme();

  useEffect(() => {
    if (readThemePref() !== "auto") return;

    const apply = () => {
      // Another tab / the Settings row may have switched modes.
      if (readThemePref() !== "auto") return;
      const dark = isDarkHour(effectiveHour());
      const currentDark = document.documentElement.classList.contains("dark");
      if (dark !== currentDark) {
        withThemeFade(() => setTheme(dark ? "dark" : "light"));
      }
    };

    apply();
    const id = window.setInterval(apply, 5 * 60_000);
    const onVis = () => {
      if (!document.hidden) apply();
    };
    const onSky = () => apply();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(SKY_CHANGE_EVENT, onSky);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(SKY_CHANGE_EVENT, onSky);
    };
    // setTheme is stable in next-themes 0.4; the effect is a
    // mount-once controller by design.
  }, []);

  return null;
}
