import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The streams must say what the select policies say (issue #1031): a coach deactivated in a school gets no row of
// that school on the device. The own membership row still syncs.
const config = readFileSync(join(__dirname, '../../../../powersync/sync-config.yaml'), 'utf8');
const definition = (name: string) => config.match(new RegExp(`^ {2}${name}: (.+)$`, 'm'))?.[1] ?? '';

test.each([
  'member_school_ids',
  'own_series_ids',
  'coach_direct_athlete_ids',
  'coach_group_athlete_ids',
  'coach_group_ids',
  'coach_direct_group_ids',
  'coach_direct_category_ids',
  'coach_group_category_ids',
])('%s leaves out the deactivated memberships', (name) => {
  expect(definition(name)).toContain('deactivated_at IS NULL');
});

test('school_console_staff filters the coach assignments and keeps the own membership', () => {
  const stream = config.split(/\n {2}school_console_staff:\n/)[1]?.split(/\n\s*\n/)[0] ?? '';

  expect(stream).toContain('SELECT * FROM school_memberships WHERE user_id = auth.user_id() OR school_id IN admin_school_ids');
  expect(stream).toContain('SELECT * FROM coach_group_assignments WHERE coach_user_id = auth.user_id() AND group_id IN coach_group_ids');
  expect(stream).toContain('SELECT * FROM coach_athlete_assignments WHERE coach_user_id = auth.user_id() AND school_id IN member_school_ids');
});
