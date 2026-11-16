import { readFileSync } from "node:fs";
import { join } from "node:path";

// The guardian queries of timing_measurements mirror the guardian branches of measurements_select (#1018). The pgTAP test
// supabase/tests/database/timing/guardian_sharing.test.sql (pg_temp.stream_ids) holds a copy of them: change both together.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const definition = (name: string) =>
  config.match(new RegExp(`^ {2}${name}: (.+)$`, "m"))?.[1];
const streamQueries =
  (config.split(/\n {2}timing_measurements:\n/)[1]?.split(/\n\s*\n/)[0] ?? "")
    .split("\n")
    .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

test("the guardian ids are the managed ones and the ones the user manages as themselves", () => {
  expect(definition("managed_athlete_ids")).toBe(
    "SELECT athlete_id FROM athlete_managers WHERE user_id = auth.user_id()",
  );
  expect(definition("self_athlete_ids")).toBe(
    "SELECT athlete_id FROM athlete_managers WHERE user_id = auth.user_id() AND relation = 'self'",
  );
});

test("the queries of timing_measurements that read by managed or self athletes are exactly the three guardian ones", () => {
  expect(
    streamQueries.filter((query) => /\b(managed|self)_athlete_ids\b/.test(query)),
  ).toEqual([
    "SELECT * FROM measurements WHERE athlete_id IN managed_athlete_ids AND guardian_visible = true",
    "SELECT * FROM measurements WHERE athlete_id IN managed_athlete_ids AND hidden = true",
    "SELECT * FROM measurements WHERE athlete_id IN self_athlete_ids",
  ]);
});

test("no line of the file, quoted or elsewhere, reads measurements by managed or self athletes except the guardian queries", () => {
  const guardian = [
    "SELECT * FROM measurements WHERE athlete_id IN managed_athlete_ids AND guardian_visible = true",
    "SELECT * FROM measurements WHERE athlete_id IN managed_athlete_ids AND hidden = true",
    "SELECT * FROM measurements WHERE athlete_id IN self_athlete_ids",
  ];
  const lines = config
    .split("\n")
    .filter((line) => /\b(managed|self)_athlete_ids\b/.test(line) && /FROM measurements\b/.test(line));

  expect(lines.map((line) => line.trim().replace(/^- /, ""))).toEqual(guardian);
});
