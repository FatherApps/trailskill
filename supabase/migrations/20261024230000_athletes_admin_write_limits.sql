-- Module athletes: school admins no longer edit or delete athlete profiles
-- (issue #117). An athlete can belong to several schools and no school owns
-- the profile, so only platform admins write it for now; guardian edits
-- arrive with security definer functions (issues #42 and #44). School admins
-- still manage membership through athlete_schools and athlete_groups.

alter policy athletes_update on public.athletes
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

alter policy athletes_delete on public.athletes
  using ((select app.is_platform_admin()));

-- Athletes of the schools the user administers, with the school, so
-- school-console policies can check a school without reading athlete_schools.
create function app.admin_athlete_schools()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id, school_id from public.athlete_schools
  where school_id in (select app.admin_school_ids());
$$;

revoke execute on function app.admin_athlete_schools() from public;
grant execute on function app.admin_athlete_schools() to authenticated;
