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
