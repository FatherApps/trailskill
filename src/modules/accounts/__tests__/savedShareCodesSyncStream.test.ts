import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The stream must say what saved_athlete_share_codes_select says (issue 1302): each user reads their own kept codes, and the swimmer
// behind a code never reaches the phone.
test('the accounts_saved_share_codes stream gives each user their own codes, without the swimmer', () => {
  const config = readFileSync(join(__dirname, '../../../../powersync/sync-config.yaml'), 'utf8').replaceAll(
    / AND [\w.]+ IN \(SELECT user_id FROM account_sync_access WHERE user_id = auth\.user_id\(\)\)/g,
    '',
  );
  const stream = config.split(/\n {2}accounts_saved_share_codes:\n/)[1]?.split(/\n\s*\n/)[0] ?? '';
  const queries = [...stream.matchAll(/^\s+- (SELECT .+)$/gm)].map((match) => match[1]);
  expect(queries).toEqual(['SELECT id, user_id, code, athlete_short_name, saved_at FROM saved_athlete_share_codes WHERE user_id = auth.user_id()']);
});
