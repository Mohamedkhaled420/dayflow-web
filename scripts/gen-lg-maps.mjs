#!/usr/bin/env node
// ============================================================
// Dayflow AI — Liquid Glass map generator v2 (SDF optics)
// ------------------------------------------------------------
// Emits per-pixel optics maps as inline PNG data-URLs for the
// LiquidGlassView component (web port of the iOS 26 Liquid
// Glass material, API modeled on @callstack/liquid-glass).
//
//   node scripts/gen-lg-maps.mjs
//     → writes src/components/ui/liquidGlassMaps.ts
//
// v2 replaces v1's four hard linear-gradient strips with a
// true rounded-rect SDF field: every pixel computes
//   1. signed distance to the glass edge
//   2. the outward surface normal (SDF gradient)
//   3. a smoothstep bend factor concentrated at the rim
// which reproduces the progressive edge refraction of a real
// thick-glass lens (the UIGlassEffect look) instead of a
// constant-width strip shift.
//
// Displacement encoding (feDisplacementMap R/G channels):
//   neutral  = rgb(127,127,127)  -> no shift
//   R/G      = 0.5 ± offset toward the element centre along
//              the surface normal; magnitude peaks at the rim
//              and decays inward over `band` px.
// Specular map: rim glow modulated by a top-left key light
//   (lambert on the bevel normal) + a broad diagonal sheen.
//
// PNGs are produced by a dependency-free encoder (node:zlib).
// ============================================================

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "components", "ui", "liquidGlassMaps.ts");

// ------------------------------------------------------------
// Minimal PNG encoder (RGBA8, filter none, zlib level 9)
// ------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

const encodePng = (width, height, rgba) => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const toDataUrl = (png) => `data:image/png;base64,${png.toString("base64")}`;

// ------------------------------------------------------------
// SDF optics
// ------------------------------------------------------------

/** Signed distance to a rounded rect centred on the origin (negative inside). */
const roundedRectSDF = (x, y, w, h, r) => {
  const qx = Math.abs(x) - w + r;
  const qy = Math.abs(y) - h + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
};

const smoothstep = (a, b, t) => {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Displacement map — the refraction field.
 * Offset points inward along the surface normal, magnitude peaks at
 * the rim (fraction up to 0.5) and decays over `band` px inward.
 * `power` sharpens the falloff (higher = thinner bright rim).
 */
const displacementMap = ({ width, height, radius, band, power }) => {
  const rgba = Buffer.alloc(width * height * 4);
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, Math.min(hw, hh)); // pill-safe
  const eps = 1; // px — gradient step
  const sdf = (x, y) => roundedRectSDF(x, y, hw, hh, r);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = px + 0.5 - hw;
      const y = py + 0.5 - hh;
      const t = -sdf(x, y); // inside distance: 0 at edge, grows inward
      let bend = 1 - smoothstep(0, band, t); // 1 at rim → 0 inward
      bend = Math.pow(bend, power);
      // outward normal = SDF gradient (numeric)
      let gx = (sdf(x + eps, y) - sdf(x - eps, y)) / (2 * eps);
      let gy = (sdf(x, y + eps) - sdf(x, y - eps)) / (2 * eps);
      const gl = Math.hypot(gx, gy) || 1;
      gx /= gl;
      gy /= gl;
      const k = 0.5 * bend; // offset fraction along -normal
      const offX = -gx * k;
      const offY = -gy * k;
      const i = (py * width + px) * 4;
      rgba[i] = Math.max(0, Math.min(255, Math.round((0.5 + offX) * 255)));
      rgba[i + 1] = Math.max(0, Math.min(255, Math.round((0.5 + offY) * 255)));
      rgba[i + 2] = 255; // unused channel
      rgba[i + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
};

/**
 * Specular map — rim light with a top-left key light (lambert on the
 * bevel normal) plus a broad diagonal sheen, encoded as white*intensity.
 */
const specularMap = ({ width, height, radius, band, rimGain = 1, sheen = 0.1 }) => {
  const rgba = Buffer.alloc(width * height * 4);
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, Math.min(hw, hh));
  const eps = 1;
  const sdf = (x, y) => roundedRectSDF(x, y, hw, hh, r);
  // direction TO the key light (up-left)
  const lx = -0.55;
  const ly = -0.835;
  const rimBand = Math.max(6, band * 0.55);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = px + 0.5 - hw;
      const y = py + 0.5 - hh;
      const t = -sdf(x, y);
      const edge = Math.pow(1 - smoothstep(0, rimBand, t), 2.0);
      let gx = (sdf(x + eps, y) - sdf(x - eps, y)) / (2 * eps);
      let gy = (sdf(x, y + eps) - sdf(x, y - eps)) / (2 * eps);
      const gl = Math.hypot(gx, gy) || 1;
      gx /= gl;
      gy /= gl;
      const lambert = Math.max(0, gx * lx + gy * ly); // bevel faces the light
      const rim = edge * (0.3 + 0.7 * lambert) * rimGain;
      const diag = smoothstep(-0.5, 1.1, x / hw - y / hh) * sheen; // top-left sheen
      const v = Math.max(0, Math.min(1, rim + diag));
      const i = (py * width + px) * 4;
      const c = Math.round(v * 255);
      rgba[i] = c;
      rgba[i + 1] = c;
      rgba[i + 2] = c;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
};

