#!/usr/bin/env node
// ============================================================
// Focus Triad — bundle size guard (audit P2)
// ------------------------------------------------------------
// Runs after `next build` (wired into the build script). Scans
// the prerendered HTML per route for its /_next/static script
// tags — exactly the bytes a browser loads on first paint —
// and fails when any route's first-load JS budget is exceeded,
// so Three.js or a careless import can't silently balloon the
// payload.
//
// Works with Next 16's build output (per-route .html files in
// .next/server/app/**), not the older app-build-manifest.
//
//   node scripts/check-bundle-size.mjs [--baseline]
// ============================================================

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const NEXT_DIR = join(process.cwd(), ".next");
const APP_DIR = join(NEXT_DIR, "server", "app");

/** Route budgets in BYTES of first-load JS. Baseline measured
 *  2026-10-10 (Phase 20, Next 16): every prerendered page rides
 *  the ~565 kB shared runtime (react-dom + router + polyfills)
 *  — that's the framework floor, not app bloat. Budgets are
 *  baseline + ~40% headroom to catch regressions, not to shame
 *  the floor. NOTE: "/" is dynamic (auth-aware) so it has no
 *  prerendered HTML here — its perf is watched by Lighthouse CI.
 */
const DEFAULT_BUDGETS = {
  // Team carries extra page-level chunks (654 kB baseline).
  "/team": 900_000,
  // Auth / onboarding / reset / legal — the shared-runtime floor.
  "/auth": 850_000,
  "/onboarding": 850_000,
  "/privacy": 850_000,
  "/terms": 850_000,
  // Anything not listed.
  "*": 900_000,
};

function walkHtml(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkHtml(p, acc);
    else if (name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

function routeFor(htmlPath) {
  let rel = relative(APP_DIR, htmlPath).replaceAll("\\", "/");
  rel = rel.replace(/\.html$/, "").replace(/(^|\/)index$/, "");
  if (rel === "_global-error" || rel.startsWith("_")) return null; // internal shells
  return rel === "" ? "/" : rel.startsWith("(") ? `/${rel.replace(/^\([^)]*\)\//, "")}` : `/${rel}`;
}

function fileSize(p) {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

function main() {
  if (!existsSync(APP_DIR)) {
    console.error("[bundle] no .next/server/app — run next build first");
    process.exit(1);
  }

  const htmlFiles = walkHtml(APP_DIR);
  const scriptRe = /<script[^>]+src="(\/_next\/static\/[^"]+\.js)"/g;

  const results = [];
  for (const f of htmlFiles) {
    const route = routeFor(f);
    if (!route) continue;
    const html = readFileSync(f, "utf8");
    const chunks = new Set();
    for (const m of html.matchAll(scriptRe)) chunks.add(m[1]);
    let total = 0;
    for (const c of chunks) {
      total += fileSize(join(process.cwd(), "public", c));
      total += fileSize(join(NEXT_DIR, "static", c.replace(/^\/_next\/static\//, "")));
    }
    results.push({ route, chunks: chunks.size, bytes: total });
  }

  if (results.length === 0) {
    console.warn("[bundle] no route HTML found — nothing to check");
    process.exit(0);
  }

  let failed = false;
  const rows = results.sort((a, b) => b.bytes - a.bytes);
  console.log("[bundle] first-load JS by route (prerendered HTML):");
  for (const r of rows) {
    const budget = DEFAULT_BUDGETS[r.route] ?? DEFAULT_BUDGETS["*"];
    const kb = (r.bytes / 1024).toFixed(1);
    const budgetKb = (budget / 1024).toFixed(0);
    const over = r.bytes > budget;
    if (over) failed = true;
    console.log(
      `  ${over ? "✗" : "✓"} ${r.route.padEnd(18)} ${kb.padStart(8)} kB / ${budgetKb} kB  (${r.chunks} scripts)`
    );
  }

  if (process.argv.includes("--baseline")) {
    console.log(
      "[bundle] current numbers above are the baseline — update DEFAULT_BUDGETS in scripts/check-bundle-size.mjs deliberately."
    );
  }

  if (failed) {
    console.error(
      "\n[bundle] BUDGET EXCEEDED — split the import, or consciously re-baseline in scripts/check-bundle-size.mjs."
    );
    process.exit(1);
  }
  console.log("\n[bundle] all routes within budget");
}

main();
