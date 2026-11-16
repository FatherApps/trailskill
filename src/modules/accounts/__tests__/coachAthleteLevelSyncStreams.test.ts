import { readFileSync } from "node:fs";
import { join } from "node:path";

// athlete_managers and authorization_status hold one row per swimmer (per swimmer and purpose) with no school column:
// a row is the same in every school (issue 1127). So their streams give a coach the rows of a swimmer through any assignment
// in a school where the coach is active, exactly like athlete_managers_select and authorization_status_select do
// through app.visible_athlete_ids(). The pgTAP test
// supabase/tests/database/accounts/coach_reads_athlete_level_rows.test.sql (pg_temp.stream_athlete_ids) holds a copy of
// their athlete filter: change both together.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const definition = (name: string) =>
  config.match(new RegExp(`^ {2}${name}: (.+)$`, "m"))?.[1];
const streamQueries = (stream: string) =>
  (config.split(new RegExp(`\\n {2}${stream}:\\n`))[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

test("accounts_athlete_managers reads the rows of a swimmer through every source of the coach and admin ids", () => {
  expect(streamQueries("accounts_athlete_managers")).toEqual([
    "SELECT * FROM athlete_managers WHERE athlete_id IN managed_athlete_ids OR athlete_id IN coach_direct_athlete_ids OR athlete_id IN coach_group_athlete_ids OR athlete_id IN admin_athlete_ids",
  ]);
});

test("accounts_authorization_status reads the rows of a swimmer through every source of the coach and admin ids", () => {
  expect(streamQueries("accounts_authorization_status")).toEqual([
    "SELECT * FROM authorization_status WHERE athlete_id IN managed_athlete_ids OR athlete_id IN coach_direct_athlete_ids OR athlete_id IN coach_group_athlete_ids OR athlete_id IN admin_athlete_ids",
  ]);
});

test("the coach athlete ids count only the schools where the coach is active", () => {
  expect(definition("coach_direct_athlete_ids")).toBe(
    "SELECT athlete_id FROM coach_athlete_assignments WHERE coach_user_id = auth.user_id() AND school_id IN (SELECT school_id FROM school_memberships WHERE user_id = auth.user_id() AND deactivated_at IS NULL)",
  );
  expect(definition("coach_group_athlete_ids")).toBe(
    "SELECT athlete_id FROM athlete_groups WHERE group_id IN (SELECT group_id FROM coach_group_assignments WHERE coach_user_id = auth.user_id() AND group_id IN (SELECT id FROM training_groups WHERE school_id IN (SELECT school_id FROM school_memberships WHERE user_id = auth.user_id() AND deactivated_at IS NULL)))",
  );
});
