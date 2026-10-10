// ============================================================
// Focus Triad — /api/billing/ipn (audit P0-6)
// ------------------------------------------------------------
// The NOWPayments webhook. Verifies the x-nowpayments-sig header
// (HMAC-SHA512 with the IPN secret) with a timing-safe compare,
// then resolves the payer through the billing_events mapping row
// that /api/billing/checkout wrote at mint time, and flips their
// subscription to plan 'plus'.
//
// Env required:
//   NOWPAYMENTS_IPN_SECRET    — from the NOWPayments dashboard
//   SUPABASE_SERVICE_ROLE_KEY — to write past RLS (webhook has
//                               no user session, by definition)
// Missing either → 503 logged loudly; the provider retries.
//
// Signature: NOWPayments has shipped two documented algorithms
// over the years, so every candidate serialization is tried
// (all HMAC-SHA512 over the same payload, timing-safe compared):
//   A) ':'-joined values of ALL keys, sorted alphabetically
//      (the current docs' algorithm)
//   B) ':'-joined values of the classic signed-fields subset,
//      sorted alphabetically
//   C) JSON.stringify of the sorted signed-fields subset
//      (the legacy docs' algorithm)
//
// Status mapping (NOWPayments payment_status):
//   waiting / confirming / confirming/waiting → ack, no write
//   finished                → plan 'plus', status 'active'
//   failed / expired / refunded → plan 'free', status 'canceled'
// ============================================================

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/service";

export const runtime = "nodejs";

/** The fields NOWPayments has historically included in the IPN
 * signature, sorted alphabetically (their documented sort). */
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hmacHex(secret: string, material: string): string {
  return createHmac("sha512", secret).update(material, "utf8").digest("hex");
}

function hexEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Render a JSON value the way a signing backend would join it
 * into the ':'-separated string: JS string coercion for
 * primitives, JSON for structured values, "null" for null. */
function joinValue(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v) || typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return false;
  }
  const sig = header.trim().toLowerCase();

  // A) current docs: all keys, sorted, values joined with ':'
  const allJoined = Object.keys(body)
    .sort()
    .map((k) => joinValue(body[k]))
    .join(":");
  if (hexEquals(hmacHex(secret, allJoined), sig)) return true;

  // B) classic subset, sorted, values joined with ':'
  const subset: Record<string, unknown> = {};
  for (const key of SIGNED_FIELDS) {
    if (key in body) subset[key] = body[key];
  }
  const subsetJoined = Object.keys(subset)
    .sort()
    .map((k) => joinValue(subset[k]))
    .join(":");
  if (hexEquals(hmacHex(secret, subsetJoined), sig)) return true;

  // C) legacy docs: sorted JSON.stringify of the subset
  if (hexEquals(hmacHex(secret, JSON.stringify(subset)), sig)) return true;

  return false;
}

/** Resolve the payer for an order_id through the mapping row
 * that checkout wrote (payment_status 'checkout_created',
 * payload.user_id). Order ids minted by OUR checkout always
 * have exactly one; a foreign order_id resolves to null and is
 * acknowledged + ignored. */
async function resolvePayer(
  orderId: string,
  service: SupabaseClient
): Promise<string | null> {
  const { data, error } = await service
    .from("billing_events")
    .select("payload")
    .eq("order_id", orderId)
    .eq("payment_status", "checkout_created")
    .order("id", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("[billing/ipn] mapping lookup failed:", error.message);
    return null;
  }
  const payload = data?.[0]?.payload as Record<string, unknown> | undefined;
  const userId = payload?.user_id;
  return typeof userId === "string" && UUID_RE.test(userId) ? userId : null;
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

  // Resolve the payer through the checkout mapping row.
  if (!orderId) {
    console.warn("[billing/ipn] missing order_id");
    return Response.json({ received: true, acted: false });
  }
  const userId = await resolvePayer(orderId, service);
  if (!userId) {
    console.warn("[billing/ipn] no payer mapping for order:", orderId);
    return Response.json({ received: true, acted: false });
  }

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
