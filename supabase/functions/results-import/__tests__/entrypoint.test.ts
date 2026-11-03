import fs from 'node:fs';
import path from 'node:path';

// index.ts starts Deno.serve on import and cannot load under Jest, so the wiring is checked on its source.
const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

describe('results-import entry point', () => {
  it('registers the co-fecna adapter in the production registry', () => {
    expect(source).toMatch(/import \{ createCoFecna \} from '\.\/providers\/co-fecna\/index\.ts';/);
    expect(source).toMatch(/createProviderRegistry\(\[\s*createCoFecna\(\)\s*\]\)/);
  });
});
