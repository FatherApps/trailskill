/**
 * @jest-environment node
 */
import fs from 'node:fs';
import path from 'node:path';

// The timing domain stays pure: only its own files and src/core/time.
const domainDir = path.join(__dirname, '../domain');
const allowed = (specifier: string) => specifier.startsWith('./') || specifier === '../../../core/time';

describe('timing domain imports', () => {
  const files = fs.readdirSync(domainDir).filter((f) => f.endsWith('.ts'));

  it('has domain files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s imports nothing from React, sync or other modules', (file) => {
    const source = fs.readFileSync(path.join(domainDir, file), 'utf8');
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specifiers.filter((s) => !allowed(s))).toEqual([]);
  });
});
