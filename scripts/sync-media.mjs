#!/usr/bin/env node
// sync-media — regenerate src/data/media-manifest.json from the files
// actually present under public/media/. Run after dropping assets in:
//
//   node scripts/sync-media.mjs
//
// Buckets (see docs/media-assets.md for the full list + naming rules):
//   public/media/exercises/<slug>.<ext>
//   public/media/body-parts/<slug>.<ext>
//   public/media/areas/<slug>.<ext>
//
// Accepted extensions: .png .webp .jpg .jpeg .svg .avif
// Files not present are simply absent from the manifest — the UI falls
// back to tokenized placeholders, so partial sets ship safely.

import { readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "public", "media");
const OUT = path.resolve(process.cwd(), "src", "data", "media-manifest.json");

const BUCKETS = {
  exercises: "exercises",
  "body-parts": "bodyParts",
  areas: "areas",
};

const EXTS = new Set([".png", ".webp", ".jpg", ".jpeg", ".svg", ".avif"]);

// Must stay in lockstep with slugify() in src/lib/media.ts.
const slugify = (name) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const manifest = { v: 1, exercises: {}, bodyParts: {}, areas: {} };
let count = 0;

if (existsSync(ROOT)) {
  for (const [dir, key] of Object.entries(BUCKETS)) {
    const full = path.join(ROOT, dir);
    if (!existsSync(full)) continue;
    for (const file of await readdir(full)) {
      const ext = path.extname(file).toLowerCase();
      if (!EXTS.has(ext)) continue;
      const base = path.basename(file, ext);
      const slug = slugify(base);
      if (!slug) continue;
      manifest[key][slug] = `/media/${dir}/${file}`;
      count++;
    }
  }
} else {
  console.log("sync-media: public/media/ does not exist yet — wrote an empty manifest.");
}

await writeFile(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(`sync-media: ${count} asset(s) indexed → src/data/media-manifest.json`);
