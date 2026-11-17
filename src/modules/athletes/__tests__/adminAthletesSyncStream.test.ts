import { readFileSync } from "node:fs";
import { join } from "node:path";

// The athlete_schools and athlete_groups rows have a school: an admin gets them only for the schools they administer
// (#1150), as a coach does only in the school of the assignment (#1132) and as training_plans_fulfillments does for
// admins. The pgTAP test supabase/tests/database/athletes/admin_enrollment_school.test.sql
// (pg_temp.stream_schools_admin, pg_temp.stream_groups_admin) holds a copy of those two queries: change both together.
// The athletes, athlete_managers and authorization_status rows have no school column, so they stay school-free.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const streamQueries = (
  config.split(/\n {2}athletes_visible:\n/)[1]?.split(/\n\s*\n/)[0] ?? ""
)
  .split("\n")
  .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

const adminQueriesOf = (table: string) =>
  streamQueries.filter(
    (query) => query.includes(`FROM ${table} `) && query.includes("admin_"),
  );

test("the admin queries of athletes_visible bind the enrollment and the group rows to the administered school", () => {
  expect(adminQueriesOf("athlete_schools")).toEqual([
    "SELECT * FROM athlete_schools WHERE school_id IN admin_school_ids",
  ]);
  expect(adminQueriesOf("athlete_groups")).toEqual([
    "SELECT athlete_groups.* FROM athlete_groups JOIN training_groups ON athlete_groups.group_id = training_groups.id JOIN athlete_schools ON athlete_groups.athlete_id = athlete_schools.athlete_id AND training_groups.school_id = athlete_schools.school_id WHERE athlete_schools.school_id IN admin_school_ids",
  ]);
});

test("no athletes_visible query reads the enrollment or the group rows through the school-free admin athlete ids", () => {
  expect(
    streamQueries.filter(
      (query) =>
        /FROM athlete_(schools|groups)\b/.test(query) &&
        query.includes("admin_athlete_ids"),
    ),
  ).toEqual([]);
});

test("the managed queries of athlete_schools and athlete_groups are the ones without admin or coach ids", () => {
  expect(
    streamQueries.filter((query) =>
      /FROM athlete_(schools|groups) WHERE athlete_id IN managed_athlete_ids$/.test(
        query,
      ),
    ),
  ).toEqual([
    "SELECT * FROM athlete_schools WHERE athlete_id IN managed_athlete_ids",
    "SELECT * FROM athlete_groups WHERE athlete_id IN managed_athlete_ids",
  ]);
});
