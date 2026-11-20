import { readFileSync } from "node:fs";
import { join } from "node:path";

// A school ends a swimmer's link with athlete_schools.ended_at (#1243): after that its coaches and admins get nothing of
// that swimmer, one (swimmer, school) pair at a time; guardians and adult athletes (managed_athlete_ids) keep it all.
// The pgTAP test supabase/tests/database/athletes/end_athlete_school.test.sql holds the RLS side and copies of the
// enrollment queries: change both together.
// PowerSync 1.21 builds the buckets of a join from separate lookups and combines their values as a cross product, so the
// pair (swimmer, school) survives only in three query shapes. #1260 found it against a real PowerSync with an admin and a
// coach of two schools, one of them with the swimmer ended; the text of the query is the contract:
//   admin          school_memberships joined to the row by its school first, athlete_schools last (same school, the row's swimmer)
//   direct coach   athlete_schools first, coach_athlete_assignments last (swimmer and school come from one row)
//   coach by group the chain starts at training_groups.id IN coach_group_ids and ends at athlete_schools
// A school condition of its own (IN member_school_ids, an extra join on school_memberships) beside the by-group or admin
// joins makes swimmer and school independent again: the ended pair comes back.
const config = readFileSync(join(__dirname, "../../../../powersync/sync-config.yaml"), "utf8");
const queries = config
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .map((line) => line.replace(/^\s*(- )?/, ""))
  .filter((line) => /\bSELECT\b/.test(line));
const withDefinitions = (name: string) => config.match(new RegExp(`^ {2}${name}: (.+)$`, "m"))?.[1] ?? "";
const joinedTables = (query: string) => [...query.matchAll(/ JOIN (\w+)(?: AS (\w+))? ON /g)].map((m) => m[2] ?? m[1]);

const staffQueriesReading = (table: string) =>
  queries.filter(
    (query) =>
      new RegExp(`\\bFROM ${table}\\b`).test(query) &&
      /JOIN (coach_athlete_assignments|coach_group_assignments|school_memberships)\b|\bIN coach_group_ids\b/.test(query),
  );
// The assignments aimed at a swimmer; the group, category and school ones are school data and keep their shape.
const athleteAssignments = () =>
  staffQueriesReading("training_plan_assignments").filter((query) =>
    query.includes("training_plan_assignments.athlete_id = athlete_"),
  );

test("every staff query that reads athlete_schools keeps only the links not ended", () => {
  // The plan assignments of a category are school data, not the swimmer's: every member of the school reads them (RLS).
  const staff = queries.filter(
    (query) =>
      /\bathlete_schools\b/.test(query) &&
      !/\b(managed_\w+|athlete_managers)\b/.test(query) &&
      !query.includes("athlete_schools.category_id"),
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

test("the admin queries bind the row to a school they administer first and to the link last", () => {
  const admin = [
    ...staffQueriesReading("measurements"),
    ...staffQueriesReading("training_plan_fulfillments"),
    ...staffQueriesReading("athlete_groups"),
  ].filter((query) => query.includes("school_memberships.role = 'school_admin'"));

  expect(admin).toHaveLength(3);
  for (const query of admin) {
    expect(joinedTables(query).slice(-2)).toEqual(["school_memberships", "athlete_schools"]);
    expect(query).toContain("AND school_memberships.school_id = athlete_schools.school_id WHERE school_memberships.user_id = auth.user_id()");
    expect(query).toContain("athlete_schools.ended_at IS NULL");
    expect(query).not.toMatch(/\b(admin_school_ids|admin_athlete_ids|member_school_ids)\b/);
  }
});

test("the direct coach queries take the swimmer and the school from the coach assignment row", () => {
  const direct = [
    ...staffQueriesReading("measurements"),
    ...staffQueriesReading("training_plan_fulfillments"),
    ...staffQueriesReading("athlete_groups"),
    ...athleteAssignments(),
  ].filter((query) => query.includes("JOIN coach_athlete_assignments "));

  expect(direct).toHaveLength(4);
  for (const query of direct) {
    const tables = joinedTables(query);
    // The group rows of a swimmer join the group first, so there the assignment comes before the link.
    const [first, last] = query.startsWith("SELECT athlete_groups.*")
      ? ["coach_athlete_assignments", "athlete_schools"]
      : ["athlete_schools", "coach_athlete_assignments"];
    expect(tables.indexOf(first)).toBeGreaterThan(-1);
    expect(tables.indexOf(first)).toBeLessThan(tables.indexOf(last));
    expect(tables.at(-1)).toBe(last);
    expect(query).toContain("athlete_schools.ended_at IS NULL");
    expect(query).toContain("coach_athlete_assignments.coach_user_id = auth.user_id()");
  }
});

test("the by-group coach queries start at the active groups of the coach and end at the link", () => {
  const group = [
    ...staffQueriesReading("measurements"),
    ...staffQueriesReading("training_plan_fulfillments"),
    ...staffQueriesReading("athlete_groups"),
    ...athleteAssignments(),
  ].filter((query) => /\bIN coach_group_ids\b/.test(query));

  expect(group).toHaveLength(4);
  for (const query of group) {
    expect(joinedTables(query).at(-1)).not.toBe("coach_group_assignments");
    expect(joinedTables(query)).toContain("athlete_schools");
    expect(query).toMatch(/\b(training_groups|coached_groups)\.id IN coach_group_ids AND athlete_schools\.ended_at IS NULL/);
    // The groups of coach_group_ids are the ones of the schools where the coach is active: no school condition of its own.
    expect(query).not.toMatch(/\b(member_school_ids|admin_school_ids)\b/);
    expect(query).not.toContain("JOIN school_memberships");
  }
});

test("guardians and adult athletes still read the enrollment rows of their swimmers, ended ones included", () => {
  expect(queries).toContain("SELECT * FROM athlete_schools WHERE athlete_id IN managed_athlete_ids");
});
