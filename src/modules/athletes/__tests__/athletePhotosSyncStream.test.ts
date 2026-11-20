import { readFileSync } from "node:fs";
import { join } from "node:path";

// The athletes_photos stream (issue #1221) gives the row of an athlete's photo to whoever can see the athlete, only
// while show_photo is in force: the condition of the athlete_photos_select policy
// (supabase/migrations/20261119150500_athletes_photos.sql). When show_photo is withdrawn the row leaves the devices.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);

const withSets = new Map(
  [...config.matchAll(/^ {2}([a-z_]+): (SELECT .+)$/gm)].map((m) => [m[1], m[2]]),
);
const streamQueries = (
  config.split(/\n {2}athletes_photos:\n/)[1]?.split(/\n\s*\n/)[0] ?? ""
)
  .split("\n")
  .flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

const SOURCES = [
  ["managed", "managed_athlete_ids"],
  ["coach_direct", "coach_direct_athlete_ids"],
  ["coach_group", "coach_group_athlete_ids"],
  ["admin", "admin_athlete_ids"],
] as const;

test("the stream has one query per way of seeing the athlete, each through a show_photo set", () => {
  expect(streamQueries).toEqual(
    SOURCES.map(
      ([name]) => `SELECT * FROM athlete_photos WHERE athlete_id IN photo_${name}_athlete_ids`,
    ),
  );
});

test("each photo set is its visibility set restricted to athletes with show_photo in force", () => {
  for (const [name, visibility] of SOURCES) {
    const base = withSets.get(visibility);
    expect(base).toBeDefined();
    expect(withSets.get(`photo_${name}_athlete_ids`)).toBe(
      `SELECT athlete_id FROM authorization_status WHERE purpose = 'show_photo' AND is_granted = true AND athlete_id IN (${base})`,
    );
  }
});

test("no athlete_photos row reaches a device through a set that ignores show_photo", () => {
  const visibilitySets = SOURCES.map(([, visibility]) => visibility);
  const configQueries = [...config.matchAll(/^\s+- (SELECT .+)$/gm)].map((m) => m[1]);
  const photoQueries = configQueries.filter((query) => /FROM athlete_photos\b/.test(query));
  expect(photoQueries).toHaveLength(SOURCES.length);
  for (const query of photoQueries) {
    for (const visibility of visibilitySets) {
      expect(query).not.toContain(`IN ${visibility}`);
    }
  }
});
