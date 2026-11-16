-- Module: timing. Issue #1122.
-- A coach reads a measurement only when the coach is active in the measurement's school AND has the swimmer
-- assigned in that same school, directly or through a group of that school. Before, measurements_select checked the
-- swimmer (app.visible_athlete_ids()) and the school (app.staff_school_ids()) separately, so a coach active in A and
-- B with a swimmer assigned only in B also read that swimmer's A marks and, since 20261116020000, their conflicts.
--
-- The staff branch is split by source. The managed part is kept as it was (a staff member who is also a guardian
-- keeps reading their child as before; out of scope). The admin part binds the school to app.admin_school_ids():
-- identical for a pure school admin, whose staff schools are their admin schools; a user who is admin of A and coach
-- of B no longer reads the B marks of A's swimmers without an assignment in B. The coach part uses
-- app.coach_has_athlete_in_school(athlete, school) from 20261115090000: active membership in that school plus a
-- direct assignment in that school or a group of that school. The other branches are unchanged.
--
-- measurement_conflicts_select is not changed: its subqueries run under the reader's own measurements_select, so
-- conflicts follow. Other tables that use visible_athlete_ids()/coach_athlete_ids() with the same pattern (athletes,
-- athlete_managers, authorization_status, training_plan_fulfillments) are noted, not changed here.
-- The timing_measurements stream in powersync/sync-config.yaml is kept in step.
-- Revert: recreate the policy from 20261115100000_timing_guardian_school_times_sharing.sql and restore the two coach
-- queries and the admin query of timing_measurements in powersync/sync-config.yaml.
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
        or app.coach_has_athlete_in_school(athlete_id, school_id)
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
