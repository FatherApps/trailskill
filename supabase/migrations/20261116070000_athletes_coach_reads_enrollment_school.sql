-- Module: athletes. Issue #1132 (slice 2).
-- athlete_schools_select and athlete_groups_select (20261115090000) checked the swimmer through app.coach_athlete_ids()
-- and the school through app.staff_school_ids() separately, so a coach active in A and B with a swimmer assigned only
-- in B read that swimmer's A enrollment row and A group rows, online and in the sync (the gap #1127 closed for
-- fulfillments).
--
-- The coach branch now matches the (swimmer, school) pairs of app.coach_athlete_school_pairs() (20261116040000): a
-- hashed subplan computed once per query, with no per-row function call. For athlete_groups the pairs are joined to
-- the training_groups of each pair's school, so a coach reads a group row only in the school of the assignment.
-- The other branches are unchanged: platform admin, managed swimmers (guardians and adult athletes) and school admins.
-- The admin branch stays school-free: a maintainer decision, out of scope of #1132.
-- The four coach queries of athletes_visible in powersync/sync-config.yaml are kept in step.
-- Revert: restore athlete_schools_select and athlete_groups_select from
-- 20261115090000_school-console_deactivated_coach_loses_read_access.sql and the four coach queries of
-- athletes_visible in powersync/sync-config.yaml.
alter policy athlete_schools_select on public.athlete_schools
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or athlete_id in (select app.admin_athlete_ids())
    or (athlete_id, school_id) in (select p.athlete_id, p.school_id from app.coach_athlete_school_pairs() p)
  );
alter policy athlete_groups_select on public.athlete_groups
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or athlete_id in (select app.admin_athlete_ids())
    or (athlete_id, group_id) in (
      select p.athlete_id, tg.id
      from app.coach_athlete_school_pairs() p
      join public.training_groups tg on tg.school_id = p.school_id
    )
  );
