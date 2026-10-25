/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

const moduleDir = path.join(__dirname, '..');
// Third-party brand marks must stay unmodified, so their colors are the one allowed exception.
const marks = path.join('components', 'providerMarks.ts');

function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  });
}

describe('src/modules/accounts rules', () => {
  it('no source file outside providerMarks.ts contains a hexadecimal color literal', () => {
    const files = filesIn(moduleDir).filter((file) => /\.(ts|tsx|json)$/.test(file));
    expect(files.length).toBeGreaterThan(0);

    const offenders = files
      .filter((file) => path.relative(moduleDir, file) !== marks)
      .filter((file) => /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(fs.readFileSync(file, 'utf8')));
    expect(offenders.map((file) => path.relative(moduleDir, file))).toEqual([]);
  });
});
