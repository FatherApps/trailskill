import { readFileSync } from "node:fs";
import { join } from "node:path";

// The athletes row of a swimmer has no school column: it is the same row in every school (#1127). So the athletes query
// of athletes_visible gives a coach the swimmer through any assignment in a school where the coach is active, exactly
// like athletes_select does through app.visible_athlete_ids(). The pgTAP test
// supabase/tests/database/athletes/coach_reads_athlete_rows.test.sql (pg_temp.stream_athlete_ids) holds a copy of this
// query: change both together.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const definition = (name: string) =>
  config.match(new RegExp(`^ {2}${name}: (.+)$`, "m"))?.[1];
const streamQueries =
  (config.split(/\n {2}athletes_visible:\n/)[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

test("the athletes query of athletes_visible reads the swimmer through every source of the coach and admin ids", () => {
  expect(streamQueries.filter((query) => /FROM athletes\b/.test(query))).toEqual([
    "SELECT * FROM athletes WHERE id IN managed_athlete_ids OR id IN coach_direct_athlete_ids OR id IN coach_group_athlete_ids OR id IN admin_athlete_ids",
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
