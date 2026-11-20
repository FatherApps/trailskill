import { readFileSync } from "node:fs";
import { join } from "node:path";

const config = readFileSync(join(__dirname, "../../../../powersync/sync-config.yaml"), "utf8");
const streamQueries = (name: string) =>
  (config.split(new RegExp(`\\n {2}${name}:\\n`))[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

// timing_measurement_conflicts and the ended link (#1243, #1260). School admins read the status of the conflicts of the
// marks of their school's swimmers. The mark and the swimmer are matched with the school in one chain, so a swimmer ended in
// school A and active in B gives an admin of both only the conflicts of B (checked against a real PowerSync 1.21 with an
// admin of two schools; see athletes/__tests__/endedLinkSyncStreams.test.ts for the three query shapes).
test("an admin gets the conflicts of a mark only in a school where the swimmer is still linked", () => {
  const admin = streamQueries("timing_measurement_conflicts").filter((query) => query.includes("JOIN school_memberships"));

  expect(admin).toEqual([
    "SELECT record_conflicts.id, 'measurements' AS table_name, record_conflicts.measurement_id AS record_id, record_conflicts.status FROM measurement_conflicts AS record_conflicts JOIN measurements ON record_conflicts.measurement_id = measurements.id JOIN school_memberships ON measurements.school_id = school_memberships.school_id JOIN athlete_schools ON measurements.athlete_id = athlete_schools.athlete_id AND school_memberships.school_id = athlete_schools.school_id WHERE school_memberships.user_id = auth.user_id() AND school_memberships.role = 'school_admin' AND athlete_schools.ended_at IS NULL AND measurements.hidden = false",
  ]);
});

test("no conflict query reads the marks by the admin schools and the admin swimmers apart", () => {
  const queries = streamQueries("timing_measurement_conflicts").join("\n");

  expect(queries).not.toMatch(/\b(admin_school_ids|admin_athlete_ids)\b/);
});

test("the authors of a conflict still get it, whatever the link", () => {
  expect(streamQueries("timing_measurement_conflicts").filter((query) => !query.includes("JOIN"))).toEqual([
    "SELECT id, 'measurements' AS table_name, measurement_id AS record_id, status FROM measurement_conflicts AS record_conflicts WHERE incoming_by = auth.user_id()",
    "SELECT id, 'measurements' AS table_name, measurement_id AS record_id, status FROM measurement_conflicts AS record_conflicts WHERE current_by = auth.user_id()",
  ]);
});
