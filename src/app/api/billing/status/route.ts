// ============================================================
// Dayflow AI — /api/billing/status (audit P0-6)
// ------------------------------------------------------------
// The client's source of truth for "what plan am I on".
// Reads the caller's own subscriptions row through RLS (select-
// own policy, migration 0014) — no service key, no privilege.
// Everyone without a row is on the free plan.
// ============================================================

import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      { code: "INVALID_SESSION", error: "Sign in again — your session expired." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[billing/status] read failed:", error.message);
    return Response.json({ plan: "free", status: "active" }, { status: 200 });
  }

  return Response.json({
    plan: data?.plan ?? "free",
    status: data?.status ?? "active",
    currentPeriodEnd: data?.current_period_end ?? null,
  });
}

export function POST() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