// ------------------------------------------------------------
// Variants — one map pair per T1 surface. The map aspect should
// approximate the rendered element so corner radii stay circular
// when feImage stretches it with preserveAspectRatio="none".
// ------------------------------------------------------------

const VARIANTS = {
  // mobile tab dock ~ 390×86
  dock: { width: 320, height: 64, radius: 26, band: 24, power: 1.5, rimGain: 0.9, sheen: 0.08 },
  // Habits primary CTA pill ~ 150×44
  cta: { width: 120, height: 48, radius: 24, band: 20, power: 1.35, rimGain: 1.0, sheen: 0.12 },
  // desktop sidebar rail (vertical) ~ 72×360
  rail: { width: 64, height: 320, radius: 26, band: 24, power: 1.5, rimGain: 0.85, sheen: 0.07 },
  // mobile floating header bar ~ 390×52
  header: { width: 320, height: 48, radius: 20, band: 20, power: 1.5, rimGain: 0.8, sheen: 0.06 },
};

// ------------------------------------------------------------
// Emit the TS module
// ------------------------------------------------------------

const lines = [];
lines.push("// ============================================================");
lines.push("// Liquid Glass optics maps — GENERATED FILE, do not edit.");
lines.push("// Regenerate with: node scripts/gen-lg-maps.mjs");
lines.push("// Per-pixel SDF refraction + specular fields (see the script");
lines.push("// header for the optical model) encoded as PNG data-URLs.");
lines.push("// ============================================================");
lines.push("");
lines.push("export type LiquidGlassVariant = \"dock\" | \"cta\" | \"rail\" | \"header\";");
lines.push("");
lines.push("export interface LiquidGlassMapSet {");
lines.push("  /** feDisplacementMap R/G refraction field (0.5 neutral). */");
lines.push("  displacement: string;");
lines.push("  /** White-intensity rim light (top-left key light). */");
lines.push("  specular: string;");
lines.push("}");
lines.push("");
lines.push("export const LIQUID_GLASS_MAPS: Record<LiquidGlassVariant, LiquidGlassMapSet> = {");

let totalBytes = 0;
for (const [name, cfg] of Object.entries(VARIANTS)) {
  const disp = displacementMap(cfg);
  const spec = specularMap(cfg);
  totalBytes += disp.length + spec.length;
  lines.push(`  ${name}: {`);
  lines.push(`    displacement: "${toDataUrl(disp)}",`);
  lines.push(`    specular: "${toDataUrl(spec)}",`);
  lines.push("  },");
  console.log(
    `  ${name.padEnd(7)} disp ${String(disp.length).padStart(6)} B   spec ${String(spec.length).padStart(6)} B`
  );
}
lines.push("};");
lines.push("");

writeFileSync(OUT_PATH, lines.join("\n"), "utf8");
console.log(`✓ wrote ${OUT_PATH} (${(totalBytes / 1024).toFixed(1)} KB of maps)`);
