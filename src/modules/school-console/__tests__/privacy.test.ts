/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import * as athletes from '../__fixtures__/athletes';
import esCO from '../i18n/es-CO.json';

// Product rule: the console shows full name, category, group, guardian and contact. Never ID numbers or birth dates.
// The check is on names: a field called like that has no place in the module's types, fixtures or copy.
const PRIVATE = /document|documento|birth|nacimiento|cedula|identification/i;
const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
const isPrivate = (text: string) => PRIVATE.test(plain(text));

const moduleDir = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// Every identifier (property, parameter, type, variable) and string literal of a TypeScript source.
export function namesIn(source: string, fileName = 'file.tsx'): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) names.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true));
  return names;
}

// Every key and every string value of a value, however deep.
function walk(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(walk);
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => [key, ...walk(item)]);
  return [];
}

describe('privacy of the school console', () => {
  it('finds a private field in a prop type and in a fixture (the check can fail)', () => {
    expect(namesIn('type Props = { birthDate: string };').filter(isPrivate)).toEqual(['birthDate']);
    expect(namesIn('const row = { documentNumber: "1" };').filter(isPrivate)).toEqual(['documentNumber']);
    expect(namesIn('const row = { cédula: "1" };').filter(isPrivate)).toEqual(['cédula']);
    expect(namesIn('const caption = "Documento: registrado";').filter(isPrivate)).toEqual(['Documento: registrado']);
    expect(namesIn('type Props = { fechaNacimiento: string };').filter(isPrivate)).toEqual(['fechaNacimiento']);
    expect(namesIn('type Props = { identificationNumber: string };').filter(isPrivate)).toEqual(['identificationNumber']);
    expect(namesIn('type Props = { name: string; category: string };').filter(isPrivate)).toEqual([]);
  });

  it('scans the components, screens, fixtures and gallery', () => {
    const files = sourceFiles(moduleDir).map((file) => path.relative(moduleDir, file));
    expect(files).toEqual(
      expect.arrayContaining(['components/AthleteDetail.tsx', 'screens/AthletesScreen.tsx', '__fixtures__/athletes.ts', 'gallery.tsx']),
    );
  });

  it('has no private field or text in the prop types, screens, components, fixtures or gallery', () => {
    const offenders = sourceFiles(moduleDir).flatMap((file) =>
      namesIn(fs.readFileSync(file, 'utf8'), file)
        .filter(isPrivate)
        .map((name) => `${path.relative(moduleDir, file)}: ${name}`),
    );

    expect(offenders).toEqual([]);
  });

  it('has no private field or value in the fixture data', () => {
    expect(walk(athletes).filter(isPrivate)).toEqual([]);
    expect(walk(athletes).length).toBeGreaterThan(40);
  });

  it('has no private word in the translations', () => {
    expect(walk(esCO).filter(isPrivate)).toEqual([]);
  });
});
