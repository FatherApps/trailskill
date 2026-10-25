/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

// Each table belongs to one module; school-console reads the others only through their index.ts.
const FOREIGN_TABLES = [
  'athletes',
  'athlete_schools',
  'athlete_groups',
  'athlete_managers',
  'authorization_status',
  'authorizations',
  'authorization_texts',
  'measurements',
  'timing_series',
  'record_conflicts',
];
const FOREIGN_SQL = new RegExp(`\\b(?:from|join)\\s+(?:${FOREIGN_TABLES.join('|')})\\b`, 'i');

// shortcut: issue 239 sets athlete_schools.category_id from school-console; move it behind the athletes index, then drop this exception.
const KNOWN_EXCEPTIONS: Record<string, string[]> = { 'data/categories.ts': ['athlete_schools'] };

export const mentionsForeignTable = (source: string) => FOREIGN_SQL.test(source);

const moduleDir = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('school-console table ownership', () => {
  it('matches a foreign table after FROM or JOIN and ignores its own tables', () => {
    expect(mentionsForeignTable('SELECT 1 FROM athlete_schools WHERE x = 1')).toBe(true);
    expect(mentionsForeignTable('select 1 from\n  measurements m join Athletes a')).toBe(true);
    expect(mentionsForeignTable('SELECT 1 FROM categories')).toBe(false);
    expect(mentionsForeignTable('SELECT 1 FROM athletes_view_of_nothing')).toBe(false);
  });

  it.each(sourceFiles(moduleDir).map((file) => [path.relative(moduleDir, file), file]))(
    '%s reads no table owned by another module',
    (_name, file) => {
      let source = fs.readFileSync(file!, 'utf8');
      for (const table of KNOWN_EXCEPTIONS[_name!.replaceAll(path.sep, '/')] ?? []) {
        source = source.replace(new RegExp(`\\b(from|join)\\s+${table}\\b`, 'gi'), '');
      }
      expect(mentionsForeignTable(source)).toBe(false);
    },
  );

  it('keeps the known exception to one file and one table', () => {
    expect(KNOWN_EXCEPTIONS).toEqual({ 'data/categories.ts': ['athlete_schools'] });
  });
});
