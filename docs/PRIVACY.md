# Dayflow AI — Privacy Suite (Phase 8 / S5)

**Status:** export = shipped (verified in Phase 6 QA). Delete-account = RPC
proposal below, awaiting the schema owner (Claude + Supabase MCP) to land it
as a migration. Nothing in this doc grants the client any privileged path —
**the web client never uses the service_role key, and never will.**

---

## 1. Where your data lives

| Store | Contents | Scope |
|---|---|---|
| Supabase Postgres (`Mohamedkhaled420` project) | profiles, habits, habit_logs, hydration_logs, workout_logs, sleep_logs, journal_entries, teams, team_invites, team_activities | per-user rows, **owner-only RLS** on every table (migration `0002`); journal additionally never enters team_activities (privacy wall, PRD §2) |
| Browser IndexedDB (`dayflow-sync-v1`) | the local mirror of the rows above (zustand persist + idb-keyval) | this browser only; wiped by Sign out or Reset local cache |
| localStorage | morning-triad day-record, theme preference | this browser only |
| Groq API | transient request bodies (journal context / prompts) — no accounts, no storage we control | never persisted by Dayflow |

## 2. Export coverage (shipped)

Settings → Data → **Download JSON** produces a full backup of every row the
Delta Sync store holds — profile, habits, habit_logs, hydration_logs,
workout_logs, sleep_logs, journal_entries — i.e. the exact rows that live in
Supabase under your account. **Copy today (.md)** additionally produces a
Markdown recap of the current day. Both are client-side only: the export is
assembled in your browser and never uploaded anywhere.

Phase 8 note: journal entries written after the rich-text composer ship as
sanitized HTML in `content`; pre-Phase-8 entries are plain text. Both export
verbatim.

## 3. Delete account — owner-side RPC proposal

**Why not client-side:** owner-row RLS cannot delete the `auth.users` row
itself, and cascade deletes across six tables need a transaction no anon-key
client should drive. The correct shape is a SECURITY DEFINER function the
user calls with their own JWT, executed in ONE transaction.

**Proposed migration (draft — land via the Claude/Supabase-MCP ownership
path, do NOT apply by hand):**

```sql
-- 000X_delete_account.sql (draft, owner review required)
create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- caller is the JWT subject; SECURITY DEFINER does the rest
  delete from habit_logs      where user_id = auth.uid();
  delete from hydration_logs  where user_id = auth.uid();
  delete from workout_logs    where user_id = auth.uid();
  delete from sleep_logs      where user_id = auth.uid();
  delete from journal_entries where user_id = auth.uid();
  delete from habits          where user_id = auth.uid();
  -- teams: remove either membership side (rows cascade their invites/
  -- activities via existing FKs, 0003)
  delete from teams where member_a = auth.uid() or member_b = auth.uid();
  delete from profiles where id = auth.uid();
  -- auth user removal requires the service API: return a signal the
  -- route layer converts into the admin call (or handle via a
  -- Postgres -> Auth trigger if/when Supabase supports it natively).
end;
$$;

revoke all on function public.delete_user_account() from anon, authenticated;
grant execute on function public.delete_user_account() to authenticated;
```

**Open items for the owner review:**

1. Whether `auth.users` deletion happens inside the RPC via
   `auth.admin.delete_user()` (not reachable from Postgres today), via a
   JWT-gated `/api/account/delete` route using the service key
   server-side-only, or via a Supabase Auth hook. Recommendation: the route
   (keeps every service-key use on the server, matches the Shortcuts
   webhook pattern).
2. Soft-delete grace window (14 days) vs immediate: recommendation —
   immediate for the logs (local-first users already treat the PWA as
   ephemeral), since we keep no backups on the free tier anyway.
3. Client UX (already stubbed in Settings → Data → Account): a two-tap
   confirm that calls the RPC, clears IndexedDB + localStorage, signs out,
   and lands on `/auth`.

Until the migration lands, the in-app guidance is accurate: sign out + reset
local cache, or request deletion from the repo owner.

## 4. Verifiable claims on the landing page

- "Local-first sync" — writes land in IndexedDB immediately, sync to
  Supabase opportunistically, pending rows retry as idempotent upserts.
- "Export any time" — this doc, §2.
- "Delete any time" — tracked by this proposal; the landing copy stays
  honest because the feature ships with the RPC above.
- "never shared with your team" — journal content is structurally excluded
  from the team broadcast path (`broadcastTeamActivity` carries STATUS
  ONLY payloads; enforced at the call site and audited in Phase 3).
