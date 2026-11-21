import { readFileSync } from "node:fs";
import { join } from "node:path";

// A user marked for deletion (issue 1244) syncs nothing. Sync Streams cannot say NOT IN (subquery), so every query and every WITH
// set bound to the user (it contains auth.user_id()) ends with a gate that needs the user's row in account_sync_access. The gate
// is one condition of its own at the end of the top-level WHERE, never inside a join or a subquery: PowerSync 1.21 builds the
// buckets of a join from separate lookups, and a condition added inside would change how they combine. A new query that forgets
// the gate fails here; powersync/scripts/verify-ended-link-streams.mjs checks the behavior against a real PowerSync.
const GATE =
  "auth.user_id() IN (SELECT user_id FROM account_sync_access WHERE user_id = auth.user_id())";
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const bound = config
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .filter((line) => /^\s+(- |[a-z_]+: )SELECT /.test(line))
  .filter((line) => line.includes("auth.user_id()"));

describe("a marked account syncs nothing", () => {
  test("the config binds queries to the user in many places", () => {
    expect(bound.length).toBeGreaterThan(40);
  });

  test.each(bound.map((line) => [line.trim().slice(0, 70), line]))(
    "%s ends with the gate of account_sync_access",
    (_label, line) => {
      expect(line.endsWith(` AND ${GATE}`) || line.endsWith(` WHERE ${GATE}`)).toBe(true);
      // One gate, at the end: no gate inside a join or a subquery.
      expect(line.split("account_sync_access").length - 1).toBe(1);
    },
  );

  test("the public texts are gated too", () => {
    expect(config).toContain(`SELECT * FROM authorization_texts WHERE ${GATE}`);
  });

  test("no query relies on a NOT IN subquery, which Sync Streams do not support", () => {
    expect(config).not.toMatch(/NOT IN \(\s*SELECT/i);
  });
});
