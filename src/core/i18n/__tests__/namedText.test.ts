import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { i18n } from '..';
import { namedText, trimName } from '../namedText';

// Every module that uses `namedText` adds its source folder and its catalog here. The catalogs are read as files:
// `src/core` never imports a module, so the keys are checked in the module's own `i18n/es-CO.json`.
const modulesRoot = join(__dirname, '../../../modules');
const modules = [
  { folder: 'athletes', prefix: 'athletes' },
  { folder: 'training-plans', prefix: 'training_plans' },
];

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
    modules.flatMap(({ folder }) =>
      sourceFiles(join(modulesRoot, folder)).flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/\bnamedText\(\s*'([^']+)'/g)].map((match) => match[1]!),
      ),
    ),
  ),
];

const catalog = Object.fromEntries(
  modules.map(({ folder, prefix }) => [prefix, JSON.parse(readFileSync(join(modulesRoot, folder, 'i18n/es-CO.json'), 'utf8')) as unknown]),
);

const exists = (key: string) => typeof key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], catalog) === 'string';

describe('namedText keys', () => {
  it('finds the calls that exist today', () => {
    expect(calledKeys.sort()).toEqual([
      'athletes.import_prompt.imported',
      'athletes.import_prompt.question',
      'athletes.screen.denied.message',
      'athletes.screen.empty.message',
      'athletes.screen.offline.message',
      'training_plans.today.denied_message',
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
});

describe('namedText', () => {
  beforeAll(() => {
    i18n.addResourceBundle('es-CO', 'translation', { sample: { hello: 'Hola {{name}}', hello_no_name: 'Hola' } }, true, true);
  });

  it('is the only place that trims the name: it picks the text from the trimmed value', () => {
    expect(namedText('sample.hello', '  Lucía ')).toBe('Hola Lucía');
    expect(namedText('sample.hello', 'Lucía')).toBe('Hola Lucía');
    expect(namedText('sample.hello', '   ')).toBe('Hola');
  });

  it('fills the other placeholders in both texts', () => {
    i18n.addResourceBundle('es-CO', 'translation', { sample: { greet: '{{name}}, {{n}} marcas', greet_no_name: '{{n}} marcas' } }, true, true);

    expect(namedText('sample.greet', 'Lucía', { n: 3 })).toBe('Lucía, 3 marcas');
    expect(namedText('sample.greet', '', { n: 3 })).toBe('3 marcas');
  });
});
