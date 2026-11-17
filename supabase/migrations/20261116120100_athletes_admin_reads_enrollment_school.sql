-- Module: athletes. Issue #1150.
-- The admin branch of athlete_schools_select and athlete_groups_select (20261116070000) checked the swimmer only,
-- through app.admin_athlete_ids(), so an admin of school C read every enrollment row and every group row of a swimmer
-- enrolled in A, B and C, online and in the sync (the gap #1145 closed for coaches and #1132 for fulfillments).
--
-- The admin branch now matches the (swimmer, school) pairs of app.admin_athlete_school_pairs() (20261116060000): a
-- hashed subplan computed once per query, with no per-row function call. For athlete_groups the pairs are joined to
-- the training_groups of each pair's school, so an admin reads a group row only in a school they administer.
-- The other branches are unchanged: platform admin, managed swimmers (guardians and adult athletes) and coaches.
-- The two admin queries of athletes_visible in powersync/sync-config.yaml are kept in step.
-- Revert: restore athlete_schools_select and athlete_groups_select from
-- 20261116070000_athletes_coach_reads_enrollment_school.sql and the admin queries of athletes_visible in
-- powersync/sync-config.yaml.
alter policy athlete_schools_select on public.athlete_schools
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (athlete_id, school_id) in (select p.athlete_id, p.school_id from app.admin_athlete_school_pairs() p)
    or (athlete_id, school_id) in (select p.athlete_id, p.school_id from app.coach_athlete_school_pairs() p)
  );
alter policy athlete_groups_select on public.athlete_groups
  using (
    (select app.is_platform_admin())
    or athlete_id in (select app.managed_athlete_ids())
    or (athlete_id, group_id) in (
      select p.athlete_id, tg.id
      from app.admin_athlete_school_pairs() p
      join public.training_groups tg on tg.school_id = p.school_id
    )
    or (athlete_id, group_id) in (
      select p.athlete_id, tg.id
      from app.coach_athlete_school_pairs() p
      join public.training_groups tg on tg.school_id = p.school_id
    )
  );
