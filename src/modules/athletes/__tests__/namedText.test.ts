import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { t } from '../../../core/i18n';
import { namedText, trimName } from '../components/namedText';
import '../i18n';

// The athletes module only: another module that uses `namedText` brings its own catalog and extends this scan.
const srcRoot = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === '__fixtures__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

// shortcut: finds only calls whose first argument is a string literal; a computed key escapes this test, so add a lint rule if one ever appears.
const calledKeys = [
  ...new Set(
    sourceFiles(srcRoot).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\bnamedText\(\s*'([^']+)'/g)].map((match) => match[1]!),
    ),
  ),
];

const exists = (key: string) => t(key) !== key;

describe('namedText keys', () => {
  it('finds the calls that exist today', () => {
    expect(calledKeys.sort()).toEqual([
      'athletes.import_prompt.imported',
      'athletes.import_prompt.question',
      'athletes.screen.denied.message',
      'athletes.screen.empty.message',
      'athletes.screen.offline.message',
    ]);
  });

  it.each(calledKeys)('%s has its text and its _no_name sibling', (key) => {
    expect(exists(key)).toBe(true);
    expect(exists(`${key}_no_name`)).toBe(true);
  });
});

describe('trimName', () => {
  it('trims the name and leaves a blank one empty', () => {
    expect(trimName('  Lucía ')).toBe('Lucía');
    expect(trimName('   ')).toBe('');
  });

  it('is the only place that trims the name: namedText picks the text from the trimmed value', () => {
    expect(namedText('athletes.screen.empty.message', '  Lucía ')).toBe(namedText('athletes.screen.empty.message', 'Lucía'));
    expect(namedText('athletes.screen.empty.message', '   ')).toBe(t('athletes.screen.empty.message_no_name'));
  });
});
