// ============================================================
// Dayflow AI — /api/health (audit P2: uptime monitoring target)
// ------------------------------------------------------------
// Zero-auth liveness + readiness probe for uptime monitors
// (UptimeRobot, Better Stack, Vercel cron …). Never leaks
// internals: status, version, and a coarse DB roundtrip time.
// The DB check degrades — the app can serve cached/PWA content
// during a database blip, so the route reports state honestly
// instead of hard-failing on one dependency.
// ============================================================

import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let db: "ok" | "degraded" | "down" = "down";
  let dbLatencyMs: number | null = null;

  try {
    const supabase = await createClient();
    // Cheapest possible roundtrip: health_ping() (migration 0013)
    // is granted to anon and touches no table — it proves the
    // auth gateway + PostgREST + Postgres are all alive without
    // needing any data privileges.
    const t0 = Date.now();
    const { error } = await supabase.rpc("health_ping");
    dbLatencyMs = Date.now() - t0;
    if (!error) db = "ok";
    else if (Date.now() - started < 10_000) db = "degraded";
  } catch {
    // keep "down"
  }

  const body = {
    status: db === "ok" ? "ok" : "degraded",
    db,
    dbLatencyMs,
    // Vercel injects VERCEL_GIT_COMMIT_SHA per deployment; fall
    // back to the build id, then "dev" for local runs.
    version:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
      process.env.NEXT_PUBLIC_BUILD_ID ??
      "dev",
    time: new Date().toISOString(),
  };

  return Response.json(body, {
    status: db === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
