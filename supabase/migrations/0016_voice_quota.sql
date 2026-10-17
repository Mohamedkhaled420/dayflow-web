-- ============================================================
-- 0016 — Daily voice quota (Plus monetization, approved model)
-- ------------------------------------------------------------
-- The approved model (2026-10-17):
--   Free plan : 5 minutes of Dia voice per day (300 s)
--   Plus      : $14.99/yr, unlimited voice (server-side abuse
--               guard at 2 h/day — no human hits it)
--
-- voice_usage: one row per user per UTC day, seconds consumed.
--   Clients SELECT their own row (to show "2:14 left today");
--   writes happen ONLY through record_voice_seconds() — a
--   SECURITY DEFINER RPC the voice relay calls with the user's
--   cookie session, mirroring consume_rate_limit() (0013).
--   Users can only ever INCREASE their own counter (positive,
--   clamped increments) — there is no path to reset or shrink it.
--
-- Day = UTC day (resets 02:00 Cairo). Kept UTC deliberately:
--   no per-user timezone plumbing, and a 2 AM reset is invisible.
--
-- ROLLOUT NOTE: until this migration is applied, the relay's
--   usage reads fail soft → 0 used → quota is NOT enforced
--   (availability first, same policy as the rate limiter). The
--   metering RPC errors are logged; enforcement flips on the
--   moment the migration lands.
-- ============================================================

create table if not exists public.voice_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  seconds    integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  constraint voice_usage_seconds_check check (seconds >= 0)
);

alter table public.voice_usage enable row level security;
revoke all on public.voice_usage from anon;

-- The user may READ their own usage (the quota chip in the coach
-- pane + Settings); nothing else.
create policy voice_usage_owner_select on public.voice_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert/update/delete policies: record_voice_seconds()
-- (security definer) is the only writer.

comment on table public.voice_usage is
  'Daily Dia-voice seconds per user (UTC day). Free = 300 s/day, Plus = 7200 s/day. Written only by record_voice_seconds().';

-- ---------- atomic increment (the relay's meter) ----------

create or replace function public.record_voice_seconds(
  p_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_add  integer;
  v_total integer;
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Sign in required.';
  end if;

  -- Clamp: positive only, at most 10 minutes per call (one relay
  -- flush is <= 60 s; the clamp just bounds forged/weird calls —
  -- a user inflating their OWN counter is harmless, resetting it
  -- is impossible from here).
  v_add := greatest(1, least(coalesce(p_seconds, 1), 600));

  insert into public.voice_usage (user_id, day, seconds)
  values (v_uid, (now() at time zone 'utc')::date, v_add)
  on conflict (user_id, day)
  do update set seconds = public.voice_usage.seconds + v_add,
                updated_at = now()
  returning seconds into v_total;

  -- Opportunistic cleanup: this caller's rows older than 3 days
  -- (the quota only ever reads TODAY's row). Spread across
  -- callers this keeps the table lean without a scheduled job.
  delete from public.voice_usage
   where user_id = v_uid
     and day < (now() at time zone 'utc')::date - 3;

  return v_total;
end;
$$;

revoke all on function public.record_voice_seconds(integer) from public, anon;
grant execute on function public.record_voice_seconds(integer) to authenticated;

comment on function public.record_voice_seconds(integer) is
  'Atomic daily-voice-seconds increment (relay metering). Returns the new total for today (UTC). Prunes the caller''s stale rows.';
