/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

// AGENTS.md: "Never write an organization, federation, league or country name in code."
// Federation category names come from data too. Deny-lists: this test must name the words to find them.
const organizations = ['fecna', 'liga', 'fina', 'world aquatics', 'world swimming', 'la academia', 'atlántico', 'colombia'];
const categories = ['preinfantil', 'pre-infantil', 'infantil', 'prejuvenil', 'juvenil', 'mayor', 'mayores', 'master', 'máster', 'senior'];

// Legitimate phrases that contain a category word (UI copy, comparisons); removed before matching.
const allowedPhrases = ['mayor de edad', 'mayor que'];

const root = path.join(__dirname, '..', '..');

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// Whole-word match, case- and accent-insensitive; any whitespace run separates the words of an entry.
// With plural, the entry also matches its Spanish or English plural (s or es).
// Allowed phrases are ignored.
function containsWord(text: string, entry: string, plural = false): boolean {
  const pattern = normalize(entry)
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const scrubbed = allowedPhrases.reduce((rest, phrase) => rest.replaceAll(phrase, ' '), normalize(text));
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}${plural ? '(?:e?s)?' : ''}(?![\\p{L}\\p{N}])`, 'u').test(scrubbed);
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
  ...walk(path.join(root, 'supabase', 'scripts'), false),
  path.join(root, 'supabase', 'seed.sql'),
  ...walk(path.join(root, 'powersync'), false),
];

const offenders = (list: string[], plural = false) =>
  scanned.flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    return list.filter((word) => containsWord(text, word, plural)).map((word) => `${path.relative(root, file)}: ${word}`);
  });

describe('containsWord', () => {
  it('detects the singular "mayor" but not the legitimate phrases that contain it', () => {
    expect(['Mayor', 'MAYOR', 'categoría mayor'].filter((text) => !containsWord(text, 'mayor'))).toEqual([]);
    expect(['Soy mayor de edad y nado', 'El tiempo debe ser mayor que cero.'].filter((text) => containsWord(text, 'mayor'))).toEqual([]);
    expect(containsWord('Mayor de edad, categoría Mayor', 'mayor')).toBe(true);
  });

  it('matches the plurals of a category but not other words that start with it', () => {
    const found = ['Juveniles', 'MASTERS', 'Prejuveniles', 'másters', 'infantiles', 'seniors'];
    expect(found.filter((text) => !categories.some((entry) => containsWord(text, entry, true)))).toEqual([]);
    expect(['juvenilia', 'masterful'].filter((text) => categories.some((entry) => containsWord(text, entry, true)))).toEqual([]);
    expect(containsWord('finas', 'fina')).toBe(false);
  });
});

describe('source code', () => {
  it('names no real organization, federation, league or country', () => {
    expect(scanned.length).toBeGreaterThan(50);
    expect(offenders(organizations)).toEqual([]);
  });

  it('names no federation category', () => {
    expect(scanned.length).toBeGreaterThan(50);
    expect(offenders(categories, true)).toEqual([]);
  });
});
