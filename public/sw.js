/* ============================================================
 * Dayflow AI — minimal app-shell service worker (Phase 4)
 * ------------------------------------------------------------
 * Hand-rolled on purpose: no next-pwa / Serwist, no build step.
 * Strategies (per Phase 4 brief):
 *   /api/*            → NETWORK-FIRST  (fresh Supabase/Groq data;
 *                                        cache is an offline fallback
 *                                        only, and never for POSTs)
 *   /_next/static/*   → CACHE-FIRST    (content-hashed, immutable)
 *   icons/manifest    → CACHE-FIRST    (versioned with the app)
 *   navigations (HTML)→ NETWORK-FIRST  (fresh shell when online,
 *                                        cached shell when offline)
 * Everything else (POSTs, cross-origin, Supabase realtime WSS)
 * passes straight through to the network untouched.
 * ============================================================ */

const VERSION = "dayflow-shell-v1";
const SHELL_CACHE = `dayflow-shell-${VERSION}`;
const RUNTIME_CACHE = `dayflow-runtime-${VERSION}`;

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
      // Drop caches from previous service-worker versions.
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
  // manifest are versioned with the deploy that ships this sw.js.
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
