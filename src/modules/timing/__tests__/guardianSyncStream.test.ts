import { readFileSync } from "node:fs";
import { join } from "node:path";

// The guardian queries of timing_measurements mirror the guardian branches of measurements_select (#1018). The pgTAP test
// supabase/tests/database/timing/guardian_sharing.test.sql (pg_temp.stream_ids) holds a copy of them: change both together.
// The streams also require the user's row in account_sync_access (a marked account syncs nothing, issue 1244); this test pins the rest.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
).replaceAll(/ AND [\w.]+ IN \(SELECT user_id FROM account_sync_access WHERE user_id = auth\.user_id\(\)\)/g, "");
const definition = (name: string) =>
  config.match(new RegExp(`^ {2}${name}: (.+)$`, "m"))?.[1];
const streamQueries =
  (config.split(/\n {2}timing_measurements:\n/)[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

// Every column of public.measurements except the staff authors (#1020): a guardian does not need who wrote, edited or
// discarded a time. guardian_visible stays: the console reads it, and a row the user also gets as staff keeps one copy.
const guardianColumns =
  "id, created_at, device_id, kind, athlete_id, series_id, arrival_position, hundredths, stroke, distance, pool, session_type, source, captured_at, parent_id, discarded_at, version, base_version, edited_device_id, edited_at, edit_reason, hidden, school_id, guardian_visible";
const guardian = [
  `SELECT ${guardianColumns} FROM measurements WHERE athlete_id IN managed_athlete_ids AND guardian_visible = true`,
  `SELECT ${guardianColumns} FROM measurements WHERE athlete_id IN managed_athlete_ids AND hidden = true`,
  `SELECT ${guardianColumns} FROM measurements WHERE athlete_id IN self_athlete_ids`,
];

test("the guardian ids are the managed ones and the ones the user manages as themselves", () => {
  expect(definition("managed_athlete_ids")).toBe(
    "SELECT athlete_id FROM athlete_managers WHERE user_id = auth.user_id()",
  );
  expect(definition("self_athlete_ids")).toBe(
    "SELECT athlete_id FROM athlete_managers WHERE user_id = auth.user_id() AND relation = 'self'",
  );
});

test("the queries of timing_measurements that read by managed or self athletes are exactly the three guardian ones", () => {
  expect(streamQueries.filter((query) => /\b(managed|self)_athlete_ids\b/.test(query))).toEqual(guardian);
});

test("no guardian query sends every column or the staff authors", () => {
  const read = streamQueries.filter((query) => /\b(managed|self)_athlete_ids\b/.test(query));
  expect(read).toHaveLength(3);
  for (const query of read) {
    expect(query).not.toMatch(/SELECT \*/);
    expect(query).not.toMatch(/\b(created_by|edited_by|discarded_by)\b/);
  }
});

test("the staff queries of timing_measurements still send every column", () => {
  expect(streamQueries.filter((query) => !/\b(managed|self)_athlete_ids\b/.test(query))).toEqual([
    "SELECT measurements.* FROM measurements JOIN athlete_schools ON measurements.athlete_id = athlete_schools.athlete_id AND measurements.school_id = athlete_schools.school_id JOIN coach_athlete_assignments ON athlete_schools.athlete_id = coach_athlete_assignments.athlete_id AND athlete_schools.school_id = coach_athlete_assignments.school_id WHERE coach_athlete_assignments.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND measurements.hidden = false AND measurements.school_id IN member_school_ids",
    "SELECT measurements.* FROM measurements JOIN athlete_schools ON measurements.athlete_id = athlete_schools.athlete_id AND measurements.school_id = athlete_schools.school_id JOIN training_groups ON athlete_schools.school_id = training_groups.school_id JOIN athlete_groups ON athlete_schools.athlete_id = athlete_groups.athlete_id AND training_groups.id = athlete_groups.group_id JOIN coach_group_assignments ON training_groups.id = coach_group_assignments.group_id WHERE coach_group_assignments.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND measurements.hidden = false AND measurements.school_id IN member_school_ids",
    "SELECT measurements.* FROM measurements JOIN athlete_schools ON measurements.athlete_id = athlete_schools.athlete_id AND measurements.school_id = athlete_schools.school_id JOIN school_memberships ON athlete_schools.school_id = school_memberships.school_id WHERE school_memberships.user_id = auth.user_id() AND school_memberships.role = 'school_admin' AND athlete_schools.ended_at IS NULL AND measurements.hidden = false",
    "SELECT * FROM measurements WHERE athlete_id IS NULL AND series_id IN own_series_ids",
  ]);
});

test("no line of the file, quoted or elsewhere, reads measurements by managed or self athletes except the guardian queries", () => {
  const lines = config
    .split("\n")
    .filter((line) => /\b(managed|self)_athlete_ids\b/.test(line) && /FROM measurements\b/.test(line));

  expect(lines.map((line) => line.trim().replace(/^- /, ""))).toEqual(guardian);
});
