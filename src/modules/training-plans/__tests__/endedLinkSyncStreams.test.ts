import { readFileSync } from "node:fs";
import { join } from "node:path";

const config = readFileSync(join(__dirname, "../../../../powersync/sync-config.yaml"), "utf8");
const streamQueries = (name: string) =>
  (config.split(new RegExp(`\\n {2}${name}:\\n`))[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

// The assignments aimed at a swimmer and the ended link (#1243, #1260). An assignment with the swimmer as target belongs to
// the pair (swimmer, school of the assignment): after the baja the school's admins and coaches no longer get it, and a
// swimmer ended in school A and active in B gives an admin or a coach of both only the assignments of B (checked against a
// real PowerSync 1.21; see athletes/__tests__/endedLinkSyncStreams.test.ts for the three query shapes).
test("an admin gets the assignments aimed at a swimmer only while the swimmer is linked to that school", () => {
  const stream = streamQueries("training_plans_assignments_staff");

  expect(stream).toContain("SELECT * FROM training_plan_assignments WHERE school_id IN admin_school_ids AND target <> 'athlete' AND withdrawn_at IS NULL");
  expect(stream).toContain(
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN school_memberships ON training_plan_assignments.school_id = school_memberships.school_id JOIN athlete_schools ON training_plan_assignments.athlete_id = athlete_schools.athlete_id AND school_memberships.school_id = athlete_schools.school_id WHERE school_memberships.user_id = auth.user_id() AND school_memberships.role = 'school_admin' AND athlete_schools.ended_at IS NULL AND training_plan_assignments.withdrawn_at IS NULL",
  );
});

test("a coach gets the assignments aimed at a swimmer only for a pair of theirs, direct or by group", () => {
  const stream = streamQueries("training_plans_assignments_staff");

  expect(stream).toContain(
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN athlete_schools ON training_plan_assignments.athlete_id = athlete_schools.athlete_id AND training_plan_assignments.school_id = athlete_schools.school_id JOIN coach_athlete_assignments ON athlete_schools.athlete_id = coach_athlete_assignments.athlete_id AND athlete_schools.school_id = coach_athlete_assignments.school_id WHERE coach_athlete_assignments.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND training_plan_assignments.school_id IN member_school_ids AND training_plan_assignments.withdrawn_at IS NULL",
  );
  expect(stream).toContain(
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN training_groups ON training_plan_assignments.school_id = training_groups.school_id JOIN athlete_groups ON training_plan_assignments.athlete_id = athlete_groups.athlete_id AND training_groups.id = athlete_groups.group_id JOIN athlete_schools ON athlete_groups.athlete_id = athlete_schools.athlete_id AND training_groups.school_id = athlete_schools.school_id WHERE training_groups.id IN coach_group_ids AND athlete_schools.ended_at IS NULL AND training_plan_assignments.withdrawn_at IS NULL",
  );
});

test("no assignment query uses the swimmers that carry no school", () => {
  const queries = streamQueries("training_plans_assignments_staff").join("\n");

  expect(queries).not.toMatch(/\b(admin_athlete_ids|coach_direct_athlete_ids|coach_group_athlete_ids)\b/);
});

// The group, category and school assignments are school data: every member of the school reads them (RLS), so the link
// of one swimmer does not decide them.
test("the group, category and school assignments keep their shape", () => {
  const unchanged = streamQueries("training_plans_assignments_staff").filter(
    (query) => !query.includes("training_plan_assignments.athlete_id = athlete_") && !/target <> 'athlete'/.test(query),
  );

  expect(unchanged).toEqual([
    "SELECT * FROM training_plan_assignments WHERE group_id IN coach_group_ids AND school_id IN member_school_ids AND withdrawn_at IS NULL",
    "SELECT * FROM training_plan_assignments WHERE group_id IN coach_direct_group_ids AND school_id IN member_school_ids AND withdrawn_at IS NULL",
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN athlete_schools ON training_plan_assignments.category_id = athlete_schools.category_id AND training_plan_assignments.school_id = athlete_schools.school_id JOIN coach_athlete_assignments ON athlete_schools.athlete_id = coach_athlete_assignments.athlete_id AND athlete_schools.school_id = coach_athlete_assignments.school_id WHERE coach_athlete_assignments.coach_user_id = auth.user_id() AND training_plan_assignments.school_id IN member_school_ids AND training_plan_assignments.withdrawn_at IS NULL",
    "SELECT training_plan_assignments.* FROM training_plan_assignments JOIN athlete_schools ON training_plan_assignments.category_id = athlete_schools.category_id AND training_plan_assignments.school_id = athlete_schools.school_id JOIN athlete_groups ON athlete_schools.athlete_id = athlete_groups.athlete_id JOIN training_groups ON athlete_groups.group_id = training_groups.id AND athlete_schools.school_id = training_groups.school_id WHERE athlete_groups.group_id IN coach_group_ids AND training_plan_assignments.school_id IN member_school_ids AND training_plan_assignments.withdrawn_at IS NULL",
    "SELECT * FROM training_plan_assignments WHERE target = 'school' AND school_id IN member_school_ids AND withdrawn_at IS NULL",
  ]);
});
