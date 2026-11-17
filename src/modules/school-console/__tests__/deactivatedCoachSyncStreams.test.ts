import { readFileSync } from "node:fs";
import { join } from "node:path";

// The streams say what the select policies say (#1031): a deactivated coach gets no row of that school; the own membership still syncs.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const definition = (name: string) =>
  config.match(new RegExp(`^ {2}${name}: (.+)$`, "m"))?.[1] ?? "";

test.each([
  "member_school_ids",
  "own_series_ids",
  "coach_direct_athlete_ids",
  "coach_group_athlete_ids",
  "coach_group_ids",
  "coach_direct_group_ids",
  "member_group_ids",
])("%s leaves out the deactivated memberships", (name) => {
  expect(definition(name)).toContain("deactivated_at IS NULL");
});

test("school_console_staff filters the coach assignments and keeps the own membership", () => {
  const stream =
    config.split(/\n {2}school_console_staff:\n/)[1]?.split(/\n\s*\n/)[0] ?? "";

  expect(stream).toContain(
    "SELECT * FROM school_memberships WHERE user_id = auth.user_id() OR school_id IN admin_school_ids",
  );
  expect(stream).toContain(
    "SELECT * FROM coach_group_assignments WHERE coach_user_id = auth.user_id() AND group_id IN coach_group_ids",
  );
  expect(stream).toContain(
    "SELECT * FROM coach_athlete_assignments WHERE coach_user_id = auth.user_id() AND school_id IN member_school_ids",
  );
});

// A multi-school athlete: a coach gets its school, group and mark rows only in the schools where the coach is active.
test("a coach gets the school, group and mark rows of an athlete only in their active schools", () => {
  const queriesOf = (stream: string) =>
    [
      ...(
        config
          .split(new RegExp(`\\n {2}${stream}:\\n`))[1]
          ?.split(/\n\s*\n/)[0] ?? ""
      ).matchAll(/^\s+- (SELECT .+)$/gm),
    ].map((match) => match[1]);
  const visible = queriesOf("athletes_visible");
  const marks = queriesOf("training_plans_fulfillments");

  // The enrollment and group coach queries bind the swimmer to the school of the assignment since issue 1132 and stay
  // limited to active schools and groups through member_school_ids and member_group_ids.
  const coachRows = visible.filter(
    (query) =>
      /FROM athlete_(schools|groups) /.test(query) && query.includes("coach_"),
  );
  expect(coachRows).toHaveLength(4);
  expect(
    coachRows.every(
      (query) =>
        query.endsWith("AND athlete_schools.school_id IN member_school_ids") ||
        query.endsWith("AND athlete_groups.group_id IN member_group_ids"),
    ),
  ).toBe(true);
  // The fulfillment coach queries bind the swimmer to the assignment school since issue 1127 and stay limited to active schools through member_school_ids.
  const coachMarks = marks.filter((query) => query.includes("coach_"));
  expect(coachMarks).toHaveLength(2);
  expect(
    coachMarks.every((query) =>
      query.endsWith("AND training_plan_assignments.school_id IN member_school_ids"),
    ),
  ).toBe(true);
  // No other query gives the coach sources an athlete's school or group rows without the school filter.
  const bound = visible.filter(
    (query) =>
      /^SELECT athlete_(schools|groups)\.\* FROM athlete_/.test(query) &&
      query.includes("coach_"),
  );
  expect(bound).toHaveLength(4);
  expect(
    bound.every((query) =>
      /AND athlete_(schools\.school|groups\.group)_id IN member_(school|group)_ids$/.test(query),
    ),
  ).toBe(true);
});
