"use client";

// ============================================================
// Dayflow — browser-chrome / status-bar theme sync (mobile fix)
// ------------------------------------------------------------
// Problem this solves: the phone's browser chrome (address-bar
// band, edge shading) only reads as "native" when its tint
// matches the app surface. Next's static viewport meta can only
// follow the OS color scheme; the app ALSO has a manual
// light/dark toggle (Settings → Appearance). This component
// keeps the live <meta name="theme-color"> in lock-step with
// the RESOLVED theme, and swaps the iOS standalone status-bar
// style so its text stays readable in both schemes:
//   dark  → black-translucent (edge-to-edge, white text)
//   light → default (system bar, dark text)
// No DOM output; mounted once from the root layout.
// ============================================================

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { THEME_META_COLORS } from "@/styles/palette";

const STATUS_BAR_STYLE = {
  dark: "black-translucent",
  light: "default",
} as const;

export function ChromeThemeSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const dark = resolvedTheme === "dark";
    const color = dark ? THEME_META_COLORS.dark : THEME_META_COLORS.light;

    // 1 — browser chrome tint. Next renders the media-query pair of
    // theme-color metas; overwrite BOTH with the resolved color so a
    // manual toggle (e.g. dark app on a light-scheme phone) still
    // blends. When following the system ("system" theme), the media
    // pair already matches — writing the resolved value is a no-op
    // visually but keeps a single source of truth.
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", color));

    // 2 — iOS standalone status bar. Read at launch: the persisted
    // theme means the NEXT cold launch of the installed app picks
    // the right style.
    document
      .querySelectorAll('meta[name="apple-mobile-web-app-status-bar-style"]')
      .forEach((meta) =>
        meta.setAttribute(
          "content",
          dark ? STATUS_BAR_STYLE.dark : STATUS_BAR_STYLE.light,
        ),
      );
  }, [resolvedTheme]);

  return null;
}
