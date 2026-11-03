import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

// The names the app reads at build time; .env.example is the committed template with no values.
const publicVariables = [...read('.env.example').matchAll(/^(EXPO_PUBLIC_\w+)=/gm)].map((match) => match[1]);

describe('production build configuration', () => {
  const eas = JSON.parse(read('eas.json'));

  it('reads the EAS environment named production', () => {
    expect(eas.build.production.environment).toBe('production');
  });

  it('keeps every EXPO_PUBLIC_ variable out of eas.json', () => {
    expect(read('eas.json')).not.toContain('EXPO_PUBLIC_');
  });
});

describe('first internal testing release guide', () => {
  const guide = read('docs/RELEASING.md');
  const commands = guide.split('\n').filter((line) => line.startsWith('eas env:create'));

  it('knows the three variables the app reads', () => {
    expect(publicVariables).toHaveLength(3);
  });

  it('gives one eas env:create command per variable, for the production environment', () => {
    for (const name of publicVariables) {
      expect(commands.filter((line) => line.includes(`--name ${name} `))).toHaveLength(1);
    }
    for (const line of commands) {
      expect(line).toContain('--environment production');
    }
  });

  it('carries no value for any variable', () => {
    for (const line of commands) {
      expect(line).not.toContain('--value');
    }
  });
});
