-- Module athletes: whether an athlete belongs to a school (issue #70), so other
-- modules can check a target without reading athlete_schools. Not executable by
-- clients: the triggers that call it run as their owner, and a client could
-- otherwise probe the schools of any athlete.
create function app.athlete_in_school(athlete uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athlete_schools
    where athlete_id = athlete_in_school.athlete and school_id = athlete_in_school.school
  );
$$;

revoke execute on function app.athlete_in_school(uuid, uuid) from public, anon, authenticated;
