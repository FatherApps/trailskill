import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Birth date and gender of a swimmer (#1366) live in athlete_private_details and reach only the people who manage the swimmer.
// Coaches and school admins must never get the table by any stream, and athletes_visible (which they do get) must not carry them.
const config = readFileSync(join(__dirname, '../../../../powersync/sync-config.yaml'), 'utf8');
const streamBlock = (name: string) =>
  (config.split(new RegExp(`\\n {2}${name}:\\n`))[1]?.split(/\n\s*\n/)[0] ?? '').split('\n').flatMap((line) => line.match(/^\s+- (SELECT .+)$/)?.[1] ?? []);

test('athletes_private_details has one query, bound to the athletes the user manages', () => {
  expect(streamBlock('athletes_private_details')).toEqual(['SELECT * FROM athlete_private_details WHERE athlete_id IN managed_athlete_ids']);
});

test('no other stream reads athlete_private_details, and no query names the two columns', () => {
  const queries = [...config.matchAll(/^\s+- (SELECT .+)$/gm)].map((match) => match[1]);
  expect(queries.filter((query) => query.includes('athlete_private_details'))).toHaveLength(1);
  expect(queries.filter((query) => /\b(birth_date|gender)\b/.test(query))).toEqual([]);
});

test('athletes_visible keeps reading athletes whole, which is why the two columns are not on it', () => {
  expect(streamBlock('athletes_visible')[0]).toMatch(/^SELECT \* FROM athletes WHERE /);
});

// supabase/tests/database/athletes/private_details.test.sql runs a copy of this stream with the guardian, coach and admin fixtures
// (pg_temp.stream_details). The copy is only as good as the text it copies, so the two texts it reproduces are pinned here: when
// either changes, update the pgTAP copy in the same change.
test('the managed_athlete_ids set the pgTAP copy of the stream reproduces is unchanged', () => {
  expect(config).toContain(
    '  managed_athlete_ids: SELECT athlete_id FROM athlete_managers WHERE (user_id = auth.user_id()) AND auth.user_id() IN (SELECT user_id FROM account_sync_access WHERE user_id = auth.user_id())\n',
  );
  const pgtap = readFileSync(join(__dirname, '../../../../supabase/tests/database/athletes/private_details.test.sql'), 'utf8');
  expect(pgtap).toContain('pg_temp.stream_details');
});
