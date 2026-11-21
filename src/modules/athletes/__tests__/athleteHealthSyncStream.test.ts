import { readFileSync } from "node:fs";
import { join } from "node:path";

// The athletes_health stream (issue #1369) gives the health row of a swimmer only to the devices of the family: guardians and the
// adult athlete (managed_athlete_ids, which already carries the account_sync_access gate). No staff stream exists: a coach never sees
// it and a school admin only through the audited reveal online (issue 1370).
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const queries = [...config.matchAll(/^\s+- (SELECT .+)$/gm)].map((m) => m[1]);
const healthQueries = queries.filter((query) => /\bathlete_health\b/.test(query));
const streamBlock = config.split(/\n {2}athletes_health:\n/)[1]?.split(/\n\s*\n/)[0] ?? "";

test("the stream has one query, through managed_athlete_ids only", () => {
  expect(healthQueries).toHaveLength(1);
  expect(healthQueries[0]).toMatch(/ FROM athlete_health WHERE athlete_id IN managed_athlete_ids$/);
});

test("the query names its columns and never selects updated_by or *", () => {
  expect(healthQueries[0]).toMatch(
    /^SELECT id, athlete_id, blood_type, weight_kg, height_cm, measured_on, allergies, updated_at FROM /,
  );
  expect(healthQueries[0]).not.toMatch(/\*|updated_by/);
});

test("the set the stream reads is the one of the family, not a staff visibility set", () => {
  expect(config).toMatch(/^ {2}managed_athlete_ids: SELECT athlete_id FROM athlete_managers WHERE /m);
  for (const staff of ["coach_direct_athlete_ids", "coach_group_athlete_ids", "admin_athlete_ids"]) {
    expect(healthQueries[0]).not.toContain(staff);
  }
});

test("the stream is only the one query", () => {
  expect(streamBlock.split("\n").filter((line) => /^\s+- /.test(line))).toHaveLength(1);
});
