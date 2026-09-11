#!/usr/bin/env node
// ============================================================
// gen-icons.mjs — Dayflow icon raster pipeline (Phase 6.5 / B4)
// ------------------------------------------------------------
// Regenerates every icon surface from the single source of truth
// (public/logo.svg):
//   public/apple-touch-icon.png        180x180  (solid surface bg)
//   public/icons/icon-192.png          192x192  (any purpose)
//   public/icons/icon-512.png          512x512  (any purpose)
//   public/icons/icon-512-maskable.png 512x512  (maskable, solid
//        surface bg; the mark spans ~71% of the canvas, inside
//        the 80% safe zone)
// src/app/icon.svg is a verbatim copy of public/logo.svg.
// Filenames match the Phase 4 set, so public/sw.js SHELL_ASSETS
// stays untouched.
// ============================================================

import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const SURFACE = "#0e1117"; // --color-surface (PWA shell, manifest.json)

const logoSvg = await readFile(`${ROOT}public/logo.svg`, "utf8");

/** Rasterize the mark at `size`, composited over a solid surface. */
async function markOnSurface(size, out) {
  const mark = await sharp(Buffer.from(logoSvg))
    .resize(size, size)
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: SURFACE,
    },
  })
    .composite([{ input: mark }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ${out.replace(ROOT, "")} (${size}x${size})`);
}

await mkdir(`${ROOT}public/icons`, { recursive: true });

console.log("regenerating Dayflow icon surfaces from public/logo.svg …");
await markOnSurface(180, `${ROOT}public/apple-touch-icon.png`);
await markOnSurface(192, `${ROOT}public/icons/icon-192.png`);
await markOnSurface(512, `${ROOT}public/icons/icon-512.png`);
await markOnSurface(512, `${ROOT}public/icons/icon-512-maskable.png`);

// favicon: verbatim copy of the vector source
await writeFile(`${ROOT}src/app/icon.svg`, logoSvg);
console.log("  src/app/icon.svg (vector, verbatim)");
console.log("done.");
