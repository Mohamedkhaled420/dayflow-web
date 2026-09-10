create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  streak_count integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  amount_ml integer not null, logged_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null, duration_minutes integer, active_calories integer, logged_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  sleep_minutes integer not null, resting_heart_rate integer, logged_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null, mood_score integer, created_at timestamptz not null default now()
);
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(), member_a uuid not null references public.profiles(id) on delete cascade,
  member_b uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(),
  unique (member_a, member_b), check (member_a <> member_b)
);
create table if not exists public.team_activities (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, activity_type text not null,
  payload jsonb not null default '{}'::jsonb, "timestamp" timestamptz not null default now(), created_at timestamptz not null default now()
);
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade, invitee_email text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')), created_at timestamptz not null default now()
);

create index if not exists habits_user_idx on public.habits(user_id);
create index if not exists habit_logs_user_completed_idx on public.habit_logs(user_id, completed_at desc);
create index if not exists habit_logs_habit_idx on public.habit_logs(habit_id, completed_at desc);
create index if not exists hydration_logs_user_logged_idx on public.hydration_logs(user_id, logged_at desc);
create index if not exists workout_logs_user_logged_idx on public.workout_logs(user_id, logged_at desc);
create index if not exists sleep_logs_user_logged_idx on public.sleep_logs(user_id, logged_at desc);
create index if not exists journal_entries_user_created_idx on public.journal_entries(user_id, created_at desc);
create index if not exists team_activities_team_timestamp_idx on public.team_activities(team_id, "timestamp" desc);
create index if not exists team_invites_email_status_idx on public.team_invites(lower(invitee_email), status);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.hydration_logs enable row level security;
alter table public.workout_logs enable row level security;
alter table public.sleep_logs enable row level security;
alter table public.journal_entries enable row level security;
alter table public.teams enable row level security;
alter table public.team_activities enable row level security;
alter table public.team_invites enable row level security;

create policy habits_owner_select on public.habits for select to authenticated using (user_id = (select auth.uid()));
create policy habits_owner_insert on public.habits for insert to authenticated with check (user_id = (select auth.uid()));
create policy habits_owner_update on public.habits for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy habits_owner_delete on public.habits for delete to authenticated using (user_id = (select auth.uid()));
create policy habit_logs_owner_all on public.habit_logs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy hydration_logs_owner_all on public.hydration_logs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy workout_logs_owner_all on public.workout_logs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sleep_logs_owner_all on public.sleep_logs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy journal_entries_owner_select on public.journal_entries for select to authenticated using (user_id = (select auth.uid()));
create policy journal_entries_owner_insert on public.journal_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy journal_entries_owner_update on public.journal_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy teams_member_select on public.teams for select to authenticated using (member_a = (select auth.uid()) or member_b = (select auth.uid()));
create policy team_activities_member_select on public.team_activities for select to authenticated using (exists (select 1 from public.teams t where t.id = team_id and (t.member_a = (select auth.uid()) or t.member_b = (select auth.uid()))));
create policy team_activities_member_insert on public.team_activities for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.teams t where t.id = team_id and (t.member_a = (select auth.uid()) or t.member_b = (select auth.uid()))));
create policy team_invites_recipient_or_inviter_select on public.team_invites for select to authenticated using (inviter_id = (select auth.uid()) or lower(invitee_email) = lower((select email from auth.users where id = (select auth.uid()))));
create policy team_invites_recipient_update on public.team_invites for update to authenticated using (lower(invitee_email) = lower((select email from auth.users where id = (select auth.uid())))) with check (lower(invitee_email) = lower((select email from auth.users where id = (select auth.uid()))));

create or replace function public.accept_team_invite(p_invite_id uuid)
returns public.teams
language plpgsql security invoker set search_path = ''
as $$
declare v_invite public.team_invites; v_team public.teams;
begin
  select * into v_invite from public.team_invites where id = p_invite_id and status = 'pending' and lower(invitee_email) = lower((select email from auth.users where id = (select auth.uid()))) for update;
  if v_invite.id is null then raise exception 'Invite not found or not addressed to the current user'; end if;
  update public.teams set member_b = (select auth.uid()) where id = v_invite.team_id and member_b = v_invite.inviter_id returning * into v_team;
  if v_team.id is null then raise exception 'Invite team is no longer available'; end if;
  update public.team_invites set status = 'accepted' where id = p_invite_id;
  return v_team;
end;
$$;
revoke all on function public.accept_team_invite(uuid) from public, anon;
grant execute on function public.accept_team_invite(uuid) to authenticated;
