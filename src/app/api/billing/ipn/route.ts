// ============================================================
// Dayflow AI — /api/billing/ipn (audit P0-6)
// ------------------------------------------------------------
// The NOWPayments webhook. Verifies the x-nowpayments-sig header
// (HMAC-SHA512 over the SORTED JSON of the specific fields
// NOWPayments signs — their documented algorithm) with a
// timing-safe compare, then flips the payer's subscription to
// plan 'plus' and appends the payload to billing_events.
//
// Env required:
//   NOWPAYMENTS_IPN_SECRET    — from the NOWPayments dashboard
//   SUPABASE_SERVICE_ROLE_KEY — to write past RLS (webhook has
//                               no user session, by definition)
// Missing either → 503 logged loudly; the provider retries.
//
// Status mapping (NOWPayments payment_status):
//   waiting / confirming / confirmed → keep listening (no write)
//   finished                          → plan 'plus', status 'active'
//   failed / expired / refunded      → plan 'free', status 'canceled'
// ============================================================

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/utils/supabase/service";

export const runtime = "nodejs";

/** The exact fields NOWPayments includes in the IPN signature,
 * sorted alphabetically (their documented sort). */
const SIGNED_FIELDS = [
  "payment_status",
  "price_amount",
  "price_currency",
  "actually_paid",
  "pay_currency",
  "order_description",
  "order_id",
  "purchase_id",
] as const;

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  let sorted: Record<string, unknown>;
  try {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    sorted = {};
    for (const key of SIGNED_FIELDS) {
      if (key in body) sorted[key] = body[key];
    }
  } catch {
    return false;
  }
  // NOWPayments serializes the sorted object with their exact
  // spacing (no spaces after separators).
  const material = JSON.stringify(sorted);
  const expected = createHmac("sha512", secret).update(material).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  const service = createServiceClient();

  if (!secret || !service) {
    console.error(
      "[billing/ipn] not configured:",
      !secret ? "NOWPAYMENTS_IPN_SECRET missing" : "",
      !service ? "SUPABASE_SERVICE_ROLE_KEY missing" : ""
    );
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-nowpayments-sig");

  if (!verifySignature(rawBody, signature, secret)) {
    console.warn("[billing/ipn] BAD SIGNATURE — rejected");
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const status = typeof body.payment_status === "string" ? body.payment_status : "";
  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  const purchaseId = typeof body.purchase_id === "string" ? body.purchase_id : "";

  // Audit trail first — every VERIFIED payload is recorded, even
  // the intermediate states (waiting/confirming).
  await service.from("billing_events").insert({
    purchase_id: purchaseId || null,
    order_id: orderId || null,
    payment_status: status || null,
    payload: body,
  });

  // Intermediate states: acknowledged, nothing to change.
  if (!["finished", "failed", "expired", "refunded"].includes(status)) {
    return Response.json({ received: true, acted: false });
  }

  // Resolve the user: our checkout minted order_id as
  // "<prefix>-<user uuid>" (see /api/billing/checkout). Parse
  // defensively — a foreign order_id is acknowledged and ignored.
  const prefix = process.env.NOWPAYMENTS_ORDER_PREFIX ?? "dfplus";
  const m = orderId.match(new RegExp(`^${prefix}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`, "i"));
  if (!m) {
    console.warn("[billing/ipn] unresolvable order_id:", orderId);
    return Response.json({ received: true, acted: false });
  }
  const userId = m[1];

  const plus = status === "finished";
  const { error } = await service
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan: plus ? "plus" : "free",
        status: plus ? "active" : "canceled",
        provider: "nowpayments",
        provider_ref: purchaseId || orderId,
        current_period_start: plus ? new Date().toISOString() : null,
        current_period_end: plus
          ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[billing/ipn] subscription write failed:", error.message);
    return Response.json({ error: "write failed" }, { status: 500 });
  }

  console.log(`[billing/ipn] user ${userId.slice(0, 8)}… → ${plus ? "plus" : "free"} (${status})`);
  return Response.json({ received: true, acted: true });
}

export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
