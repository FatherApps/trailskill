-- Module school-console: tighter school admin writes (issue #117). Only
-- platform admins delete schools. A school admin assigns as coach only a user
-- with a coach membership in the same school; an assignment can still be
-- removed after the coach loses that membership, so writes split by command.

alter policy schools_delete on public.schools
  using ((select app.is_platform_admin()));

drop policy coach_group_assignments_write on public.coach_group_assignments;

create policy coach_group_assignments_insert on public.coach_group_assignments for insert to authenticated
  with check (
    (select app.is_platform_admin())
    or exists (
      select 1 from public.training_groups g
      join public.school_memberships m on m.school_id = g.school_id
      where g.id = coach_group_assignments.group_id
        and g.school_id in (select app.admin_school_ids())
        and m.user_id = coach_group_assignments.coach_user_id
        and m.role = 'coach'
    )
  );
create policy coach_group_assignments_update on public.coach_group_assignments for update to authenticated
  using (
    (select app.is_platform_admin())
    or group_id in (select id from public.training_groups where school_id in (select app.admin_school_ids()))
  )
  with check (
    (select app.is_platform_admin())
    or exists (
      select 1 from public.training_groups g
      join public.school_memberships m on m.school_id = g.school_id
      where g.id = coach_group_assignments.group_id
        and g.school_id in (select app.admin_school_ids())
        and m.user_id = coach_group_assignments.coach_user_id
        and m.role = 'coach'
    )
  );
create policy coach_group_assignments_delete on public.coach_group_assignments for delete to authenticated
  using (
    (select app.is_platform_admin())
    or group_id in (select id from public.training_groups where school_id in (select app.admin_school_ids()))
  );

drop policy coach_athlete_assignments_write on public.coach_athlete_assignments;

create policy coach_athlete_assignments_insert on public.coach_athlete_assignments for insert to authenticated
  with check (
    (select app.is_platform_admin())
    or exists (
      select 1 from app.admin_athlete_schools() a
      join public.school_memberships m on m.school_id = a.school_id
      where a.athlete_id = coach_athlete_assignments.athlete_id
        and m.user_id = coach_athlete_assignments.coach_user_id
        and m.role = 'coach'
    )
  );
create policy coach_athlete_assignments_update on public.coach_athlete_assignments for update to authenticated
  using ((select app.is_platform_admin()) or athlete_id in (select app.admin_athlete_ids()))
  with check (
    (select app.is_platform_admin())
    or exists (
      select 1 from app.admin_athlete_schools() a
      join public.school_memberships m on m.school_id = a.school_id
      where a.athlete_id = coach_athlete_assignments.athlete_id
        and m.user_id = coach_athlete_assignments.coach_user_id
        and m.role = 'coach'
    )
  );
create policy coach_athlete_assignments_delete on public.coach_athlete_assignments for delete to authenticated
  using ((select app.is_platform_admin()) or athlete_id in (select app.admin_athlete_ids()));
