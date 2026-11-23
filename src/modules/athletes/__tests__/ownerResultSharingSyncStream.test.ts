import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The owner's choices of school (issue 1446, athlete_result_sharing) reach only the people who manage the swimmer, and only while the
// row is in force. A school never gets the table by any stream, and the marks themselves are read online, never synced.
const config = readFileSync(join(__dirname, '../../../../powersync/sync-config.yaml'), 'utf8');
const streamBlock = (name: string) =>
  (config.split(new RegExp(`\\n {2}${name}:\\n`))[1]?.split(/\n\s*\n/)[0] ?? '').split('\n').flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

test('athletes_result_sharing has one query: the rows in force of the swimmers the user manages', () => {
  expect(streamBlock('athletes_result_sharing')).toEqual([
    'SELECT * FROM athlete_result_sharing WHERE revoked_at IS NULL AND athlete_id IN managed_athlete_ids',
  ]);
});

test('no other stream reads athlete_result_sharing', () => {
  const queries = [...config.matchAll(/^\s+- (SELECT .+)$/gm)].map((match) => match[1]);
  expect(queries.filter((query) => query.includes('athlete_result_sharing'))).toHaveLength(1);
});

// supabase/tests/database/athletes/owner_result_sharing.test.sql runs a copy of this stream (pg_temp.stream_sharing) with the guardian,
// adult swimmer, staff and platform admin fixtures. The copy is only as good as the text it copies: when either text changes, update
// the pgTAP copy in the same change.
test('the managed_athlete_ids set the pgTAP copy of the stream reproduces is unchanged', () => {
  expect(config).toContain(
    '  managed_athlete_ids: SELECT athlete_id FROM athlete_managers WHERE (user_id = auth.user_id()) AND auth.user_id() IN (SELECT user_id FROM account_sync_access WHERE user_id = auth.user_id())\n',
  );
  const pgtap = readFileSync(join(__dirname, '../../../../supabase/tests/database/athletes/owner_result_sharing.test.sql'), 'utf8');
  expect(pgtap).toContain('pg_temp.stream_sharing');
});
