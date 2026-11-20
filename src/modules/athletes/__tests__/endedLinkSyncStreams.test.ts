import { readFileSync } from "node:fs";
import { join } from "node:path";

// A school ends a swimmer's link with athlete_schools.ended_at (#1243): after that its coaches and admins get nothing of
// that swimmer, one (swimmer, school) pair at a time; guardians and adult athletes (managed_athlete_ids) keep it all.
// The pgTAP test supabase/tests/database/athletes/end_athlete_school.test.sql holds the RLS side and copies of the
// enrollment queries: change both together.
// Found against a real PowerSync 1.21: its joins cut a pair only when athlete_schools is the FIRST joined table and the
// user-bound table (coach_athlete_assignments, coach_group_assignments, school_memberships) is the last one; as a trailing
// join the ended_at filter is ignored. So the order is part of the contract.
const config = readFileSync(join(__dirname, "../../../../powersync/sync-config.yaml"), "utf8");
const queries = config
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .map((line) => line.replace(/^\s*(- )?/, ""))
  .filter((line) => /\bSELECT\b/.test(line));
const withDefinitions = (name: string) => config.match(new RegExp(`^ {2}${name}: (.+)$`, "m"))?.[1] ?? "";

const staffQueriesReading = (table: string) =>
  queries.filter(
    (query) =>
      new RegExp(`\\bFROM ${table}\\b`).test(query) &&
      /JOIN (coach_athlete_assignments|coach_group_assignments|school_memberships)\b/.test(query),
  );

test("every staff query that reads athlete_schools keeps only the links not ended", () => {
  // The plan assignments of a category are school data, not the swimmer's: every member of the school reads them (RLS).
  const staff = queries.filter(
    (query) =>
      /\bathlete_schools\b/.test(query) &&
      !/\b(managed_\w+|athlete_managers)\b/.test(query) &&
      !query.startsWith("SELECT training_plan_assignments.*"),
  );

  expect(staff.length).toBeGreaterThan(10);
  for (const query of staff) expect(query).toContain("ended_at IS NULL");
});

test("the staff athlete ids of the athletes, managers, authorization and photo streams ignore ended links", () => {
  const names = [
    "coach_direct_athlete_ids",
    "coach_group_athlete_ids",
    "admin_athlete_ids",
    "photo_coach_direct_athlete_ids",
    "photo_coach_group_athlete_ids",
    "photo_admin_athlete_ids",
    "admin_guardian_user_ids",
  ];

  for (const name of names) expect(withDefinitions(name)).toContain("ended_at IS NULL");
});

test("the coach and admin queries that bind a table to the link put athlete_schools first and the user-bound table last", () => {
  const joined = [
    ...staffQueriesReading("measurements"),
    ...staffQueriesReading("training_plan_fulfillments"),
    ...staffQueriesReading("athlete_groups"),
  ];

  expect(joined).toHaveLength(9);
  for (const query of joined) {
    const link = query.indexOf("JOIN athlete_schools ");
    const bound = query.search(/JOIN (coach_athlete_assignments|coach_group_assignments|school_memberships) /);
    expect(link).toBeGreaterThan(-1);
    expect(bound).toBeGreaterThan(link);
    // Nothing joined after the user-bound table, or PowerSync stops matching the swimmer with the school.
    expect(query.slice(bound).match(/ JOIN /g)?.length ?? 0).toBe(0);
    expect(query).toContain("athlete_schools.ended_at IS NULL");
  }
});

test("guardians and adult athletes still read the enrollment rows of their swimmers, ended ones included", () => {
  expect(queries).toContain("SELECT * FROM athlete_schools WHERE athlete_id IN managed_athlete_ids");
});
