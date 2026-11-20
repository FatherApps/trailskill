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
    "SELECT coach_athlete_assignments.* FROM coach_athlete_assignments JOIN athlete_schools ON coach_athlete_assignments.athlete_id = athlete_schools.athlete_id AND coach_athlete_assignments.school_id = athlete_schools.school_id JOIN coach_athlete_assignments AS mine ON athlete_schools.athlete_id = mine.athlete_id AND athlete_schools.school_id = mine.school_id WHERE coach_athlete_assignments.coach_user_id = auth.user_id() AND mine.coach_user_id = auth.user_id() AND athlete_schools.ended_at IS NULL AND coach_athlete_assignments.school_id IN member_school_ids",
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

  // The enrollment and group coach queries bind the swimmer to the school of the assignment since issue 1132. The direct
  // ones stay limited to active schools through member_school_ids; the by-group ones start at training_groups.id IN
  // coach_group_ids, which already leaves out the deactivated memberships. They carry no school condition of their own:
  // next to those joins it splits the swimmer from the school again in PowerSync (#1260).
  const activeOnly = (query: string) =>
    /\bIN member_school_ids$|\b(training|coached)_groups\.id IN coach_group_ids\b/.test(query);
  const coachRows = visible.filter(
    (query) =>
      /FROM athlete_(schools|groups) /.test(query) && query.includes("coach_"),
  );
  expect(coachRows).toHaveLength(4);
  expect(coachRows.every(activeOnly)).toBe(true);
  // The fulfillment coach queries bind the swimmer to the assignment school since issue 1127 and stay limited to active schools.
  const coachMarks = marks.filter((query) => query.includes("coach_"));
  expect(coachMarks).toHaveLength(2);
  expect(coachMarks.every(activeOnly)).toBe(true);
  // No other query gives the coach sources an athlete's school or group rows without the school filter.
  const bound = visible.filter(
    (query) =>
      /^SELECT athlete_(schools|groups)\.\* FROM athlete_/.test(query) &&
      query.includes("coach_"),
  );
  expect(bound).toHaveLength(4);
  expect(bound.every(activeOnly)).toBe(true);
});
