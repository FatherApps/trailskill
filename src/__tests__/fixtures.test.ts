/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.join(__dirname, '..');

function filesIn(dir: string, inFixtures = false): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(full, inFixtures || entry.name === '__fixtures__');
    return inFixtures ? [full] : [];
  });
}

describe('gallery fixtures', () => {
  it('contain no hexadecimal color literal', () => {
    const files = filesIn(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) =>
      /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders.map((file) => path.relative(srcDir, file))).toEqual([]);
  });
});
