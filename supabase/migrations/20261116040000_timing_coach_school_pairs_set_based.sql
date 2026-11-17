-- Module: timing. Issue #1127 (slice 1).
-- measurements_select of 20261116030000 (#1122) bound the coach branch to the assignment school with
-- app.coach_has_athlete_in_school(athlete_id, school_id), a STABLE SECURITY DEFINER function the planner cannot
-- inline, so it ran once per row: a coach's read of 6,000 measurements went from about 2 ms to about 170 ms, and
-- measurement_conflicts_select, whose subqueries run under measurements_select, paid the same.
--
-- app.coach_athlete_school_pairs() returns the same rule as a set: the (athlete, school) pairs the signed-in coach
-- has assigned, directly in a school or through a group of that school, only in schools where the coach is active
-- (app.staff_school_ids(), which drops deactivated memberships since 20261115090000). Used as
-- (athlete_id, school_id) in (select ... from app.coach_athlete_school_pairs() p) it is a hashed subplan computed
-- once per query (about 1.7 ms for the same read). Who reads what does not change: a pair is in the set exactly
-- when app.coach_has_athlete_in_school(athlete, school) is true. Only the coach branch of measurements_select
-- changes. measurement_conflicts_select is not touched: its subqueries read measurements under
-- measurements_select, so it uses the helper too (about 2.3 ms instead of about 175 ms).
-- app.coach_has_athlete_in_school stays for the write paths (measurements_update, the move guard in
-- measurements_check_update, plan assignment), which check one row at a time.
-- Revert: restore measurements_select from 20261116030000_timing_coach_reads_assignment_school.sql, then drop the
-- function.
create function app.coach_athlete_school_pairs()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select ca.athlete_id, ca.school_id
  from public.coach_athlete_assignments ca
  where ca.coach_user_id = (select auth.uid())
    and ca.school_id in (select app.staff_school_ids())
  union
  select ag.athlete_id, tg.school_id
  from public.athlete_groups ag
  join public.coach_group_assignments cg on cg.group_id = ag.group_id
  join public.training_groups tg on tg.id = ag.group_id
  where cg.coach_user_id = (select auth.uid())
    and tg.school_id in (select app.staff_school_ids());
$$;
revoke execute on function app.coach_athlete_school_pairs() from public, anon;
grant execute on function app.coach_athlete_school_pairs() to authenticated;

alter policy measurements_select on public.measurements
  using (
    (select app.is_platform_admin())
    or (
      athlete_id in (select app.managed_athlete_ids())
      and (guardian_visible or hidden)
    )
    or athlete_id in (
      select am.athlete_id from public.athlete_managers am
      where am.user_id = (select auth.uid()) and am.relation = 'self'
    )
    or (
      not hidden
      and (
        (athlete_id in (select app.managed_athlete_ids()) and school_id in (select app.staff_school_ids()))
        or (athlete_id in (select app.admin_athlete_ids()) and school_id in (select app.admin_school_ids()))
        or (athlete_id, school_id) in (select p.athlete_id, p.school_id from app.coach_athlete_school_pairs() p)
      )
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
