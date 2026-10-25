-- Module school-console: row level security policies (issue #31). Members read
-- their school; writes need an admin of the row's school or a platform admin.
-- "for all" write policies also let the writer select, and every writer here
-- already sees those rows through the select policies.

create policy schools_select on public.schools for select to authenticated
  using (
    (select app.is_platform_admin())
    or id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
  );
create policy schools_insert on public.schools for insert to authenticated
  with check ((select app.is_platform_admin()));
create policy schools_update on public.schools for update to authenticated
  using ((select app.is_platform_admin()) or id in (select app.admin_school_ids()))
  with check ((select app.is_platform_admin()) or id in (select app.admin_school_ids()));
create policy schools_delete on public.schools for delete to authenticated
  using ((select app.is_platform_admin()) or id in (select app.admin_school_ids()));

create policy categories_select on public.categories for select to authenticated
  using (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
  );
create policy categories_write on public.categories for all to authenticated
  using ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()))
  with check ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()));

create policy training_groups_select on public.training_groups for select to authenticated
  using (
    (select app.is_platform_admin())
    or school_id in (select school_id from public.school_memberships where user_id = (select auth.uid()))
  );
create policy training_groups_write on public.training_groups for all to authenticated
  using ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()))
  with check ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()));

create policy school_memberships_select on public.school_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.is_platform_admin())
    or school_id in (select app.admin_school_ids())
  );
create policy school_memberships_write on public.school_memberships for all to authenticated
  using ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()))
  with check ((select app.is_platform_admin()) or school_id in (select app.admin_school_ids()));

create policy coach_group_assignments_select on public.coach_group_assignments for select to authenticated
  using (
    coach_user_id = (select auth.uid())
    or (select app.is_platform_admin())
    or group_id in (select id from public.training_groups where school_id in (select app.admin_school_ids()))
  );
create policy coach_group_assignments_write on public.coach_group_assignments for all to authenticated
  using (
    (select app.is_platform_admin())
    or group_id in (select id from public.training_groups where school_id in (select app.admin_school_ids()))
  )
  with check (
    (select app.is_platform_admin())
    or group_id in (select id from public.training_groups where school_id in (select app.admin_school_ids()))
  );

create policy coach_athlete_assignments_select on public.coach_athlete_assignments for select to authenticated
  using (
    coach_user_id = (select auth.uid())
    or (select app.is_platform_admin())
    or athlete_id in (select app.admin_athlete_ids())
  );
create policy coach_athlete_assignments_write on public.coach_athlete_assignments for all to authenticated
  using ((select app.is_platform_admin()) or athlete_id in (select app.admin_athlete_ids()))
  with check ((select app.is_platform_admin()) or athlete_id in (select app.admin_athlete_ids()));
