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

// Value imports and re-exports (type-only ones are erased), plus `require` calls not guarded by `__DEV__ ?`.
function bundledSpecifiers(source: string): string[] {
  const statements = [...source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+['"](\.[^'"]*)['"]/gm)];
  const requires = source
    .split('\n')
    .filter((line) => !line.includes('__DEV__ ?'))
    .flatMap((line) => [...line.matchAll(/\brequire\(\s*['"](\.[^'"]*)['"]\s*\)/g)]);
  return [...statements, ...requires].map((match) => match[1]);
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
