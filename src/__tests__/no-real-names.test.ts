/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

// AGENTS.md: "Never write an organization, federation, league or country name in code."
// Federation category names come from data too. Deny-lists: this test must name the words to find them.
const organizations = ['fecna', 'liga', 'fina', 'world aquatics', 'world swimming', 'la academia', 'atlántico', 'colombia'];
const categories = ['preinfantil', 'pre-infantil', 'infantil', 'prejuvenil', 'juvenil', 'mayores', 'master', 'máster', 'senior'];

const root = path.join(__dirname, '..', '..');

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

function walk(dir: string, skipTests: boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return skipTests && ['__tests__', '__fixtures__'].includes(entry.name) ? [] : walk(full, skipTests);
    }
    return skipTests && /\.test\./.test(entry.name) ? [] : [full];
  });
}

const scanned = [
  ...walk(path.join(root, 'src'), true),
  ...walk(path.join(root, 'supabase', 'migrations'), false),
  ...walk(path.join(root, 'powersync'), false),
];

const offenders = (list: string[]) =>
  scanned.flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    return list.filter((word) => containsWord(text, word)).map((word) => `${path.relative(root, file)}: ${word}`);
  });

describe('source code', () => {
  it('names no real organization, federation, league or country', () => {
    expect(scanned.length).toBeGreaterThan(50);
    expect(offenders(organizations)).toEqual([]);
  });

  it('names no federation category', () => {
    expect(scanned.length).toBeGreaterThan(50);
    expect(offenders(categories)).toEqual([]);
  });
});
