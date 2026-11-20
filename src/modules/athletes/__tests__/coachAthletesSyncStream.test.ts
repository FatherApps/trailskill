import { readFileSync } from "node:fs";
import { join } from "node:path";

// The athletes row of a swimmer has no school column: it is the same row in every school (#1127). So the athletes query
// of athletes_visible gives a coach the swimmer through any assignment in a school where the coach is active, exactly
// like athletes_select does through app.visible_athlete_ids(). The pgTAP test
// supabase/tests/database/athletes/coach_reads_athlete_rows.test.sql (pg_temp.stream_athlete_ids) holds a copy of this
// query: change both together.
// The athlete_schools and athlete_groups rows have a school: a coach gets them only in the school where the swimmer is
// assigned to them (#1132). The pgTAP test supabase/tests/database/athletes/coach_enrollment_school.test.sql
// (pg_temp.stream_schools, pg_temp.stream_groups) holds a copy of those four queries: change both together.
// The streams also require the user's row in account_sync_access (a marked account syncs nothing, issue 1244); this test pins the rest.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
).replaceAll(/ AND [\w.]+ IN \(SELECT user_id FROM account_sync_access WHERE user_id = auth\.user_id\(\)\)/g, "");
const definition = (name: string) =>
  config.match(new RegExp(`^ {2}${name}: (.+)$`, "m"))?.[1];
const streamQueries =
  (config.split(/\n {2}athletes_visible:\n/)[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

test("the athletes query of athletes_visible reads the swimmer through every source of the coach and admin ids", () => {
  expect(streamQueries.filter((query) => /FROM athletes\b/.test(query))).toEqual([
    "SELECT * FROM athletes WHERE id IN managed_athlete_ids OR id IN coach_direct_athlete_ids OR id IN coach_group_athlete_ids OR id IN admin_athlete_ids",
  ]);
});

test("the coach athlete ids count only the schools where the coach is active", () => {
  expect(definition("coach_direct_athlete_ids")).toBe(
    "SELECT athlete_schools.athlete_id FROM athlete_schools JOIN coach_athlete_assignments ON athlete_schools.athlete_id = coach_athlete_assignments.athlete_id AND athlete_schools.school_id = coach_athlete_assignments.school_id WHERE coach_athlete_assignments.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND coach_athlete_assignments.school_id IN (SELECT school_id FROM school_memberships WHERE user_id = auth.user_id() AND deactivated_at IS NULL)",
  );
  expect(definition("coach_group_athlete_ids")).toBe(
    "SELECT athlete_schools.athlete_id FROM athlete_schools JOIN training_groups ON athlete_schools.school_id = training_groups.school_id JOIN athlete_groups ON athlete_schools.athlete_id = athlete_groups.athlete_id AND training_groups.id = athlete_groups.group_id JOIN coach_group_assignments ON training_groups.id = coach_group_assignments.group_id WHERE coach_group_assignments.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND athlete_schools.school_id IN (SELECT school_id FROM school_memberships WHERE user_id = auth.user_id() AND deactivated_at IS NULL)",
  );
});

const coachQueriesOf = (table: string) =>
  streamQueries.filter(
    (query) => query.includes(`FROM ${table} `) && query.includes("coach_"),
  );

test("the coach queries of athletes_visible bind the enrollment and the group rows to the school of the assignment", () => {
  expect(coachQueriesOf("athlete_schools")).toEqual([
    "SELECT athlete_schools.* FROM athlete_schools JOIN coach_athlete_assignments ON athlete_schools.athlete_id = coach_athlete_assignments.athlete_id AND athlete_schools.school_id = coach_athlete_assignments.school_id WHERE coach_athlete_assignments.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND athlete_schools.school_id IN member_school_ids",
    "SELECT athlete_schools.* FROM athlete_schools JOIN athlete_groups ON athlete_schools.athlete_id = athlete_groups.athlete_id JOIN training_groups ON athlete_groups.group_id = training_groups.id AND athlete_schools.school_id = training_groups.school_id WHERE athlete_groups.group_id IN coach_group_ids AND athlete_schools.ended_at IS NULL AND athlete_schools.school_id IN member_school_ids",
  ]);
  expect(coachQueriesOf("athlete_groups")).toEqual([
    "SELECT athlete_groups.* FROM athlete_groups JOIN athlete_schools ON athlete_groups.athlete_id = athlete_schools.athlete_id JOIN training_groups ON athlete_groups.group_id = training_groups.id AND athlete_schools.school_id = training_groups.school_id JOIN coach_athlete_assignments ON athlete_schools.athlete_id = coach_athlete_assignments.athlete_id AND athlete_schools.school_id = coach_athlete_assignments.school_id WHERE coach_athlete_assignments.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND athlete_groups.group_id IN member_group_ids",
    "SELECT athlete_groups.* FROM athlete_groups JOIN athlete_schools ON athlete_groups.athlete_id = athlete_schools.athlete_id JOIN training_groups ON athlete_groups.group_id = training_groups.id AND athlete_schools.school_id = training_groups.school_id JOIN athlete_groups AS coached ON athlete_schools.athlete_id = coached.athlete_id JOIN training_groups AS coached_groups ON athlete_schools.school_id = coached_groups.school_id AND coached.group_id = coached_groups.id JOIN coach_group_assignments ON coached_groups.id = coach_group_assignments.group_id WHERE coach_group_assignments.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND athlete_groups.group_id IN member_group_ids",
  ]);
});

test("no athletes_visible query reads the enrollment or the group rows through the school-free coach athlete ids", () => {
  const schoolFree = streamQueries.filter(
    (query) =>
      /FROM athlete_(schools|groups)\b/.test(query) &&
      /coach_(direct|group)_athlete_ids/.test(query),
  );
  // Only the athletes query keeps them: the swimmer row has no school.
  expect(schoolFree).toEqual([]);
});

test("the managed queries of athlete_schools and athlete_groups do not change", () => {
  // The admin queries moved to adminAthletesSyncStream.test.ts (#1150).
  expect(streamQueries).toContain(
    "SELECT * FROM athlete_schools WHERE athlete_id IN managed_athlete_ids",
  );
  expect(streamQueries).toContain(
    "SELECT * FROM athlete_groups WHERE athlete_id IN managed_athlete_ids",
  );
});
