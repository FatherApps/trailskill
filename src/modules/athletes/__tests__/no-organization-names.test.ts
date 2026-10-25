/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

// AGENTS.md: "Never write an organization, federation, league or country name in code."
// Sources arrive by props from data; fixtures and tests use fictional names. The list is deliberately explicit.
// Deny-list: real organization and place names may never appear in app code, so this test must name them to find them.
const forbidden = ['fecna', 'liga', 'fina', 'world aquatics', 'world swimming', 'la academia', 'atlántico', 'colombia'];

const moduleDir = path.join(__dirname, '..');

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// Whole-word match, case- and accent-insensitive; any whitespace run separates the words of an entry.
function containsWord(text: string, entry: string): boolean {
  const pattern = normalize(entry)
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'u').test(normalize(text));
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['__tests__', '__fixtures__'].includes(entry.name) ? [] : sourceFiles(full);
    return [full];
  });
}

describe('containsWord', () => {
  it('matches case- and accent-insensitively', () => {
    expect(containsWord('Liga Atlántico', 'liga')).toBe(true);
    expect(containsWord('Liga Atlántico', 'atlántico')).toBe(true);
    expect(containsWord('LIGA atlantico', 'liga')).toBe(true);
    expect(containsWord('LIGA atlantico', 'atlántico')).toBe(true);
  });

  it('matches whole words only', () => {
    expect(containsWord('final', 'fina')).toBe(false);
    expect(containsWord('definir', 'fina')).toBe(false);
    expect(containsWord('ligado', 'liga')).toBe(false);
    expect(containsWord('colombiano', 'colombia')).toBe(false);
  });

  it('matches multi-word entries across any whitespace run', () => {
    expect(containsWord('world   aquatics', 'world aquatics')).toBe(true);
  });
});

describe('athletes module code', () => {
  it('scans some files', () => {
    expect(sourceFiles(moduleDir).length).toBeGreaterThan(3);
  });

  it('names no real organization, federation, league or country', () => {
    const offenders = sourceFiles(moduleDir).flatMap((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return forbidden
        .filter((word) => containsWord(text, word))
        .map((word) => `${path.relative(moduleDir, file)}: ${word}`);
    });

    expect(offenders).toEqual([]);
  });
});
