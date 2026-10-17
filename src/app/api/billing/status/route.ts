// ============================================================
// Focus Triad — /api/billing/status (audit P0-6)
// ------------------------------------------------------------
// The client's source of truth for "what plan am I on".
// Reads the caller's own subscriptions row through RLS (select-
// own policy, migration 0014) — no service key, no privilege.
// Everyone without a row is on the free plan.
//
// `pendingCheckout` (added with the checkout-return fix): true
// when this user has a checkout_created mapping row from the
// last 24h — i.e. we minted them an invoice that hasn't settled
// yet (paid-but-confirming, or abandoned). The Settings Plus row
// uses it to show "Confirming payment…" instead of Upgrade, so
// the loop stays honest while crypto settlement runs. Looked up
// with the service client (billing_events has no user-facing
// RLS by design); any lookup error fails CLOSED to false — the
// row is cosmetic, the subscription is the truth.
// ============================================================

import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";

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

  const plan = data?.plan ?? "free";

  // Already plus → nothing can be pending that matters.
  let pendingCheckout = false;
  if (plan !== "plus") {
    const service = createServiceClient();
    if (service) {
      const { count, error: pendingError } = await service
        .from("billing_events")
        .select("id", { count: "exact", head: true })
        .eq("payment_status", "checkout_created")
        .gt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .contains("payload", { user_id: user.id });
      if (!pendingError && (count ?? 0) > 0) {
        pendingCheckout = true;
      } else if (pendingError) {
        console.warn("[billing/status] pending lookup failed:", pendingError.message);
      }
    }
  }

  return Response.json({
    plan,
    status: data?.status ?? "active",
    currentPeriodEnd: data?.current_period_end ?? null,
    pendingCheckout,
  });
}

export function POST() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
