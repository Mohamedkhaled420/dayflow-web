// ============================================================
// /sw.js — the app-shell service worker, served as a ROUTE so
// its bytes are stamped with the CURRENT build id.
//
// WHY A ROUTE (the Phase-4 original lived in public/sw.js):
// a service worker only updates when its script BYTES change.
// The hand-rolled file carried a constant VERSION string
// ("dayflow-shell-v1") across every deploy since Phase 4, so
// browsers kept running + caching under the SAME cache names
// forever — one failed navigation fetch (flaky cell moment,
// mid-deploy hit, offline wake) and the runtime cache served a
// STALE HTML shell whose /_next/static chunk graph no longer
// existed. The page then booted with MISSING Tailwind utilities
// (position:fixed computed to static) and every sheet rendered
// in-flow mid-scroll: floating above the dock, sliced at panel
// edges — the "messed up borders" that no in-repo fix could
// cure, because the device never ran the new code.
//
// Embedding the build id makes every deploy a NEW worker:
//   install  → skipWaiting
//   activate → purge every cache from OTHER build ids, claim
// The registrar reloads the page on controllerchange, so an
// already-open PWA session snaps to the new build instead of
// running stale until iOS kills it.
// ============================================================

import { readFileSync } from "node:fs";

export const dynamic = "force-dynamic";

/**
 * A stamp that is STABLE within one deployment but DIFFERENT across
 * deployments — that is the whole contract: the worker's bytes must
 * change every release or browsers keep running (and caching under)
 * the previous build forever.
 *
 * Resolution order:
 *   1. DF_BUILD_STAMP      — explicit override (self-hosted / CI)
 *   2. VERCEL_GIT_COMMIT_SHA — Vercel runtime env on git-connected
 *                              deployments (per-commit, stable)
 *   3. VERCEL_DEPLOYMENT_ID  — unique per Vercel deployment
 *   4. .next/BUILD_ID        — on disk next to a `next start` server
 *   5. "unknown"             — last resort; correct JS, no auto-update
 */
let stampCache: string | null = null;
function buildStamp(): string {
  if (stampCache) return stampCache;
  let stamp =
    process.env.DF_BUILD_STAMP ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "";
  if (!stamp) {
    try {
      stamp = readFileSync(".next/BUILD_ID", "utf8").trim();
    } catch {
      stamp = "";
    }
  }
  stampCache = stamp || "unknown";
  return stampCache;
}

const WORKER_SOURCE = (buildId: string) => `/* Dayflow app-shell service worker — build ${buildId} */
const VERSION = "${buildId}";
const SHELL_CACHE = "dayflow-shell-" + VERSION;
const RUNTIME_CACHE = "dayflow-runtime-" + VERSION;

/* Immutable, same-origin app-shell assets (content-hashed by Next). */
const SHELL_ASSETS = [
  "/manifest.json",
  "/logo.svg",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

/* Keep the runtime cache small: HTML documents + the rare successful
 * GET /api/* response. FIFO trim — insertion order is good enough. */
const RUNTIME_CACHE_MAX_ENTRIES = 25;

self.addEventListener("install", (event) => {
  // Activate immediately instead of waiting for old tabs to close.
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Precache each shell asset independently — one 404 must not
      // fail the whole install.
      await Promise.all(
        SHELL_ASSETS.map((url) => cache.add(url).catch(() => undefined))
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop EVERY cache that belongs to another build — stale HTML
      // and its chunk graph can never outlive a deploy.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      // Take control of unclaimed clients on first activation.
      await self.clients.claim();
    })()
  );
});

/* Manual-apply escape hatch for future UIs that prefer a toast. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only same-origin GETs are managed. POST (coach / shortcuts ingest),
  // PATCH, cross-origin (Supabase REST, Groq), and realtime websockets
  // always go straight to the network — never cached, never replayed.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never touch RSC / flight data or prefetch probes — Next owns those.
  if (url.searchParams.has("_rsc")) return;

  // ---- 1. Static app shell: cache-first ------------------------
  // /_next/static/* is content-hashed (immutable). Icons and the
  // manifest are versioned with the deploy that ships this worker.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/logo.svg" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ---- 2. API routes: network-first ----------------------------
  // Fresh Supabase/Groq data wins. The cache is consulted ONLY when
  // the network is unreachable (offline PWA fallback), and only for
  // successful 2xx GET responses that were stored earlier.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  // ---- 3. Navigations: network-first ---------------------------
  // Fresh HTML whenever the network is up (so new deploys surface on
  // the next launch); the last good shell boots the app offline.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  // Everything else: default browser behaviour.
});

/* ---------------- strategies ---------------- */

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await trimCache(cacheName, RUNTIME_CACHE_MAX_ENTRIES);
      cache.put(request, response.clone());
    }
    return response;
  } catch (offline) {
    const hit = await cache.match(request);
    if (hit) return hit;
    // Nothing cached and no network: a navigable JSON error beats a
    // browser dinosaur for the PWA.
    return new Response(
      JSON.stringify({ error: "offline", message: "Dayflow is offline and this resource was never cached." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) {
    await cache.delete(key);
  }
}
`;

export async function GET(): Promise<Response> {
  return new Response(WORKER_SOURCE(buildStamp()), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Never let an intermediary or the HTTP disk cache pin an old
      // worker script — update checks must always see fresh bytes.
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
    },
  });
}
