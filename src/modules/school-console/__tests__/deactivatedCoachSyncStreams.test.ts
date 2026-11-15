import { readFileSync } from "node:fs";
import { join } from "node:path";

// The streams must say what the select policies say (issue #1031): a coach deactivated in a school gets no row of
// that school on the device. The own membership row still syncs.
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
  "coach_direct_category_ids",
  "coach_group_category_ids",
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

// A multi-school athlete: the coach reads the athlete's school, group and mark rows only for the schools where the
// coach is active (athlete_schools_select, athlete_groups_select, training_plan_fulfillments_select).
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

  for (const source of [
    "coach_direct_athlete_ids",
    "coach_group_athlete_ids",
  ]) {
    expect(visible).toContain(
      `SELECT * FROM athlete_schools WHERE athlete_id IN ${source} AND school_id IN member_school_ids`,
    );
    expect(visible).toContain(
      `SELECT * FROM athlete_groups WHERE athlete_id IN ${source} AND group_id IN member_group_ids`,
    );
    expect(marks).toContain(
      `SELECT * FROM training_plan_fulfillments WHERE athlete_id IN ${source} AND hidden = false AND assignment_id IN (SELECT id FROM training_plan_assignments WHERE school_id IN member_school_ids)`,
    );
  }
  // No query gives the coach sources an athlete's school or group rows without the school filter.
  expect(
    visible
      .filter(
        (query) =>
          /^SELECT \* FROM athlete_(schools|groups) /.test(query) &&
          query.includes("coach_"),
      )
      .every((query) =>
        /AND (school|group)_id IN member_(school|group)_ids$/.test(query),
      ),
  ).toBe(true);
});
