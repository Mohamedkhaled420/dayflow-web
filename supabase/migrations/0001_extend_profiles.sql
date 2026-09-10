alter table public.profiles
  add column if not exists chronobiology jsonb not null default '{}'::jsonb,
  add column if not exists occupational_context jsonb not null default '{}'::jsonb,
  add column if not exists psychology jsonb not null default '{}'::jsonb,
  add column if not exists metabolism jsonb not null default '{}'::jsonb,
  add column if not exists last_sync_timestamp timestamptz;

drop policy if exists "own profile" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Profiles are not directly deletable by application users.

create index if not exists profiles_sync_timestamp_idx on public.profiles (last_sync_timestamp);

comment on column public.profiles.last_sync_timestamp is 'Cursor used by the Delta Sync protocol.';
comment on column public.profiles.chronobiology is 'Chronotype and sleep preference state.';
comment on column public.profiles.occupational_context is 'Work and schedule context.';
comment on column public.profiles.psychology is 'Goals, motivations, and behavioral context.';
comment on column public.profiles.metabolism is 'Nutrition and metabolic context.';

alter table public.profiles enable row level security;
revoke delete on public.profiles from authenticated;
revoke delete on public.profiles from anon;
revoke insert, update, select on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;
grant usage on schema public to authenticated;

create or replace function public.initialize_profile(p_user_id uuid, p_timezone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, chronobiology, occupational_context, psychology, metabolism)
  values (
    p_user_id,
    jsonb_build_object('chronotype', 'intermediate', 'timezone', coalesce(p_timezone, 'UTC')),
    jsonb_build_object('timezone', coalesce(p_timezone, 'UTC')),
    '{}'::jsonb,
    '{}'::jsonb
  )
  on conflict (id) do nothing;
end;
$$;
revoke execute on function public.initialize_profile(uuid, text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.initialize_profile(new.id, coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC'));
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated; 

 drop trigger if exists on_auth_user_created on auth.users;
 create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles add constraint profiles_chronobiology_object check (jsonb_typeof(chronobiology) = 'object');
alter table public.profiles add constraint profiles_occupational_context_object check (jsonb_typeof(occupational_context) = 'object');
alter table public.profiles add constraint profiles_psychology_object check (jsonb_typeof(psychology) = 'object');
alter table public.profiles add constraint profiles_metabolism_object check (jsonb_typeof(metabolism) = 'object');

-- Backfill any pre-existing row with the onboarding default.
update public.profiles set chronobiology = jsonb_build_object('chronotype', 'intermediate', 'timezone', 'UTC') where chronobiology = '{}'::jsonb;
update public.profiles set occupational_context = jsonb_build_object('timezone', 'UTC') where occupational_context = '{}'::jsonb;

-- Keep the function available to the auth trigger, but not to client roles.
revoke all on function public.handle_new_user() from public;
revoke all on function public.initialize_profile(uuid, text) from public;

-- Restore the trigger function's ability to insert despite profile RLS.
grant execute on function public.handle_new_user() to postgres;
grant execute on function public.initialize_profile(uuid, text) to postgres;

-- The auth trigger executes as the function owner; no client role can invoke it.

-- Ensure the default row remains owner-scoped even if policies predated this migration.
comment on table public.profiles is 'Private, owner-scoped profile state.';

-- The existing schema uses id as the profile/user key; there is no separate user_id column.
-- This is the equivalent of user_id = auth.uid() for this table.

-- Remove accidental whitespace-sensitive duplicate policy names from older setups.
