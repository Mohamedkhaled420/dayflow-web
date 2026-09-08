-- ============================================================
-- Dayflow web — Supabase schema (for the future hosted version)
--
-- The shapes map 1:1 onto the TypeScript types in src/lib/types.ts
-- so the localStorage mock provider in src/lib/store.ts can be
-- swapped for Supabase queries without touching any view code.
--
-- Setup:
--   1. Create a project at supabase.com
--   2. Run this file in the SQL editor
--   3. Set env vars in Vercel:
--        NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
--        NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
--   4. Add auth (email magic link is the quickest), and swap the
--      provider functions in src/lib/store.ts for supabase-js
--      calls — each store action becomes an insert/update/delete
--      plus an optimistic local set.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- profiles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default 'Your name',
  emoji       text not null default '🌊',
  role        text not null default '',
  water_glass_ml integer not null default 250,
  goals       jsonb not null default '{}'::jsonb,
  -- goals jsonb shape: {
  --   "workMinutes": 420, "personalMinutes": 90, "fitnessMinutes": 45,
  --   "fitnessSessionsPerWeek": 4, "sleepMinutes": 480,
  --   "waterGlasses": 8, "mealsPerDay": 3
  -- }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- categories ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color_hex   text not null default '#A0AEC0',
  icon        text not null default 'circle',
  kind        text not null default 'time' check (kind in ('time', 'counter')),
  is_system   boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------- tracked events (workouts, work, personal, meals, sleep) ----------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  date_key    date not null,              -- the day the event belongs to (sleep = wake-up day)
  title       text not null,
  start_time  time not null,
  end_time    time not null,              -- end <= start means the block crosses midnight
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists events_user_date_idx
  on public.events (user_id, date_key desc);

-- ---------- water entries ----------
create table if not exists public.water_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date_key    date not null,
  time        time not null default '12:00',
  ml          integer not null default 250,
  created_at  timestamptz not null default now()
);

create index if not exists water_user_date_idx
  on public.water_entries (user_id, date_key desc);

-- ---------- automatic profile on signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row level security: users only see their own rows ----------
alter table public.profiles      enable row level security;
alter table public.categories    enable row level security;
alter table public.events        enable row level security;
alter table public.water_entries enable row level security;

create policy "own profile"   on public.profiles      for all using (auth.uid() = id);
create policy "own categories" on public.categories  for all using (auth.uid() = user_id);
create policy "own events"    on public.events        for all using (auth.uid() = user_id);
create policy "own water"     on public.water_entries for all using (auth.uid() = user_id);

-- ---------- realtime (optional, nice for multi-device) ----------
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.water_entries;
