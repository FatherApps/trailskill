-- Module: school-console. Issues #1031 and #1016.
-- A coach with deactivated_at set in school S reads no row of S, online or in the sync; per school, so a coach
-- deactivated in A and active in B still reads B. The coach's own membership row stays readable, nothing is
-- deleted and created_by does not change. Revert: recreate the functions and policies below from their earlier
-- migrations without the deactivated_at filter, and drop the filter from the streams in powersync/sync-config.yaml.

-- Only coach memberships can have deactivated_at, so this is the old set minus deactivated coaches.
create or replace function app.staff_school_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select school_id from public.school_memberships
  where user_id = (select auth.uid()) and role in ('coach', 'school_admin')
    and deactivated_at is null;
$$;
revoke execute on function app.staff_school_ids() from public, anon;
grant execute on function app.staff_school_ids() to authenticated;

-- A direct assignment counts in its own school, a group assignment in the school of the group.
create or replace function app.coach_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ag.athlete_id
  from public.athlete_groups ag
  join public.coach_group_assignments cga on cga.group_id = ag.group_id
  join public.training_groups tg on tg.id = cga.group_id
  where cga.coach_user_id = (select auth.uid())
    and tg.school_id in (select app.staff_school_ids())
  union
  select athlete_id from public.coach_athlete_assignments
  where coach_user_id = (select auth.uid())
    and school_id in (select app.staff_school_ids());
$$;
revoke execute on function app.coach_athlete_ids() from public, anon;
grant execute on function app.coach_athlete_ids() to authenticated;

create or replace function app.coach_has_athlete_in_school(athlete uuid, school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coach_has_athlete_in_school.school in (select app.staff_school_ids())
    and (
      exists (
        select 1 from public.coach_athlete_assignments ca
        where ca.coach_user_id = (select auth.uid())
          and ca.athlete_id = coach_has_athlete_in_school.athlete
          and ca.school_id = coach_has_athlete_in_school.school
      )
      or exists (
        select 1 from public.athlete_groups ag
        join public.coach_group_assignments cg on cg.group_id = ag.group_id
        join public.training_groups tg on tg.id = ag.group_id
        where cg.coach_user_id = (select auth.uid())
          and ag.athlete_id = coach_has_athlete_in_school.athlete
          and tg.school_id = coach_has_athlete_in_school.school
      )
    );
$$;
revoke execute on function app.coach_has_athlete_in_school(uuid, uuid) from public, anon;
grant execute on function app.coach_has_athlete_in_school(uuid, uuid) to authenticated;

create or replace function app.can_assign_training_plan(school uuid, target text, athlete uuid, grp uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select app.is_platform_admin())
    or school in (select app.admin_school_ids())
    or (
      school in (
        select m.school_id from public.school_memberships m
        where m.user_id = (select auth.uid()) and m.role = 'coach'
          and m.deactivated_at is null
      )
      and (
        (target = 'athlete' and app.coach_has_athlete_in_school(athlete, school))
        or (target = 'group' and grp in (
          select g.group_id from public.coach_group_assignments g
          where g.coach_user_id = (select auth.uid())
        ))
      )
    );
$$;
revoke execute on function app.can_assign_training_plan(uuid, text, uuid, uuid) from public, anon;
grant execute on function app.can_assign_training_plan(uuid, text, uuid, uuid) to authenticated;

alter policy schools_select on public.schools
  using ((select app.is_platform_admin()) or id in (select app.staff_school_ids()));
alter policy categories_select on public.categories
  using ((select app.is_platform_admin()) or school_id in (select app.staff_school_ids()));
alter policy training_groups_select on public.training_groups
  using ((select app.is_platform_admin()) or school_id in (select app.staff_school_ids()));

alter policy training_plans_select on public.training_plans
  using ((select app.is_platform_admin()) or school_id in (select app.staff_school_ids()));
alter policy training_plans_insert on public.training_plans
  with check (
    created_by = (select auth.uid())
    and ((select app.is_platform_admin()) or school_id in (select app.staff_school_ids()))
  );
alter policy training_plans_update on public.training_plans
  using ((select app.is_platform_admin()) or school_id in (select app.staff_school_ids()))
  with check ((select app.is_platform_admin()) or school_id in (select app.staff_school_ids()));

alter policy training_plan_versions_select on public.training_plan_versions
  using (
    (select app.is_platform_admin())
    or plan_id in (select p.id from public.training_plans p where p.school_id in (select app.staff_school_ids()))
    or id in (select version_id from public.training_plan_assignments)
  );
alter policy training_plan_versions_insert on public.training_plan_versions
  with check (
    created_by = (select auth.uid())
    and (
      (select app.is_platform_admin())
      or plan_id in (select p.id from public.training_plans p where p.school_id in (select app.staff_school_ids()))
    )
  );
alter policy training_plan_versions_update on public.training_plan_versions
  using (
    (select app.is_platform_admin())
    or plan_id in (select p.id from public.training_plans p where p.school_id in (select app.staff_school_ids()))
  )
  with check (
    (select app.is_platform_admin())
    or plan_id in (select p.id from public.training_plans p where p.school_id in (select app.staff_school_ids()))
  );

alter policy training_plan_blocks_insert on public.training_plan_blocks
  with check (
    created_by = (select auth.uid())
    and (
      (select app.is_platform_admin())
      or version_id in (
        select v.id from public.training_plan_versions v
        join public.training_plans p on p.id = v.plan_id
        where p.school_id in (select app.staff_school_ids())
      )
    )
  );
alter policy training_plan_blocks_update on public.training_plan_blocks
  using (
    (select app.is_platform_admin())
    or version_id in (
      select v.id from public.training_plan_versions v
      join public.training_plans p on p.id = v.plan_id
      where p.school_id in (select app.staff_school_ids())
    )
  )
  with check (
    (select app.is_platform_admin())
    or version_id in (
      select v.id from public.training_plan_versions v
      join public.training_plans p on p.id = v.plan_id
      where p.school_id in (select app.staff_school_ids())
    )
  );
alter policy training_plan_blocks_delete on public.training_plan_blocks
  using (
    (select app.is_platform_admin())
    or version_id in (
      select v.id from public.training_plan_versions v
      join public.training_plans p on p.id = v.plan_id
      where p.school_id in (select app.staff_school_ids())
    )
  );

-- Only the staff part changes; what a guardian reads stays as it was.
alter policy training_plan_assignments_select on public.training_plan_assignments
  using (
    (select app.is_platform_admin())
    or school_id in (select app.staff_school_ids())
    or (
      withdrawn_at is null
      and (
        athlete_id in (select app.managed_athlete_ids())
        or group_id in (select app.managed_group_ids())
        or category_id in (select app.managed_category_ids())
        or (target = 'school' and school_id in (select app.managed_school_ids()))
      )
    )
  );

-- The assignments of a coach, only in the schools where the coach is active.
alter policy coach_athlete_assignments_select on public.coach_athlete_assignments
  using (
    (coach_user_id = (select auth.uid()) and school_id in (select app.staff_school_ids()))
    or (select app.is_platform_admin())
    or school_id in (select app.admin_school_ids())
  );
alter policy coach_group_assignments_select on public.coach_group_assignments
  using (
    (
      coach_user_id = (select auth.uid())
      and group_id in (select tg.id from public.training_groups tg where tg.school_id in (select app.staff_school_ids()))
    )
    or (select app.is_platform_admin())
    or group_id in (
      select tg.id from public.training_groups tg where tg.school_id in (select app.admin_school_ids())
    )
  );

-- An author reads their own series and marks only in a school where they are active.
alter policy timing_series_select on public.timing_series
  using (
    (select app.is_platform_admin())
    or (created_by = (select auth.uid()) and school_id in (select app.staff_school_ids()))
  );
alter policy measurements_select on public.measurements
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (
      athlete_id in (select app.visible_athlete_ids())
      and not hidden
      and school_id in (select app.staff_school_ids())
    )
    or (
      created_by = (select auth.uid())
      and hidden
      and app.hidden_measurement_written_back(id)
      and school_id in (select app.staff_school_ids())
    )
    or (
      athlete_id is null
      and series_id in (select ts.id from public.timing_series ts where ts.created_by = (select auth.uid()))
      and school_id in (select app.staff_school_ids())
    )
  );

