import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The stream must say what results_import_tournaments_select says (issue 1339): the catalog is public reference data for any signed-in
// user, so no user binding; it lists its columns (the interface of the app data layer) and keeps only the gate of a marked account.
const config = readFileSync(join(__dirname, '../../../../powersync/sync-config.yaml'), 'utf8');
const stream = config.split(/\n {2}results_import_tournaments:\n/)[1]?.split(/\n\s*\n/)[0] ?? '';
const queries = [...stream.matchAll(/^\s+- (SELECT .+)$/gm)].map((match) => match[1]);

test('the results_import_tournaments stream lists the catalog columns and is gated only for a marked account', () => {
  expect(queries).toEqual([
    'SELECT id, organization_id, year, date_key, name, city, discipline, course, source_url, refreshed_at FROM results_import_tournaments WHERE auth.user_id() IN (SELECT user_id FROM account_sync_access WHERE user_id = auth.user_id())',
  ]);
});

test('the stream is auto-subscribed so the catalog is there offline', () => {
  expect(stream).toContain('auto_subscribe: true');
});
