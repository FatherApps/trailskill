/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

// AGENTS.md: "Never write an organization, federation, league or country name in code."
// Sources arrive by props from data; fixtures and tests use fictional names. The list is deliberately explicit.
const forbidden = ['fecna', 'liga', 'fina', 'world aquatics', 'world swimming', 'la academia', 'atlántico', 'colombia'];

const moduleDir = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['__tests__', '__fixtures__'].includes(entry.name) ? [] : sourceFiles(full);
    return [full];
  });
}

describe('athletes module code', () => {
  it('scans some files', () => {
    expect(sourceFiles(moduleDir).length).toBeGreaterThan(3);
  });

  it('names no real organization, federation, league or country', () => {
    const offenders = sourceFiles(moduleDir).flatMap((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return forbidden
        .filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(text))
        .map((word) => `${path.relative(moduleDir, file)}: ${word}`);
    });

    expect(offenders).toEqual([]);
  });
});
