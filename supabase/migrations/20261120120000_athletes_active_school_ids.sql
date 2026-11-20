-- Module athletes: which schools a swimmer is still active in (issue #1244, the rule of #1243). The account deletion of the
-- accounts module reads it through this function instead of reading athlete_schools itself (ADR 0003). An ended link
-- (athlete_schools.ended_at) does not count. Only the server calls it: clients read the same fact from the local database.

create function app.athlete_active_school_ids(athlete uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.school_id from public.athlete_schools s where s.athlete_id = athlete and s.ended_at is null;
$$;

revoke execute on function app.athlete_active_school_ids(uuid) from public, anon, authenticated;
