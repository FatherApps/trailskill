import { readFileSync } from "node:fs";
import { join } from "node:path";

// The staff queries of training_plans_fulfillments mirror the coach branch of training_plan_fulfillments_select (#1127):
// a coach gets a fulfillment only for a swimmer assigned in the school of the fulfillment's assignment. The pgTAP test
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

const coachSource = /\bcoach_(athlete_assignments|group_ids|direct_athlete_ids|group_athlete_ids)\b/;
const schoolFreeCoachIds = /\bcoach_(direct|group)_athlete_ids\b/;

test("every coach query of training_plans_fulfillments binds the swimmer and the school of the assignment", () => {
  const coach = streamQueries.filter((query) => coachSource.test(query));

  expect(coach).toHaveLength(2);
  const direct = coach.filter((query) => /JOIN coach_athlete_assignments\b/.test(query));
  const group = coach.filter((query) => /JOIN training_groups\b/.test(query));
  expect(direct).toHaveLength(1);
  expect(group).toHaveLength(1);
  expect(direct[0]).toContain("JOIN training_plan_assignments ON training_plan_fulfillments.assignment_id = training_plan_assignments.id");
  expect(direct[0]).toContain("ON training_plan_fulfillments.athlete_id = coach_athlete_assignments.athlete_id AND training_plan_assignments.school_id = coach_athlete_assignments.school_id");
  expect(group[0]).toContain("JOIN training_plan_assignments ON training_plan_fulfillments.assignment_id = training_plan_assignments.id");
  expect(group[0]).toContain("training_plan_assignments.school_id = training_groups.school_id");
  expect(group[0]).toContain("athlete_groups.group_id IN coach_group_ids");
});

test("no query of training_plans_fulfillments uses the coach ids that carry no school", () => {
  expect(streamQueries.filter((query) => schoolFreeCoachIds.test(query))).toEqual([]);
});

test("no line of the file, quoted or elsewhere, reads training_plan_fulfillments by the coach ids that carry no school", () => {
  const lines = config.split("\n").filter((line) => schoolFreeCoachIds.test(line) && /FROM training_plan_fulfillments\b/.test(line));

  expect(lines).toEqual([]);
});

test("the guardian and adult athlete query and the admin query are unchanged", () => {
  expect(streamQueries.filter((query) => /\bmanaged_athlete_ids\b/.test(query))).toEqual([
    "SELECT * FROM training_plan_fulfillments WHERE athlete_id IN managed_athlete_ids",
  ]);
  expect(streamQueries.filter((query) => /\badmin_athlete_ids\b/.test(query))).toEqual([
    "SELECT * FROM training_plan_fulfillments WHERE athlete_id IN admin_athlete_ids AND hidden = false",
  ]);
});
