import { readFileSync } from "node:fs";
import { join } from "node:path";

// The staff queries of timing_measurements mirror the staff branches of measurements_select (#1122): a coach gets a mark
// only for a swimmer assigned in the mark's school, an admin only for their admin schools. The pgTAP test
// supabase/tests/database/timing/coach_assignment_school.test.sql (pg_temp.staff_stream_ids) holds a copy of them:
// change both together.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const definition = (name: string) =>
  config.match(new RegExp(`^ {2}${name}: (.+)$`, "m"))?.[1];
const streamQueries =
  (config.split(/\n {2}timing_measurements:\n/)[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

const coachSource = /\bcoach_(athlete_assignments|group_ids|direct_athlete_ids|group_athlete_ids)\b/;
const schoolFreeCoachIds = /\bcoach_(direct|group)_athlete_ids\b/;

test("every coach query of timing_measurements binds the swimmer and the school of the mark", () => {
  const coach = streamQueries.filter((query) => coachSource.test(query));

  expect(coach).toHaveLength(2);
  const direct = coach.filter((query) => /JOIN coach_athlete_assignments\b/.test(query));
  const group = coach.filter((query) => /JOIN training_groups\b/.test(query));
  expect(direct).toHaveLength(1);
  expect(group).toHaveLength(1);
  expect(direct[0]).toContain("ON measurements.athlete_id = coach_athlete_assignments.athlete_id AND measurements.school_id = coach_athlete_assignments.school_id");
  expect(group[0]).toContain("measurements.school_id = training_groups.school_id");
});

test("no query of timing_measurements uses the coach ids that carry no school", () => {
  expect(streamQueries.filter((query) => schoolFreeCoachIds.test(query))).toEqual([]);
});

test("no line of the file, quoted or elsewhere, reads measurements by the coach ids that carry no school", () => {
  const lines = config.split("\n").filter((line) => schoolFreeCoachIds.test(line) && /FROM measurements\b/.test(line));

  expect(lines).toEqual([]);
});

test("the admin query binds the school to the admin schools, not to the member ones", () => {
  const admin = streamQueries.filter((query) => /\badmin_athlete_ids\b/.test(query));

  expect(admin).toEqual([
    "SELECT * FROM measurements WHERE athlete_id IN admin_athlete_ids AND hidden = false AND school_id IN admin_school_ids",
  ]);
  expect(admin[0]).not.toMatch(/member_school_ids/);
});

test("the coach groups and the member schools are the ones the queries rely on", () => {
  expect(definition("coach_group_ids")).toBe(
    "SELECT group_id FROM coach_group_assignments WHERE coach_user_id = auth.user_id() AND group_id IN (SELECT id FROM training_groups WHERE school_id IN (SELECT school_id FROM school_memberships WHERE user_id = auth.user_id() AND deactivated_at IS NULL))",
  );
  expect(definition("member_school_ids")).toBe(
    "SELECT school_id FROM school_memberships WHERE user_id = auth.user_id() AND deactivated_at IS NULL",
  );
});
