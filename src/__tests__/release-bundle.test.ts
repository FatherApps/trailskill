/** @jest-environment node */
// #1040: Metro folds `__DEV__` before collecting dependencies, so only a `require` behind `__DEV__ ?` keeps the gallery and its fixtures out of release bundles.
import fs from 'node:fs';
import path from 'node:path';

import { galleryEntries as accounts } from '../modules/accounts';
import { galleryEntries as athletes } from '../modules/athletes';
import { galleryEntries as resultsImport } from '../modules/results-import';
import { galleryEntries as schoolConsole } from '../modules/school-console';
import { galleryEntries as timing } from '../modules/timing';
import { galleryEntries as trainingPlans } from '../modules/training-plans';
import { galleryEntries as core } from '../core/ui';

// The timing module index pulls in its PowerSync repository, which needs the native database.
jest.mock('../core/sync', () => jest.requireActual('../core/sync/syncState'));
jest.mock('@powersync/react', () => ({}));
jest.mock('../core/sync/db', () => ({ db: {} }));

const srcDir = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'testing' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const isDevOnly = (file: string) =>
  file.split(path.sep).includes('__fixtures__') || /^gallery\w*\.tsx?$/.test(path.basename(file));

function resolveSpecifier(from: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(from), specifier);
  return ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
    .map((suffix) => base + suffix)
    .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

// Value imports and re-exports (type-only ones are erased), side-effect imports, and `require`/`import()` calls
// unless they come after `__DEV__ ?` on the same line. `typeof import(...)` is a type and is erased.
function bundledSpecifiers(source: string): string[] {
  const statements = [
    ...source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+['"](\.[^'"]*)['"]/gm),
    ...source.matchAll(/^import\s+['"](\.[^'"]*)['"]/gm),
  ];
  const calls = source.split('\n').flatMap((line) =>
    [...line.matchAll(/(?<!typeof\s+)\b(?:require|import)\s*\(\s*['"](\.[^'"]*)['"]\s*\)/g)]
      .filter((match) => !line.slice(0, match.index).includes('__DEV__ ?')),
  );
  return [...statements, ...calls].map((match) => match[1]);
}

describe('release bundle', () => {
  const files = sourceFiles(srcDir);

  it('finds the gallery and its fixtures', () => {
    const rel = files.map((file) => path.relative(srcDir, file));
    expect(rel).toContain(path.join('core', 'ui', 'gallery.tsx'));
    expect(rel.some((file) => file.split(path.sep).includes('__fixtures__'))).toBe(true);
  });

  it('never imports the gallery or its fixtures outside a __DEV__ guard', () => {
    const leaks = files
      .filter((file) => !isDevOnly(file))
      .flatMap((file) =>
        bundledSpecifiers(fs.readFileSync(file, 'utf8')).flatMap((specifier) => {
          const target = resolveSpecifier(file, specifier);
          return target && isDevOnly(target)
            ? [`${path.relative(srcDir, file)} -> ${path.relative(srcDir, target)}`]
            : [];
        }),
      );
    expect(leaks).toEqual([]);
  });

  it('still exposes every gallery in development', () => {
    expect(__DEV__).toBe(true);
    for (const entries of [core, accounts, athletes, resultsImport, schoolConsole, timing, trainingPlans]) {
      expect(entries.length).toBeGreaterThan(0);
    }
  });
});

describe('bundledSpecifiers', () => {
  it.each([
    ["import './gallery';"],
    ["import { a } from './gallery';"],
    ["import {\n  a,\n} from './gallery';"],
    ["export { a } from './gallery';"],
    ["const g = require('./gallery');"],
    ["const g = import('./gallery');"],
    ["require('./gallery'); const a = __DEV__ ? 1 : 2;"],
  ])('catches %s', (code) => {
    expect(bundledSpecifiers(code)).toEqual(['./gallery']);
  });

  it.each([
    ["import type { X } from './gallery';"],
    ["export type { X } from './gallery';"],
    ["const g: typeof import('./gallery') = x;"],
    ["export const galleryEntries: GalleryEntry[] = __DEV__ ? (require('./gallery') as typeof import('./gallery')).galleryEntries : [];"],
    ["const g = __DEV__ ? import('./gallery') : null;"],
  ])('ignores %s', (code) => {
    expect(bundledSpecifiers(code)).toEqual([]);
  });
});
