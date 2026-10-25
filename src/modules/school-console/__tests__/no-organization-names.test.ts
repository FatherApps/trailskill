/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

// AGENTS.md: "Never write an organization, federation, league or country name in code."
// The school name and the sources arrive by props from data; fixtures and tests use fictional names.
// Deny-list: real names may never appear in app code, so this test must name them to find them.
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

function files(dir: string, skip: string[]): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return skip.includes(entry.name) ? [] : files(full, skip);
    return [full];
  });
}

const offendersIn = (list: string[]) =>
  list.flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    return forbidden.filter((word) => containsWord(text, word)).map((word) => `${path.relative(moduleDir, file)}: ${word}`);
  });

describe('school console', () => {
  it('names no real organization, federation, league or country in its code or copy', () => {
    const list = files(moduleDir, ['__tests__', '__fixtures__']);
    expect(list.length).toBeGreaterThan(10);
    expect(offendersIn(list)).toEqual([]);
  });

  it('names none in its fixtures either', () => {
    expect(offendersIn(files(path.join(moduleDir, '__fixtures__'), []))).toEqual([]);
  });
});
