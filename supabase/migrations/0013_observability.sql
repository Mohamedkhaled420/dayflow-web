-- ============================================================
-- 0013 — Observability + durable rate limiting (audit P0-4/P0-5)
-- ------------------------------------------------------------
-- error_events: the in-house error monitor. Client hooks and
--   route catch-blocks append rows; nobody can read them back
--   through PostgREST (no select policy — service-role reads
--   only). Authenticated users may insert their OWN rows.
--
-- rate_limit_hits + consume_rate_limit(): the serverless-safe
--   limiter. The old in-memory Map died with every lambda
--   instance; this one lives in Postgres behind a SECURITY
--   DEFINER RPC so users cannot reset their own counters
--   (insert-only from the function's perspective, no client
--   policies at all). Each call appends one hit row after
--   counting the window — and opportunistically vacuums the
--   caller's stale rows so no cron is needed.
-- ============================================================

-- ---------- error events ----------

create table if not exists public.error_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,
  kind        text not null,
  message     text not null,
  stack       text,
  url         text,
  user_agent  text,
  context     jsonb not null default '{}'::jsonb,
  constraint error_events_kind_check check (kind in ('client', 'server'))
);

alter table public.error_events enable row level security;
revoke all on public.error_events from anon;

-- Users can file their own errors — nothing else.
create policy error_events_owner_insert on public.error_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create index if not exists error_events_created_idx on public.error_events (created_at desc);
create index if not exists error_events_kind_idx on public.error_events (kind, created_at desc);

comment on table public.error_events is
  'In-house error monitor: client hooks + route catch-blocks append; service-role reads only.';

-- ---------- durable rate limiting ----------

create table if not exists public.rate_limit_hits (
  id      bigint generated always as identity primary key,
  user_id uuid not null,
  bucket  text not null,
  hit_at  timestamptz not null default now()
);

alter table public.rate_limit_hits enable row level security;
-- Deliberately NO policies: only consume_rate_limit() (security
-- definer) touches this table. Clients can neither read, inflate,
-- nor reset counters.
revoke all on public.rate_limit_hits from anon, authenticated;

create index if not exists rate_limit_hits_window_idx
  on public.rate_limit_hits (user_id, bucket, hit_at desc);

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_recent integer;
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Sign in required.';
  end if;
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise invalid_parameter_value using message = 'Bad limiter config.';
  end if;

  select count(*) into v_recent
    from public.rate_limit_hits
   where user_id = v_uid
     and bucket = p_bucket
     and hit_at > now() - make_interval(secs => p_window_seconds);

  if v_recent >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (user_id, bucket) values (v_uid, p_bucket);

  -- Opportunistic cleanup: this caller's long-stale rows only.
  -- Spread across callers, this keeps the table lean without a
  -- scheduled job (none available on this plan).
  delete from public.rate_limit_hits
   where user_id = v_uid
     and bucket = p_bucket
     and hit_at < now() - make_interval(secs => p_window_seconds * 4);

  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

comment on function public.consume_rate_limit(text, integer, integer) is
  'Serverless-safe sliding-window limiter: true = allowed (hit recorded), false = over the limit.';

-- ---------- liveness ping (for /api/health) ----------
-- The anon role has no grants on any domain table (by design —
-- 0001 revoked them), so the health probe needs its own tiny
-- reachable target. Returns the database clock: proves auth
-- gateway + PostgREST + Postgres in one roundtrip, leaks
-- nothing.

create or replace function public.health_ping()
returns timestamptz
language sql
security definer
set search_path = ''
as $$ select now(); $$;

revoke all on function public.health_ping() from public;
grant execute on function public.health_ping() to anon, authenticated;

comment on function public.health_ping() is
  'Liveness probe for /api/health — one roundtrip, no table access, no data.';
