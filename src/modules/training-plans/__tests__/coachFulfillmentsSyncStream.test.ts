import { readFileSync } from "node:fs";
import { join } from "node:path";

// The staff queries of training_plans_fulfillments mirror the coach (#1127) and admin (#1132) branches of
// training_plan_fulfillments_select: staff get a fulfillment only for a swimmer of theirs in the school of the
// fulfillment's assignment. The pgTAP test
// supabase/tests/database/training-plans/coach_fulfillments_assignment_school.test.sql (pg_temp.staff_stream_ids) holds
// a copy of them: change both together.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const streamQueries =
  (config.split(/\n {2}training_plans_fulfillments:\n/)[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

const coachSource = /\bcoach_(athlete_assignments|group_assignments|group_ids|direct_athlete_ids|group_athlete_ids)\b/;
const schoolFreeCoachIds = /\bcoach_(direct|group)_athlete_ids\b/;

test("every coach query of training_plans_fulfillments binds the swimmer and the school of the assignment", () => {
  const coach = streamQueries.filter((query) => coachSource.test(query));

  expect(coach).toHaveLength(2);
  const direct = coach.filter((query) => /JOIN coach_athlete_assignments\b/.test(query));
  const group = coach.filter((query) => /JOIN training_groups\b/.test(query));
  expect(direct).toHaveLength(1);
  expect(group).toHaveLength(1);
  expect(direct[0]).toContain("WHERE coach_athlete_assignments.coach_user_id = auth.user_id()");
  expect(direct[0]).toContain("JOIN training_plan_assignments ON training_plan_fulfillments.assignment_id = training_plan_assignments.id");
  // An ended link (#1243) cuts the pair: athlete_schools is the first joined table, the user-bound one the last.
  expect(direct[0]).toContain("JOIN athlete_schools ON training_plan_fulfillments.athlete_id = athlete_schools.athlete_id AND training_plan_assignments.school_id = athlete_schools.school_id JOIN coach_athlete_assignments ON athlete_schools.athlete_id = coach_athlete_assignments.athlete_id AND athlete_schools.school_id = coach_athlete_assignments.school_id");
  expect(direct[0]).toContain("athlete_schools.ended_at IS NULL");
  expect(group[0]).toContain("JOIN training_plan_assignments ON training_plan_fulfillments.assignment_id = training_plan_assignments.id");
  // By group the chain starts at the coach's active groups and ends at athlete_schools, with no school condition of its own
  // (#1260): beside those joins a school set splits the swimmer from the school again in PowerSync.
  expect(group[0]).toContain("JOIN training_groups ON training_plan_assignments.school_id = training_groups.school_id JOIN athlete_groups ON training_plan_fulfillments.athlete_id = athlete_groups.athlete_id AND training_groups.id = athlete_groups.group_id JOIN athlete_schools ON athlete_groups.athlete_id = athlete_schools.athlete_id AND training_groups.school_id = athlete_schools.school_id");
  expect(group[0]).toContain("WHERE training_groups.id IN coach_group_ids AND athlete_schools.ended_at IS NULL");
});

test("no query of training_plans_fulfillments uses the coach ids that carry no school", () => {
  expect(streamQueries.filter((query) => schoolFreeCoachIds.test(query))).toEqual([]);
});

test("no line of the file, quoted or elsewhere, reads training_plan_fulfillments by the coach ids that carry no school", () => {
  const lines = config.split("\n").filter((line) => schoolFreeCoachIds.test(line) && /FROM training_plan_fulfillments\b/.test(line));

  expect(lines).toEqual([]);
});

test("the guardian and adult athlete query is unchanged", () => {
  expect(streamQueries.filter((query) => /\bmanaged_athlete_ids\b/.test(query))).toEqual([
    "SELECT * FROM training_plan_fulfillments WHERE athlete_id IN managed_athlete_ids",
  ]);
});

// A school admin gets a fulfillment only for a swimmer of their school and an assignment of that same school (#1132).
test("the admin query binds the swimmer's school to the school of the assignment", () => {
  expect(streamQueries.filter((query) => /\bJOIN school_memberships\b/.test(query))).toEqual([
    "SELECT training_plan_fulfillments.* FROM training_plan_fulfillments JOIN training_plan_assignments ON training_plan_fulfillments.assignment_id = training_plan_assignments.id JOIN school_memberships ON training_plan_assignments.school_id = school_memberships.school_id JOIN athlete_schools ON training_plan_fulfillments.athlete_id = athlete_schools.athlete_id AND school_memberships.school_id = athlete_schools.school_id WHERE school_memberships.user_id = auth.user_id() AND school_memberships.role = 'school_admin' AND athlete_schools.ended_at IS NULL AND training_plan_fulfillments.hidden = false",
  ]);
});

test("no line of the file reads training_plan_fulfillments by the admin athlete ids that carry no school", () => {
  const lines = config.split("\n").filter((line) => /\badmin_athlete_ids\b/.test(line) && /FROM training_plan_fulfillments\b/.test(line));

  expect(lines).toEqual([]);
});
