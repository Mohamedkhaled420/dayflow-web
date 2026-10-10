// ============================================================
// Dayflow AI — /api/billing/checkout (audit P0-6)
// ------------------------------------------------------------
// Creates a NOWPayments invoice for the Dayflow Plus plan and
// returns the hosted checkout URL.
//
// Gated on the FULL reconciliation chain — we only take money
// when every hop that delivers Plus is provably configured:
//   NOWPAYMENTS_API_KEY      — mint the invoice
//   NOWPAYMENTS_IPN_SECRET   — verify the webhook that confirms
//                              the payment
//   SUPABASE_SERVICE_ROLE_KEY — write the subscription flip past
//                              RLS in that webhook
// Anything missing → 503 configured:false (the UI says "coming
// soon" instead of taking unreconcilable money).
//
// Flow: user taps Upgrade → we mint a unique order_id
// "dfplus-<uuid>" → a billing_events row (payment_status
// 'checkout_created', payload.user_id) maps that order to the
// payer → NOWPayments hosts the payment → the user pays in any
// of the crypto currencies the invoice page offers → NOWPayments
// POSTs /api/billing/ipn (HMAC-verified) → the IPN resolves the
// payer through the mapping row and flips the subscription to
// plan 'plus'.
// ============================================================

import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";

export const runtime = "nodejs";

const DEFAULT_PRICE_USD = 4.99;

export async function POST(req: Request) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  const price = Number(process.env.NOWPAYMENTS_PRICE_USD ?? DEFAULT_PRICE_USD);
  const service = createServiceClient();

  if (!apiKey || !ipnSecret || !service || !Number.isFinite(price) || price <= 0) {
    return Response.json(
      {
        configured: false,
        error: "Billing is not configured on this deployment yet.",
      },
      { status: 503 }
    );
  }

  // Signed-in users only — the order must map back to a user.
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

  const origin = new URL(req.url).origin;
  const prefix = process.env.NOWPAYMENTS_ORDER_PREFIX ?? "dfplus";
  const orderId = `${prefix}-${crypto.randomUUID()}`;

  // Record the order→payer mapping BEFORE minting. The IPN
  // webhook only knows the order_id — this row is how it finds
  // the user whose subscription to flip. If we can't record it,
  // we don't take the payment.
  const { error: mapError } = await service.from("billing_events").insert({
    order_id: orderId,
    payment_status: "checkout_created",
    payload: {
      user_id: user.id,
      email: user.email ?? null,
      price_amount: price,
      price_currency: "usd",
    },
  });
  if (mapError) {
    console.error("[billing/checkout] mapping insert failed:", mapError.message);
    return Response.json(
      { error: "Couldn't start the upgrade — try again in a moment." },
      { status: 502 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    const res = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: price,
        price_currency: "usd",
        pay_currency: "usdttrc20", // USDT on Tron — cheapest stable rail; the invoice page lists every supported crypto
        order_id: orderId,
        order_description: "Dayflow Plus subscription",
        ipn_callback_url: `${origin}/api/billing/ipn`,
        success_url: `${origin}/?upgraded=1`,
        cancel_url: `${origin}/?canceled=1`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[billing/checkout] nowpayments error:", res.status, text.slice(0, 300));
      return Response.json(
        { error: "The payment provider didn't accept the request. Try again in a moment." },
        { status: 502 }
      );
    }
    payload = (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn("[billing/checkout] nowpayments unreachable:", e);
    return Response.json(
      { error: "Couldn't reach the payment provider — check your connection." },
      { status: 502 }
    );
  }

  const invoiceUrl =
    typeof payload.invoice_url === "string" ? payload.invoice_url : null;
  if (!invoiceUrl) {
    console.warn("[billing/checkout] no invoice_url in response");
    return Response.json(
      { error: "The payment provider returned an unexpected response." },
      { status: 502 }
    );
  }

  // Best-effort: link the invoice id to the mapping row so
  // support can trace user → invoice → payment. Failure is
  // harmless (the order_id mapping above is what matters).
  if (typeof payload.id === "string") {
    void service
      .from("billing_events")
      .update({ purchase_id: payload.id })
      .eq("order_id", orderId)
      .eq("payment_status", "checkout_created")
      .then(({ error }) => {
        if (error) console.warn("[billing/checkout] invoice link failed:", error.message);
      });
  }

  return Response.json({ invoiceUrl, orderId });
}

export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
