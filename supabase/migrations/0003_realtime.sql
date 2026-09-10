alter table public.team_activities replica identity full;
alter publication supabase_realtime add table public.team_activities;

-- Realtime is intentionally limited to Team Mode activity events.
