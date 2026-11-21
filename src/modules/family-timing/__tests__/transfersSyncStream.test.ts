import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The stream must say what family_timing_transfers_select says (issue #1014): the sender stops syncing a request once it
// is accepted, the receiving athlete's family keeps it.
test('the family_timing_transfers stream drops an accepted request from the sender', () => {
  // The streams also require the user's row in account_sync_access (a marked account syncs nothing, issue 1244); this test pins the rest (the gate ends the top-level WHERE).
const config = readFileSync(join(__dirname, '../../../../powersync/sync-config.yaml'), 'utf8').replaceAll(/ WHERE \((.*)\) AND auth\.user_id\(\) IN \(SELECT user_id FROM account_sync_access WHERE user_id = auth\.user_id\(\)\)$/gm, ' WHERE $1');
  const stream = config.split(/\n {2}family_timing_transfers:\n/)[1]?.split(/\n\s*\n/)[0] ?? '';
  const queries = [...stream.matchAll(/^\s+- (SELECT .+)$/gm)].map((match) => match[1]);

  expect(queries).toEqual([
    "SELECT * FROM family_timing_transfers WHERE (from_user_id = auth.user_id() AND status <> 'accepted') OR athlete_id IN managed_athlete_ids",
  ]);
});
