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

const expoRouterOnly = { name: 'expo-router', importNames: ['router'], message: "Use the useRouter() hook instead of the module-level 'router' from expo-router." };
const noBackHandler = { name: 'react-native', importNames: ['BackHandler'], message: 'Use useHardwareBack from src/core/ui instead of importing BackHandler.' };

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'deploy/**'] },
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      // The module-level router is unbound after Android recreates the Activity (expo/expo#51859) and the next call crashes release builds.
      'no-restricted-imports': [
        'error',
        { paths: [expoRouterOnly, noBackHandler] },
      ],
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
  {
    // The hook owns BackHandler; tests spy on it to press the back button by hand.
    files: ['src/core/ui/useHardwareBack.ts', 'src/**/__tests__/**'],
    rules: { 'no-restricted-imports': ['error', { paths: [expoRouterOnly] }] },
  },
]);
