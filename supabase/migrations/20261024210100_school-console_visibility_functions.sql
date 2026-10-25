-- Module school-console: visibility functions for row level security
-- (issue #31). Same attributes as the accounts ones: security definer, empty
-- search_path, executable only by authenticated.

create function app.admin_school_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select school_id from public.school_memberships
  where user_id = (select auth.uid()) and role = 'school_admin';
$$;

-- Athletes of the coach's groups plus the coach's direct assignments.
create function app.coach_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ag.athlete_id
  from public.athlete_groups ag
  join public.coach_group_assignments cga on cga.group_id = ag.group_id
  where cga.coach_user_id = (select auth.uid())
  union
  select athlete_id from public.coach_athlete_assignments
  where coach_user_id = (select auth.uid());
$$;

revoke execute on function app.admin_school_ids(), app.coach_athlete_ids() from public;
grant execute on function app.admin_school_ids(), app.coach_athlete_ids() to authenticated;