-- An athlete can belong to several schools: only the coach branch (visible_athlete_ids() minus managed and admin)
-- is bound to the schools where the coach is active.
alter policy athlete_schools_select on public.athlete_schools
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or athlete_id in (select app.admin_athlete_ids())
    or (athlete_id in (select app.coach_athlete_ids()) and school_id in (select app.staff_school_ids()))
  );
alter policy athlete_groups_select on public.athlete_groups
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or athlete_id in (select app.admin_athlete_ids())
    or (
      athlete_id in (select app.coach_athlete_ids())
      and group_id in (select tg.id from public.training_groups tg where tg.school_id in (select app.staff_school_ids()))
    )
  );
alter policy training_plan_fulfillments_select on public.training_plan_fulfillments
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (
      athlete_id in (select app.admin_athlete_ids())
      and not hidden
    )
    or (
      athlete_id in (select app.coach_athlete_ids())
      and not hidden
      and assignment_id in (
        select a.id from public.training_plan_assignments a where a.school_id in (select app.staff_school_ids())
      )
    )
    or (
      created_by = (select auth.uid())
      and hidden
      and app.hidden_fulfillment_written_back(id)
      and assignment_id in (
        select a.id from public.training_plan_assignments a where a.school_id in (select app.staff_school_ids())
      )
    )
  );

-- Left unchanged on purpose:
-- measurements_insert_active_coach (restrictive, #963, 42501); measurements_insert/update,
--   training_plan_fulfillments_insert, timing_series_insert, public.other_school_results (already go through the fixed functions).
-- coach_group_assignments_insert/update: admin writes. school_memberships_select: the own row stays readable.
-- app.admin_school_ids, app.school_admin_adult_ids: admins are never deactivated. measurement_conflicts_select: follows measurements.
-- athletes, athlete_managers, authorization_status: athlete-level, no school; still on visible_athlete_ids(), so a
--   deactivated coach reads them only for athletes they coach in a school where they are active.
