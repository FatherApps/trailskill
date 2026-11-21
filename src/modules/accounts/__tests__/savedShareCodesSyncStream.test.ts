import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The streams must say what saved_athlete_share_codes_select says (issues 1302, 1320): each user reads their own kept codes, and the
// swimmer behind a code never reaches the phone. Old builds keep the stream they know, without the codes the family changed.
function queriesOf(name: string): string[] {
  const config = readFileSync(join(__dirname, '../../../../powersync/sync-config.yaml'), 'utf8').replaceAll(
    / WHERE \((.*)\) AND auth\.user_id\(\) IN \(SELECT user_id FROM account_sync_access WHERE user_id = auth\.user_id\(\)\)$/gm,
    ' WHERE $1',
  );
  const stream = config.split(new RegExp(`\\n {2}${name}:\\n`))[1]?.split(/\n\s*\n/)[0] ?? '';
  return [...stream.matchAll(/^\s+- (SELECT .+)$/gm)].map((match) => match[1]);
}

test('the accounts_saved_share_codes stream gives each user their own current codes, without the swimmer or the expired ones', () => {
  expect(queriesOf('accounts_saved_share_codes')).toEqual([
    'SELECT id, user_id, code, athlete_short_name, saved_at FROM saved_athlete_share_codes WHERE user_id = auth.user_id() AND expired_at IS NULL',
  ]);
});

// Every client takes the auto-subscribed streams, so without the connection parameter (no build sends it yet, issue 1321) the stream gives no row.
test('the accounts_saved_share_codes_expired stream gives each user only their own expired codes, with when they expired, and none to a build that does not send the parameter', () => {
  expect(queriesOf('accounts_saved_share_codes_expired')).toEqual([
    "SELECT id, user_id, code, athlete_short_name, saved_at, expired_at FROM saved_athlete_share_codes WHERE user_id = auth.user_id() AND expired_at IS NOT NULL AND connection.parameter('expired_saved_share_codes') = 1",
  ]);
});
