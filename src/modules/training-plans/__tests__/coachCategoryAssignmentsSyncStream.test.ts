import { readFileSync } from "node:fs";
import { join } from "node:path";

// A coach gets the assignments of a category only for the categories of the (swimmer, school) pairs where the swimmer is
// assigned to them in that same school, directly or through a group of that school (#1149, as #1127 and #1132 did for
// fulfillments and enrollments): the joins bind swimmer and school in one row. The pgTAP test
// supabase/tests/database/training-plans/coach_category_assignment_school.test.sql (pg_temp.stream_direct_category,
// pg_temp.stream_group_category) holds a copy of the two coach category queries: change both together.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const queriesOf = (stream: string) =>
  [
    ...(
      config.split(new RegExp(`\\n {2}${stream}:\\n`))[1]?.split(/\n\s*\n/)[0] ??
      ""
    ).matchAll(/^\s+- (SELECT .+)$/gm),
  ].map((match) => match[1]);
const staff = queriesOf("training_plans_assignments_staff");

test("the coach category queries bind the swimmer and the school of the enrollment to the assignment", () => {
  expect(staff.filter((query) => query.includes("category_id"))).toEqual([
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN athlete_schools ON training_plan_assignments.category_id = athlete_schools.category_id AND training_plan_assignments.school_id = athlete_schools.school_id JOIN coach_athlete_assignments ON athlete_schools.athlete_id = coach_athlete_assignments.athlete_id AND athlete_schools.school_id = coach_athlete_assignments.school_id WHERE coach_athlete_assignments.coach_user_id = auth.user_id() AND training_plan_assignments.school_id IN member_school_ids AND training_plan_assignments.withdrawn_at IS NULL",
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN athlete_schools ON training_plan_assignments.category_id = athlete_schools.category_id AND training_plan_assignments.school_id = athlete_schools.school_id JOIN athlete_groups ON athlete_schools.athlete_id = athlete_groups.athlete_id JOIN training_groups ON athlete_groups.group_id = training_groups.id AND athlete_schools.school_id = training_groups.school_id WHERE athlete_groups.group_id IN coach_group_ids AND training_plan_assignments.school_id IN member_school_ids AND training_plan_assignments.withdrawn_at IS NULL",
  ]);
});

test("the school-free coach category ids no longer exist", () => {
  expect(config).not.toMatch(/coach_(direct|group)_category_ids/);
});

test("the other staff queries do not change", () => {
  expect(staff.filter((query) => !query.includes("category_id"))).toEqual([
    "SELECT * FROM training_plan_assignments WHERE school_id IN admin_school_ids AND target <> 'athlete' AND withdrawn_at IS NULL",
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN school_memberships ON training_plan_assignments.school_id = school_memberships.school_id JOIN athlete_schools ON training_plan_assignments.athlete_id = athlete_schools.athlete_id AND school_memberships.school_id = athlete_schools.school_id WHERE school_memberships.user_id = auth.user_id() AND school_memberships.role = 'school_admin' AND athlete_schools.ended_at IS NULL AND training_plan_assignments.withdrawn_at IS NULL",
    "SELECT * FROM training_plan_assignments WHERE group_id IN coach_group_ids AND school_id IN member_school_ids AND withdrawn_at IS NULL",
    "SELECT * FROM training_plan_assignments WHERE group_id IN coach_direct_group_ids AND school_id IN member_school_ids AND withdrawn_at IS NULL",
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN athlete_schools ON training_plan_assignments.athlete_id = athlete_schools.athlete_id AND training_plan_assignments.school_id = athlete_schools.school_id JOIN coach_athlete_assignments ON athlete_schools.athlete_id = coach_athlete_assignments.athlete_id AND athlete_schools.school_id = coach_athlete_assignments.school_id WHERE coach_athlete_assignments.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND training_plan_assignments.school_id IN member_school_ids AND training_plan_assignments.withdrawn_at IS NULL",
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN training_groups ON training_plan_assignments.school_id = training_groups.school_id JOIN athlete_groups ON training_plan_assignments.athlete_id = athlete_groups.athlete_id AND training_groups.id = athlete_groups.group_id JOIN athlete_schools ON athlete_groups.athlete_id = athlete_schools.athlete_id AND training_groups.school_id = athlete_schools.school_id WHERE training_groups.id IN coach_group_ids AND athlete_schools.ended_at IS NULL AND training_plan_assignments.withdrawn_at IS NULL",
    "SELECT * FROM training_plan_assignments WHERE target = 'school' AND school_id IN member_school_ids AND withdrawn_at IS NULL",
  ]);
});

test("the guardian and adult athlete queries and managed_category_ids do not change", () => {
  expect(queriesOf("training_plans_assignments_managed").slice(0, 4)).toEqual([
    "SELECT * FROM training_plan_assignments WHERE athlete_id IN managed_athlete_ids AND withdrawn_at IS NULL",
    "SELECT * FROM training_plan_assignments WHERE group_id IN managed_group_ids AND withdrawn_at IS NULL",
    "SELECT * FROM training_plan_assignments WHERE category_id IN managed_category_ids AND withdrawn_at IS NULL",
    "SELECT * FROM training_plan_assignments WHERE target = 'school' AND school_id IN managed_school_ids AND withdrawn_at IS NULL",
  ]);
  expect(config.match(/^ {2}managed_category_ids: (.+)$/m)?.[1]).toBe(
    "SELECT category_id FROM athlete_schools WHERE category_id IS NOT NULL AND athlete_id IN (SELECT athlete_id FROM athlete_managers WHERE user_id = auth.user_id())",
  );
});
