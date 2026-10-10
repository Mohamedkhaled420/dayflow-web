// ============================================================
// Dayflow AI — /api/billing/checkout (audit P0-6)
// ------------------------------------------------------------
// Creates a NOWPayments invoice for the Dayflow Plus plan and
// returns the hosted checkout URL. Gated on server env:
//   NOWPAYMENTS_API_KEY   — from the NOWPayments dashboard
//   NOWPAYMENTS_PRICE_USD — optional, defaults to 4.99
//   NOWPAYMENTS_ORDER_PREFIX — optional id namespace
// When the key is absent the route answers 503 configured:false
// so the UI can say "not available yet" instead of failing cold.
//
// Flow: user taps Upgrade → this route mints order_id
// "dfplus-<uuid>" → NOWPayments hosts the payment → the user
// pays → NOWPayments POSTs /api/billing/ipn (HMAC-verified) →
// the subscription row flips to plan 'plus'.
// ============================================================

import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const DEFAULT_PRICE_USD = 4.99;

export async function POST(req: Request) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  const price = Number(process.env.NOWPAYMENTS_PRICE_USD ?? DEFAULT_PRICE_USD);

  if (!apiKey || !Number.isFinite(price) || price <= 0) {
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
  const orderId = `${process.env.NOWPAYMENTS_ORDER_PREFIX ?? "dfplus"}-${crypto.randomUUID()}`;

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
        pay_currency: "usdt", // cheapest stable rail; NOWPayments shows alternatives at checkout
        order_id: orderId,
        order_description: "Dayflow Plus subscription",
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

  return Response.json({ invoiceUrl, orderId });
}

export function GET() {
  return Response.json({ error: "Method Not Allowed" }, { status: 405 });
}
