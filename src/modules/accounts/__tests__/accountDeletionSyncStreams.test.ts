import { readFileSync } from "node:fs";
import { join } from "node:path";

// A user marked for deletion (issue 1244) syncs nothing. Sync Streams cannot say NOT IN (subquery), so every place where a query is
// bound to the user also requires the user's row in account_sync_access. A new query that forgets it fails here.
const config = readFileSync(
  join(__dirname, "../../../../powersync/sync-config.yaml"),
  "utf8",
);
const lines = config
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"));

const GATE = (column: string) =>
  ` AND ${column} IN (SELECT user_id FROM account_sync_access WHERE user_id = auth.user_id())`;
const BINDING = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?) = auth\.user_id\(\)/g;

describe("a marked account syncs nothing", () => {
  const bindings = lines.flatMap((line) =>
    [...line.matchAll(BINDING)].map((match) => ({
      line,
      column: match[1],
      end: (match.index ?? 0) + match[0].length,
    })),
  );

  test("the config binds queries to the user in many places", () => {
    expect(bindings.length).toBeGreaterThan(40);
  });

  test.each(bindings.map((binding) => [binding.column, binding]))(
    "the binding of %s is gated by account_sync_access",
    (_column, binding) => {
      const { line, column, end } = binding as (typeof bindings)[number];
      // The gate itself ends in `user_id = auth.user_id()`: that binding is the gate's own.
      if (line.slice(0, end).endsWith("WHERE user_id = auth.user_id()")) {
        const start = line.lastIndexOf(
          "IN (SELECT user_id FROM account_sync_access WHERE",
          end,
        );
        if (
          start >= 0 &&
          line.slice(start, end).includes("account_sync_access")
        )
          return;
      }
      expect(line.slice(end).startsWith(GATE(column))).toBe(true);
    },
  );

  test("the public texts are gated too", () => {
    expect(config).toContain(
      "SELECT * FROM authorization_texts WHERE auth.user_id() IN (SELECT user_id FROM account_sync_access WHERE user_id = auth.user_id())",
    );
  });

  test("no query relies on a NOT IN subquery, which Sync Streams do not support", () => {
    expect(lines.join("\n")).not.toMatch(/NOT IN \(\s*SELECT/i);
  });
});
