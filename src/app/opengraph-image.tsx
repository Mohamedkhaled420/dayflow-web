import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { OG_TEXT_COLORS, PWA_SURFACE_COLORS } from "@/styles/palette";

// ============================================================
// Dayflow AI — Open Graph image (Phase 6.5 / B4)
// ------------------------------------------------------------
// 1200x630: the brand mark (public/logo.svg, the single source of
// truth) beside the "Dayflow AI" wordmark on the PWA surface.
// Satori renders standalone (no CSS custom properties), so colors
// arrive materialized from palette.ts (the sanctioned home for
// color values used outside stylesheets).
// ============================================================

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Dayflow AI — your day, drawn in rhythm";

export default async function OpengraphImage() {
  const svg = await readFile(
    path.join(process.cwd(), "public", "logo.svg"),
    "utf8",
  );
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 72,
          background: PWA_SURFACE_COLORS.background,
          fontFamily: "sans-serif",
        }}
      >
        <img src={dataUri} width={380} height={380} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              color: OG_TEXT_COLORS.ink,
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            Dayflow AI
          </div>
          <div
            style={{
              fontSize: 30,
              color: OG_TEXT_COLORS.inkMuted,
              display: "flex",
            }}
          >
            Your day, drawn in rhythm.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
