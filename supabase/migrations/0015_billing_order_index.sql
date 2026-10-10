-- ============================================================
-- 0015 — Billing lookup index
-- ------------------------------------------------------------
-- /api/billing/checkout writes a mapping row (order_id → payer)
-- before minting each NOWPayments invoice, and /api/billing/ipn
-- resolves the payer with:
--   select payload from billing_events
--   where order_id = $1 and payment_status = 'checkout_created'
-- This index keeps that lookup cheap as the audit trail grows.
-- ============================================================

create index if not exists billing_events_order_idx
  on public.billing_events (order_id);
