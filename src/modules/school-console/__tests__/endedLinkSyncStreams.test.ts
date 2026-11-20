import { readFileSync } from "node:fs";
import { join } from "node:path";

// The streams also require the user's row in account_sync_access (a marked account syncs nothing, issue 1244); this test pins the rest.
const config = readFileSync(join(__dirname, "../../../../powersync/sync-config.yaml"), "utf8").replaceAll(
  / AND [\w.]+ IN \(SELECT user_id FROM account_sync_access WHERE user_id = auth\.user_id\(\)\)/g,
  "",
);
const streamQueries = (name: string) =>
  (config.split(new RegExp(`\\n {2}${name}:\\n`))[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

// The assignments of a coach to a swimmer and the ended link (#1243, #1260). The row names a swimmer and a school, so it
// belongs to that pair: after the baja neither the coach nor the school's admins get it, and a swimmer ended in school A
// and active in B leaves an admin of both only the assignments of B (checked against a real PowerSync 1.21; see
// athletes/__tests__/endedLinkSyncStreams.test.ts for the query shapes).
test("an admin gets the coach assignments of a swimmer only in a school where the swimmer is still linked", () => {
  expect(streamQueries("school_console_staff")).toContain(
    "SELECT coach_athlete_assignments.* FROM coach_athlete_assignments JOIN school_memberships ON coach_athlete_assignments.school_id = school_memberships.school_id JOIN athlete_schools ON coach_athlete_assignments.athlete_id = athlete_schools.athlete_id AND school_memberships.school_id = athlete_schools.school_id WHERE school_memberships.user_id = auth.user_id() AND school_memberships.role = 'school_admin' AND athlete_schools.ended_at IS NULL",
  );
});

// The user-bound table is the data table itself, so the coach side joins its own rows a second time to carry the pair
// into athlete_schools.
test("a coach gets their own assignments only for the pairs not ended", () => {
  expect(streamQueries("school_console_staff")).toContain(
    "SELECT coach_athlete_assignments.* FROM coach_athlete_assignments JOIN school_memberships ON coach_athlete_assignments.school_id = school_memberships.school_id JOIN athlete_schools ON coach_athlete_assignments.athlete_id = athlete_schools.athlete_id AND school_memberships.school_id = athlete_schools.school_id WHERE school_memberships.user_id = auth.user_id() AND school_memberships.deactivated_at IS NULL AND athlete_schools.ended_at IS NULL AND coach_athlete_assignments.coach_user_id = auth.user_id()",
  );
});

test("no coach assignment query is left that ignores the link", () => {
  const assignments = streamQueries("school_console_staff").filter((query) => query.includes("FROM coach_athlete_assignments"));

  expect(assignments).toHaveLength(2);
  for (const query of assignments) expect(query).toContain("athlete_schools.ended_at IS NULL");
});

// A group assignment names a group of the school, not a swimmer: the link of one swimmer does not decide it.
test("the group assignments keep their shape", () => {
  expect(streamQueries("school_console_staff").filter((query) => query.includes("FROM coach_group_assignments"))).toEqual([
    "SELECT * FROM coach_group_assignments WHERE coach_user_id = auth.user_id() AND group_id IN coach_group_ids",
    "SELECT * FROM coach_group_assignments WHERE group_id IN admin_group_ids",
  ]);
});
