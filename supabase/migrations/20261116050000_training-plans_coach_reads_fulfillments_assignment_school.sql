-- Module: training-plans. Issue #1127 (slice 2).
-- training_plan_fulfillments_select of 20261115090000 (school-console_deactivated_coach_loses_read_access) checked
-- the swimmer (app.coach_athlete_ids()) and the school of the fulfillment's assignment (app.staff_school_ids())
-- separately, so a coach active in A and B with a swimmer assigned only in B also read that swimmer's fulfillments
-- of assignments of A, online and in the sync (the same gap #1122 closed for measurements).
--
-- The coach branch now matches (athlete_id, assignment_id) against the pairs of app.coach_athlete_school_pairs()
-- (20261116040000: the (swimmer, school) pairs the signed-in coach has assigned, directly or through a group of that
-- school, only in schools where the coach is active) joined to the assignments of each pair's school. It is a hashed
-- subplan computed once per query: a coach read of 6,000 fulfillments takes about 1.3 ms, as before.
-- The other branches are unchanged: platform admin, managed swimmers (guardians and adult athletes, hidden rows
-- included), school admins (not hidden) and the author's write-back of a hidden row.
-- The training_plans_fulfillments stream in powersync/sync-config.yaml is kept in step.
-- athletes, athlete_managers and authorization_status are one row per swimmer with no school, so there is no school
-- to bind and they are not changed (the pgTAP test pins it). athlete_schools and athlete_groups keep the same split
-- pattern (swimmer and school checked separately); they are noted, not changed, out of the scope of #1127.
-- Revert: restore training_plan_fulfillments_select from 20261115090000_school-console_deactivated_coach_loses_read_access.sql
-- and the two coach queries of training_plans_fulfillments in powersync/sync-config.yaml.
alter policy training_plan_fulfillments_select on public.training_plan_fulfillments
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (
      athlete_id in (select app.admin_athlete_ids())
      and not hidden
    )
    or (
      not hidden
      and (athlete_id, assignment_id) in (
        select p.athlete_id, a.id
        from app.coach_athlete_school_pairs() p
        join public.training_plan_assignments a on a.school_id = p.school_id
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
