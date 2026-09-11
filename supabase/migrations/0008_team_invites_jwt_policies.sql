-- ============================================================
-- Phase 3 / T1 (fixup) — team_invites policies must not read auth.users
-- ------------------------------------------------------------
-- T2's live RLS run exposed a runtime gap the file audit could not:
-- policy subqueries that SELECT from auth.users fail for the
-- authenticated role (hosted Supabase grants no such privilege),
-- so 0002's recipient policies and 0006's insert policy could
-- never match any row — every recipient-side read/write died with
-- 42501 "permission denied for table users".
--
-- Granting SELECT ON auth.users TO authenticated would be a
-- cross-user data leak and is deliberately NOT done. The policies
-- instead compare invitee_email against the email CLAIM of the
-- request JWT (auth.jwt() ->> 'email') — the same credential the
-- invite flow presents. accept_team_invite() keeps reading the
-- canonical auth.users email, which is valid there because the
-- RPC is security definer (runs as the migration owner).
-- ============================================================

drop policy if exists team_invites_recipient_or_inviter_select on public.team_invites;
create policy team_invites_recipient_or_inviter_select on public.team_invites
  for select to authenticated
  using (
    inviter_id = (select auth.uid())
    or lower(invitee_email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists team_invites_recipient_update on public.team_invites;
create policy team_invites_recipient_update on public.team_invites
  for update to authenticated
  using (lower(invitee_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(invitee_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists team_invites_inviter_insert on public.team_invites;
create policy team_invites_inviter_insert on public.team_invites
  for insert to authenticated
  with check (
    inviter_id = (select auth.uid())
    and lower(invitee_email) <> lower(auth.jwt() ->> 'email')
  );
