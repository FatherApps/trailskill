// https://docs.expo.dev/guides/using-eslint/
const fs = require('node:fs');
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Module boundaries (ADR 0003). Every directory in src/modules is a module with a public index.ts.
// Alias imports are not covered: the resolver would have to know the alias first (none exists yet).
const modules = fs.readdirSync('src/modules', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const indexOnly = ['./index.ts'];
const otherModules = modules.flatMap((target) =>
  modules
    .filter((from) => from !== target)
    .map((from) => ({
      target: `./src/modules/${target}`,
      from: `./src/modules/${from}`,
      except: indexOnly,
      message: 'A module may use another module only through its index.ts.',
    })),
);

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'deploy/**'] },
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            ...otherModules,
            { target: './src/core', from: './src/modules', message: 'src/core must not import modules.' },
            ...modules.map((m) => ({
              target: './src/app',
              from: `./src/modules/${m}`,
              except: indexOnly,
              message: 'src/app may use a module only through its index.ts.',
            })),
          ],
        },
      ],
    },
  },
]);
