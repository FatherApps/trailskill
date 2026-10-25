-- Module athletes: who can see which athletes, and row level security
-- policies for athletes, athlete_schools and athlete_groups (issue #31).
-- Writes need a school admin of the athlete's school or a platform admin.

-- Athletes of the schools the user administers. It lives here so other
-- modules' policies do not read athlete_schools directly.
create function app.admin_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select athlete_id from public.athlete_schools
  where school_id in (select app.admin_school_ids());
$$;

create function app.visible_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select app.coach_athlete_ids()
  union
  select app.managed_athlete_ids()
  union
  select app.admin_athlete_ids();
$$;

revoke execute on function app.admin_athlete_ids(), app.visible_athlete_ids() from public;
grant execute on function app.admin_athlete_ids(), app.visible_athlete_ids() to authenticated;

create policy athletes_select on public.athletes for select to authenticated
  using ((select app.is_platform_admin()) or id in (select app.visible_athlete_ids()));

-- Maintainer decision: inserting into athletes is allowed only for platform
-- admins. A new athlete has no school link yet, so a school admin or guardian
-- cannot be checked against one. Athlete creation by guardians and school
-- admins arrives later with a security definer function that creates the
-- athlete and its link in one transaction (issues #42 and #44).
create policy athletes_insert on public.athletes for insert to authenticated
  with check ((select app.is_platform_admin()));

create policy athletes_update on public.athletes for update to authenticated
  using ((select app.is_platform_admin()) or id in (select app.admin_athlete_ids()))
  with check ((select app.is_platform_admin()) or id in (select app.admin_athlete_ids()));

create policy athletes_delete on public.athletes for delete to authenticated
  using ((select app.is_platform_admin()) or id in (select app.admin_athlete_ids()));

create policy athlete_schools_select on public.athlete_schools for select to authenticated
  using ((select app.is_platform_admin()) or athlete_id in (select app.visible_athlete_ids()));

-- "for all" also lets the writer select; every writer here already sees these rows.
-- A school admin cannot pull another school's athlete into theirs; linking a new
-- athlete stays with platform admins (maintainer decision above).
create policy athlete_schools_write on public.athlete_schools for all to authenticated
  using (
    (select app.is_platform_admin())
    or (school_id in (select app.admin_school_ids()) and athlete_id in (select app.admin_athlete_ids()))
  )
  with check (
    (select app.is_platform_admin())
    or (school_id in (select app.admin_school_ids()) and athlete_id in (select app.admin_athlete_ids()))
  );

create policy athlete_groups_select on public.athlete_groups for select to authenticated
  using ((select app.is_platform_admin()) or athlete_id in (select app.visible_athlete_ids()));

create policy athlete_groups_write on public.athlete_groups for all to authenticated
  using (
    (select app.is_platform_admin())
    or (
      group_id in (select id from public.training_groups where school_id in (select app.admin_school_ids()))
      and athlete_id in (select app.admin_athlete_ids())
    )
  )
  with check (
    (select app.is_platform_admin())
    or (
      group_id in (select id from public.training_groups where school_id in (select app.admin_school_ids()))
      and athlete_id in (select app.admin_athlete_ids())
    )
  );
