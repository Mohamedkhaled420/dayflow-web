-- ============================================================
-- Phase 3 / T1 — Team Mode RPCs
-- ------------------------------------------------------------
-- Invite flow (replaces the Phase 1 stub, which was SECURITY
-- INVOKER and could never succeed: teams had no UPDATE policy,
-- so its internal UPDATE matched zero rows and every call raised
-- 'Invite team is no longer available'):
--
--   1. Inviter (client): INSERT INTO team_invites
--      (inviter_id = me, invitee_email, team_id NULL) — enabled
--      by 0006's inviter-scoped INSERT policy.
--   2. Invitee (client): SELECT pending invites addressed to my
--      email (existing recipient policy from 0002) and call
--      accept_team_invite.
--   3. accept_team_invite() LINKS THE TEAM: it creates the teams
--      row (inviter, invitee), stamps team_id onto the invite and
--      flips status to 'accepted'. It is SECURITY DEFINER because
--      teams deliberately has no INSERT policy — this RPC is the
--      only door, and it carries its own validation (pending
--      status + invitee email = auth JWT email).
--
-- update_presence() upserts ONE presence row per user (partial
-- unique index below) with payload {"last_seen": now()}. The
-- resulting UPDATE event is what pulses the teammate's card via
-- realtime (0005). SECURITY DEFINER for the same reason: the
-- upsert's UPDATE arm must succeed under RLS.
-- ============================================================

-- The invite now exists BEFORE the team does: team_id is nullable
-- until acceptance links it. (Existing rows: none — tables empty.)
alter table public.team_invites alter column team_id drop not null;

-- Upsert arbiter for update_presence(): one presence row per user.
create unique index if not exists team_activities_presence_one_per_user
  on public.team_activities (user_id)
  where activity_type = 'presence';

create or replace function public.accept_team_invite(p_invite_id uuid)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.team_invites;
  v_team public.teams;
begin
  -- Lock the invite row against concurrent accepts; it must be
  -- pending and addressed to the caller (invitee email must equal
  -- the auth JWT email, compared case-insensitively).
  select * into v_invite
  from public.team_invites
  where id = p_invite_id
    and status = 'pending'
    and lower(invitee_email) = lower((select email from auth.users where id = (select auth.uid())))
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found, already used, or not addressed to the current user';
  end if;

  -- Link the team: create it with both members. If this pair
  -- already shares a team (either orientation), reuse it instead.
  begin
    insert into public.teams (member_a, member_b)
    values (v_invite.inviter_id, (select auth.uid()))
    returning * into v_team;
  exception
    when unique_violation then
      select * into v_team
      from public.teams
      where (member_a = v_invite.inviter_id and member_b = (select auth.uid()))
         or (member_a = (select auth.uid()) and member_b = v_invite.inviter_id);
  end;

  if v_team.id is null then
    raise exception 'Invite team is no longer available';
  end if;

  update public.team_invites
  set team_id = v_team.id, status = 'accepted'
  where id = p_invite_id;

  return v_team;
end;
$$;

revoke all on function public.accept_team_invite(uuid) from public, anon;
grant execute on function public.accept_team_invite(uuid) to authenticated;

create or replace function public.update_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  -- The caller's most recent team (Team Mode is a 2-person pair,
  -- but the schema tolerates more than one pairing per user).
  select t.id into v_team_id
  from public.teams t
  where t.member_a = (select auth.uid()) or t.member_b = (select auth.uid())
  order by t.created_at desc
  limit 1;

  if v_team_id is null then
    raise exception 'No team found for the current user';
  end if;

  insert into public.team_activities (team_id, user_id, activity_type, payload)
  values (v_team_id, (select auth.uid()), 'presence', jsonb_build_object('last_seen', now()))
  on conflict (user_id) where activity_type = 'presence'
  do update set
    team_id = excluded.team_id,
    payload = excluded.payload,
    "timestamp" = now();
end;
$$;

revoke all on function public.update_presence() from public, anon;
grant execute on function public.update_presence() to authenticated;
