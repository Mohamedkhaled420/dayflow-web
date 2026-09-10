#!/usr/bin/env node
// ============================================================
// check-raw-colors.mjs — Dayflow drift guard (PRD §5.2 / DESIGN.md §1.5)
// Fails the build when any stylesheet under src/ contains raw
// hex / rgb() / hsl() literals outside src/styles/theme.css.
// Chained into `pnpm build` before eslint and next build.
// ============================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ALLOWED = new Set(["src/styles/theme.css"]);
const PATTERN = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(\s*\d|\boklch\(\s*\d|\boklab\(\s*\d/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split(join("\\", "/")).join("/").replace(/\\/g, "/");
  if (!rel.endsWith(".css") || ALLOWED.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const match = line.match(PATTERN);
    if (match) {
      violations.push(
        `  ${rel}:${i + 1}  ${match[0]}  —  ${line.trim().slice(0, 90)}`
      );
    }
  });
}

if (violations.length > 0) {
  console.error(
    "✗ dayflow drift guard: raw color literals found outside src/styles/theme.css"
  );
  console.error(
    "  (category DATA colors belong in src/styles/palette.ts — see DESIGN.md §1.3)\n"
  );
  for (const v of violations) console.error(v);
  process.exit(1);
}

console.log("✓ drift guard: no raw colors in CSS outside theme.css");
