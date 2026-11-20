/**
 * @jest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESLint } from 'eslint';

import eslintConfig from '../../../eslint.config';

// The real lint config, run against a throwaway project that mirrors the src/ layout.
// Targets must exist on disk: import/no-restricted-paths silently skips imports it cannot resolve.
const RULE = 'import/no-restricted-paths';
const MODULE_MSG = 'only through its index.ts';
const CORE_MSG = 'src/core must not import modules';

const files = [
  'src/modules/accounts/index.ts',
  'src/modules/accounts/screens/own.ts',
  'src/modules/timing/index.ts',
  'src/modules/timing/screens/x.ts',
  'src/core/theme/colors.ts',
  'src/core/cycle/a.ts',
  'src/core/cycle/b.ts',
];

let root: string;
let eslint: ESLint;
let cycleEslint: ESLint;
let cwd: jest.SpyInstance;

beforeAll(() => {
  // Real path: import resolution returns real paths, so a symlinked tmpdir would make the rule skip silently.
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'swimcro-boundaries-')));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'export const x = 1;\n');
  }
  // A real two-file loop: import/no-cycle reads the dependency graph from disk, so it needs files that exist.
  fs.writeFileSync(path.join(root, 'src/core/cycle/a.ts'), "import { b } from './b';\nexport const a = () => b;\n");
  fs.writeFileSync(path.join(root, 'src/core/cycle/b.ts'), "import { a } from './a';\nexport const b = () => a;\n");
  // The rule resolves its zones against process.cwd().
  cwd = jest.spyOn(process, 'cwd').mockReturnValue(root);
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    // import/no-cycle cannot lint a snippet that is not on disk, so the snippet cases turn it off and the cycle case below keeps it on.
    baseConfig: [...eslintConfig, { settings: { react: { version: '19' } } }, { rules: { 'import/no-cycle': 'off' as const } }],
  });
  cycleEslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    baseConfig: [...eslintConfig, { settings: { react: { version: '19' } } }],
  });
});

afterAll(() => {
  cwd.mockRestore();
  fs.rmSync(root, { recursive: true, force: true });
});

async function violations(file: string, importPath: string) {
  const code = `import { x } from '${importPath}';\nexport const y = x;\n`;
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return result.messages;
}

// Asserts the boundary rule itself reported, with the message of the specific boundary.
async function expectBoundaryViolation(file: string, importPath: string, message: string) {
  const messages = await violations(file, importPath);
  expect(messages).toHaveLength(1);
  expect(messages[0].ruleId).toBe(RULE);
  expect(messages[0].message).toContain(message);
}

describe('module boundaries', () => {
  describe('a module importing another module', () => {
    const from = 'src/modules/accounts/screens/a.ts';

    it('fails on its internals', async () => {
      await expectBoundaryViolation(from, '../../timing/screens/x', MODULE_MSG);
    });

    it('passes on its index.ts', async () => {
      expect(await violations(from, '../../timing')).toEqual([]);
      expect(await violations(from, '../../timing/index')).toEqual([]);
    });

    it('passes on its own internals', async () => {
      expect(await violations(from, './own')).toEqual([]);
      expect(await violations('src/modules/accounts/index.ts', './screens/own')).toEqual([]);
    });
  });

  describe('src/core importing a module', () => {
    const from = 'src/core/theme/a.ts';

    it.each(['../../modules/timing/screens/x', '../../modules/timing'])('fails on %s', async (p) => {
      await expectBoundaryViolation(from, p, CORE_MSG);
    });

    it('passes on other core files', async () => {
      expect(await violations(from, './colors')).toEqual([]);
    });
  });

  describe('src/app importing', () => {
    const from = 'src/app/a.ts';

    it('fails on a module internal', async () => {
      await expectBoundaryViolation(from, '../modules/timing/screens/x', MODULE_MSG);
    });

    it('passes on a module index.ts', async () => {
      expect(await violations(from, '../modules/timing')).toEqual([]);
    });

    it('passes on src/core', async () => {
      expect(await violations(from, '../core/theme/colors')).toEqual([]);
    });
  });

  describe('src/__tests__ importing', () => {
    const from = 'src/__tests__/a.test.ts';

    it('fails on a module internal', async () => {
      await expectBoundaryViolation(from, '../modules/timing/screens/x', MODULE_MSG);
    });

    it('passes on a module index.ts', async () => {
      expect(await violations(from, '../modules/timing')).toEqual([]);
    });

    it('passes on src/core', async () => {
      expect(await violations(from, '../core/theme/colors')).toEqual([]);
    });
  });

  describe('import cycles', () => {
    it('fails on a file that imports back the file that imports it', async () => {
      const [result] = await cycleEslint.lintFiles([path.join(root, 'src/core/cycle/a.ts')]);
      expect(result.messages.map((m) => m.ruleId)).toContain('import/no-cycle');
    });

    it('passes on a file without a loop', async () => {
      const [result] = await cycleEslint.lintFiles([path.join(root, 'src/core/theme/colors.ts')]);
      expect(result.messages.map((m) => m.ruleId)).not.toContain('import/no-cycle');
    });
  });
});
