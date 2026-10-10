import type { NextConfig } from "next";

// ============================================================
// Dayflow AI — security headers (audit P0-3)
// ------------------------------------------------------------
// Belt-and-braces baseline: HSTS, nosniff, frame denial,
// referrer trimming, a permissions policy that only ever
// exposes the mic (the voice coach), and a CSP that locks
// scripts/styles to first-party + inline (Next's bootstrap and
// RSC flight payloads are inline by design), network egress to
// self + Supabase (REST + realtime WSS), and workers to
// same-origin blob (the SoulOrb's shader chunk).
//
// Deliberate choices:
//   * 'unsafe-inline' on script-src rather than nonces — the
//     nonce plumbing (middleware → header → every script) is a
//     larger refactor with PWA/service-worker edge cases; the
//     external-script block (only 'self' + inline) plus
//     connect-src/img-src locks still kill the practical XSS
//     exfil paths. Nonce-based CSP is the documented upgrade.
//   * 'unsafe-eval' ONLY in dev (React Refresh); production
//     ships without it.
//   * The Supabase project URL is read from the env the config
//     itself runs with, so preview deployments match.
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseOrigin = (() => {
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return "";
  }
})();

const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  supabaseOrigin
    ? `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}`
    : "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
