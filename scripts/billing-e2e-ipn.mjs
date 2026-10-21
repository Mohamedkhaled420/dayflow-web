// ============================================================
// Billing E2E — signed NOWPayments IPN sender (sandbox test tool)
// ------------------------------------------------------------
// Crafts IPN payloads and signs them EXACTLY as NOWPayments does
// (HMAC-SHA512 over ':'-joined sorted values, algorithm A of the
// three our /api/billing/ipn accepts) then POSTs them to the
// running app. Usage:
//   node billing-e2e-ipn.mjs finished  <order_id> [purchase_id]
//   node billing-e2e-ipn.mjs refunded  <order_id> [purchase_id]
//   node billing-e2e-ipn.mjs waiting   <order_id> [purchase_id]
//   node billing-e2e-ipn.mjs badsig    <order_id> [purchase_id]
// ============================================================

import { createHmac } from "node:crypto";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SECRET = process.env.NOWPAYMENTS_IPN_SECRET ?? "sandbox-ipn-secret";

const status = process.argv[2] ?? "finished";
const orderId = process.argv[3];
const purchaseId = process.argv[4] ?? `np-purchase-${Date.now()}`;

if (!orderId) {
  console.error("usage: billing-e2e-ipn.mjs <status> <order_id> [purchase_id]");
  process.exit(2);
}

// A realistic NOWPayments IPN body (superset is fine — the audit
// trail records everything; the signature covers ALL keys sorted).
const body = {
  payment_id: 1234567890,
  payment_status: status,
  pay_address: "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
  pay_currency: "usdttrc20",
  pay_amount: 14.99,
  purchase_id: purchaseId,
  order_id: orderId,
  order_description: "Focus Triad Plus — 1 year of unlimited voice",
  price_amount: 14.99,
  price_currency: "usd",
  actually_paid: 14.99,
  outcome_amount: 14.99,
  outcome_currency: "usdt",
};

const raw = JSON.stringify(body);

// Algorithm A (current NOWPayments docs): sort keys, join VALUES with ':'
const material = Object.keys(body)
  .sort()
  .map((k) => {
    const v = body[k];
    return v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v);
  })
  .join(":");

const sig =
  status === "badsig"
    ? "deadbeef".repeat(16) // wrong signature on purpose
    : createHmac("sha512", SECRET).update(material, "utf8").digest("hex");

const res = await fetch(`${APP}/api/billing/ipn`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-nowpayments-sig": sig },
  body: raw,
});

const text = await res.text();
console.log(
  JSON.stringify({ status, http: res.status, body: text.slice(0, 300) }, null, 2)
);
