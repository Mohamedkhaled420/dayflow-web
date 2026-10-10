-- ============================================================
-- 0012 — Account deletion (GDPR erasure, audit P0-1)
-- ------------------------------------------------------------
-- public.delete_user_account() removes EVERY row the caller
-- owns across every domain table, then the auth.users row
-- itself (cascading any residual FK rows with it).
--
-- Design notes:
--   * Zero-argument, self-service: the caller IS auth.uid().
--     No id can be forged, stolen, or passed for someone else.
--   * SECURITY DEFINER, pinned search_path — the caller cannot
--     shadow functions. Ownership: postgres (migrations run as
--     the migration role).
--   * EXECUTE granted to authenticated only (anon gets nothing).
--   * Team Mode: the user's side of a 1:1 team is dissolved —
--     activities and invites referencing them are removed. The
--     teammate keeps their own logs (their data, their right).
--   * Verbose `delete` statements (not DO $$ loops) so the plan
--     is explicit and greppable when tables are added later.
-- ============================================================

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Only a signed-in caller can erase their own account.
  if v_uid is null then
    raise insufficient_privilege using message = 'Sign in required.';
  end if;

  -- Domain logs (owner-scoped)
  delete from public.habit_logs      where user_id = v_uid;
  delete from public.habits          where user_id = v_uid;
  delete from public.hydration_logs  where user_id = v_uid;
  delete from public.workout_logs    where user_id = v_uid;
  delete from public.meal_logs       where user_id = v_uid;
  delete from public.sleep_logs      where user_id = v_uid;
  delete from public.journal_entries where user_id = v_uid;
  delete from public.activity_logs   where user_id = v_uid;

  -- Team Mode: rows on the user's side of every pairing
  delete from public.team_activities where team_id in (
    select id from public.teams
    where member_a = v_uid or member_b = v_uid
  );
  delete from public.teams
    where member_a = v_uid or member_b = v_uid;
  delete from public.team_invites
    where inviter_id = v_uid
       or lower(invitee_email) = lower(coalesce(
           (select email from auth.users where id = v_uid), ''));

  -- Operational rows (0013/0014 tables — present by the time
  -- this migration family has been applied together).
  delete from public.rate_limit_hits where user_id = v_uid;
  delete from public.error_events    where user_id = v_uid;
  delete from public.subscriptions   where user_id = v_uid;

  -- The profile itself
  delete from public.profiles where id = v_uid;

  -- Finally the identity: auth.users removal invalidates all
  -- sessions/tokens server-side. Residual FK rows cascade.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_user_account() from public, anon;
grant execute on function public.delete_user_account() to authenticated;

comment on function public.delete_user_account() is
  'GDPR erasure: deletes every row the caller owns plus their auth identity. Self-service only (the caller is auth.uid()).';
