-- ============================================================
-- Phase 9 — Nutrition (Cal AI-style calorie & macro tracking)
-- ------------------------------------------------------------
-- meal_logs: one row per logged food item. `source` records how
-- the row was born so the UI can badge AI estimates honestly:
--   'ai'     — estimated by the /api/ai/food cascade (photo or
--              text description), confirmed by the user
--   'manual' — typed by hand (name + kcal + macros)
--   'quick'  — one-tap quick add (future quick-chips)
-- Macros are nullable: a manual "just calories" entry is valid.
-- ============================================================

create table if not exists public.meal_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  calories    integer not null check (calories between 0 and 10000),
  protein_g   integer check (protein_g is null or protein_g between 0 and 1000),
  carbs_g     integer check (carbs_g is null or carbs_g between 0 and 1000),
  fat_g       integer check (fat_g is null or fat_g between 0 and 1000),
  source      text not null default 'manual' check (source in ('ai', 'manual', 'quick')),
  logged_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists meal_logs_user_logged_idx
  on public.meal_logs (user_id, logged_at desc);

-- ---------- RLS: users only see their own rows ----------
alter table public.meal_logs enable row level security;

drop policy if exists "own meal logs" on public.meal_logs;
create policy "own meal logs"
  on public.meal_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- realtime (multi-device mirror of the other logs) ----------
alter publication supabase_realtime add table public.meal_logs;
