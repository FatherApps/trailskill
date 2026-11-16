-- Module: training-plans. Issue #1132 (slice 1).
-- The admin branch of training_plan_fulfillments_select (20261116050000) read a fulfillment when the swimmer was in
-- app.admin_athlete_ids(), whatever the school of the fulfillment's assignment, so an admin of A read the fulfillments
-- of B assignments of a swimmer enrolled in A and B, online and in the sync (the gap #1127 closed for coaches).
--
-- app.admin_athlete_school_pairs() returns the (swimmer, school) enrollments of the schools the signed-in user
-- administers. The admin branch matches (athlete_id, assignment_id) against those pairs joined to the assignments of
-- each pair's school, as the coach branch does with app.coach_athlete_school_pairs(): a hashed subplan computed once
-- per query, with no per-row function call.
-- The other branches are unchanged: platform admin, managed swimmers (guardians and adult athletes, hidden rows
-- included), coaches and the author's write-back of a hidden row.
-- The admin query of training_plans_fulfillments in powersync/sync-config.yaml is kept in step.
-- Revert: restore training_plan_fulfillments_select from
-- 20261116050000_training-plans_coach_reads_fulfillments_assignment_school.sql and the admin query of
-- training_plans_fulfillments in powersync/sync-config.yaml, then drop the function.
create function app.admin_athlete_school_pairs()
returns table (athlete_id uuid, school_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.athlete_id, s.school_id
  from public.athlete_schools s
  where s.school_id in (select app.admin_school_ids());
$$;
revoke execute on function app.admin_athlete_school_pairs() from public, anon;
grant execute on function app.admin_athlete_school_pairs() to authenticated;

alter policy training_plan_fulfillments_select on public.training_plan_fulfillments
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (
      not hidden
      and (athlete_id, assignment_id) in (
        select p.athlete_id, a.id
        from app.admin_athlete_school_pairs() p
        join public.training_plan_assignments a on a.school_id = p.school_id
      )
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
