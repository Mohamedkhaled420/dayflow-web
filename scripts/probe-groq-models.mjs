#!/usr/bin/env node
/**
 * probe-groq-models.mjs — verify the routed model registry against the
 * LIVE Groq catalog (v0 audit #15: model IDs are a runtime failure
 * point; a decommissioned or renamed ID makes every cascade hop fail
 * and the coach silently degrades to the algorithmic floor).
 *
 * Usage:
 *   GROQ_API_KEY=gsk_... node scripts/probe-groq-models.mjs
 *   GROQ_API_KEY=gsk_... node scripts/probe-groq-models.mjs --deep
 *
 * --deep additionally sends a 1-token completion to each routed model
 * (chat + reasoning_effort + json flags exactly as the route sends
 * them), so "catalog says it exists" becomes "the route can use it".
 *
 * Exit codes: 0 = registry healthy, 1 = at least one routed ID is
 * missing/broken, 2 = could not reach the Groq API at all.
 *
 * The registry lives in src/lib/groq-models.ts — this script is the
 * repeatable version of the "human-run probe" that validated it on
 * 2026-09-11. Run it whenever Groq announces catalog changes.
 */
import { readFileSync } from "node:fs";

// ---- read the registry straight from source (no TS import needed) ----
const src = readFileSync(
  new URL("../src/lib/groq-models.ts", import.meta.url),
  "utf8"
);
const ROUTED = [...src.matchAll(/:\s*"(qwen\/[^"]+|openai\/[^"]+)"/g)].map(
  (m) => m[1]
);
if (ROUTED.length === 0) {
  console.error("probe: could not parse routed IDs from src/lib/groq-models.ts");
  process.exit(2);
}

const KEY = process.env.GROQ_API_KEY;
if (!KEY) {
  console.error("probe: GROQ_API_KEY is not set");
  process.exit(2);
}

const deep = process.argv.includes("--deep");
const label = (id) => id.padEnd(28);

// ---- catalog check ----
let catalog;
try {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) {
    console.error(`probe: catalog fetch failed (HTTP ${res.status})`);
    process.exit(2);
  }
  catalog = new Set(
    ((await res.json()).data ?? []).map((m) => m.id)
  );
} catch (e) {
  console.error(`probe: could not reach Groq — ${e?.message ?? e}`);
  process.exit(2);
}

console.log(`Groq catalog: ${catalog.size} models visible to this key.`);
let failures = 0;
for (const id of ROUTED) {
  if (catalog.has(id)) {
    console.log(`  ✓ ${label(id)} in catalog`);
  } else {
    failures++;
    console.log(`  ✗ ${label(id)} MISSING from catalog`);
  }
}

// ---- deep check: a tiny completion per routed model ----
if (deep) {
  console.log("\nDeep probe (1-token completion per routed model)…");
  for (const id of ROUTED) {
    if (!catalog.has(id)) continue;
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify({
          model: id,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
          max_completion_tokens: 8,
          reasoning_effort: "low",
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        console.log(`  ✓ ${label(id)} answers (reasoning_effort accepted)`);
      } else {
        const body = await res.text().catch(() => "");
        failures++;
        console.log(
          `  ✗ ${label(id)} HTTP ${res.status} — ${body.slice(0, 120)}`
        );
      }
    } catch (e) {
      failures++;
      console.log(`  ✗ ${label(id)} ${e?.name ?? "error"}: ${e?.message ?? e}`);
    }
  }
}

console.log(
  failures === 0
    ? "\nRegistry healthy — every routed model is available."
    : `\n${failures} routed model(s) unavailable — update src/lib/groq-models.ts.`
);
process.exit(failures === 0 ? 0 : 1);
