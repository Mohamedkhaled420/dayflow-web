-- ============================================================
-- Phase 3 / T1 — RLS audit outcome + tightening
-- ------------------------------------------------------------
-- Audit of the 0001–0004 policies (verified BEFORE writing this
-- file; nothing below is assumed):
--
--   journal_entries   OWNER-only SELECT/INSERT/UPDATE, no DELETE
--                     policy -> append-only privacy wall intact.
--                     No change needed.
--   team_activities   SELECT limited to the two team members;
--                     INSERT requires own rows + membership.
--                     No change needed.
--   teams             SELECT limited to members. UPDATE policy
--                     MISSING -> added below (members only).
--   team_invites      SELECT recipient-or-inviter; UPDATE by
--                     recipient. INSERT policy MISSING -> the
--                     Phase 3 invite flow creates rows client-side
--                     ("create team_invites row by email"), so an
--                     inviter-scoped INSERT policy is required.
--
-- teams INSERT stays deliberately ABSENT: a teams row is only ever
-- created inside accept_team_invite() (0007, security definer with
-- its own validation). No client may mint a two-member team row.
-- ============================================================

create policy teams_member_update on public.teams
  for update to authenticated
  using (member_a = (select auth.uid()) or member_b = (select auth.uid()))
  with check (member_a = (select auth.uid()) or member_b = (select auth.uid()));

create policy team_invites_inviter_insert on public.team_invites
  for insert to authenticated
  with check (
    inviter_id = (select auth.uid())
    and lower(invitee_email) <> lower((select email from auth.users where id = (select auth.uid())))
  );
