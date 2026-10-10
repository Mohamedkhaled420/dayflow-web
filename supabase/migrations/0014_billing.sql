-- ============================================================
-- 0014 — Billing wiring (audit P0-6)
-- ------------------------------------------------------------
-- subscriptions: one row per user, the source of truth for
--   "what plan am I on". Clients SELECT their own row; writes
--   happen ONLY from the server (the NOWPayments IPN route,
--   service-role) so no client can flip themselves to plus.
--
-- billing_events: append-only audit trail of every IPN payload
--   we accepted. Service-role only, both directions.
--
-- Plans: 'free' (default, everything today) | 'plus' (future
--   paid tier — gates nothing yet; the app reads the row and
--   shows it in Settings → Plan).
-- ============================================================

create table if not exists public.subscriptions (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  plan                 text not null default 'free',
  status               text not null default 'active',
  provider             text,
  provider_ref         text,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint subscriptions_plan_check check (plan in ('free', 'plus')),
  constraint subscriptions_status_check check (status in ('active', 'canceled', 'past_due', 'expired'))
);

alter table public.subscriptions enable row level security;

-- The user may READ their own plan; nothing else.
create policy subscriptions_owner_select on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create index if not exists subscriptions_provider_ref_idx
  on public.subscriptions (provider_ref);

create table if not exists public.billing_events (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  purchase_id    text,
  order_id       text,
  payment_status text,
  payload        jsonb not null
);

alter table public.billing_events enable row level security;
-- No policies at all: IPN-route (service role) only.

create index if not exists billing_events_created_idx
  on public.billing_events (created_at desc);

comment on table public.subscriptions is
  'One row per user. plan: free | plus. Written only by the NOWPayments IPN route (service role).';
comment on table public.billing_events is
  'Append-only audit trail of accepted NOWPayments IPN payloads.';
