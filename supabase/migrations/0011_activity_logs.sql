-- ============================================================
-- "Log anything" — activity_logs: the generic timeline block
-- ------------------------------------------------------------
-- sleep_logs and workout_logs kept their specialized tables
-- (RHR / kcal / exercises ecosystems). Every OTHER category —
-- work, personal, meals, leisure, plus freeform user-invented
-- categories ("study", "gaming", "errands"…) — lands here as a
-- plain time block with an optional note.
--
-- `category` is a freeform slug:
--   - system ids: work | personal | meals | leisure
--   - custom:     user-typed, slugified client-side
--     (rendered via categoryById's pastel fallback)
-- `logged_at` = block START (mirrors workout_logs).
-- ============================================================

create table if not exists public.activity_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  category         text not null default 'leisure',
  title            text not null default '',
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1439),
  notes            text,
  logged_at        timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index if not exists activity_logs_user_logged_idx
  on public.activity_logs (user_id, logged_at desc);

-- ---------- RLS: users only see their own rows ----------
alter table public.activity_logs enable row level security;

drop policy if exists "own activity logs" on public.activity_logs;
create policy "own activity logs"
  on public.activity_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- realtime (multi-device mirror of the other logs) ----------
alter publication supabase_realtime add table public.activity_logs;
