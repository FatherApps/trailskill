import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';

import { ThemeProvider, type ThemeName } from '../../../core/theme';
import { galleryEntries } from '../gallery';

// The gallery file is imported directly: the public entry also loads the ESM-only sync stack.
jest.mock('../../../core/sync', () => ({ db: {}, supabase: {} }));

const themes: ThemeName[] = ['light', 'dark'];
const cases = galleryEntries.flatMap((entry) => Object.keys(entry.states).flatMap((state) => themes.map((theme) => [entry.id, state, theme] as const)));

describe('results-import gallery entries', () => {
  it('have unique ids and every state of the panel', () => {
    expect(galleryEntries.map((entry) => entry.id)).toEqual(['officialUpdateButton', 'officialResultsScreen']);
    expect(Object.keys(galleryEntries[1]!.states)).toEqual([
      'list', 'long-text', 'imported', 'checking', 'none', 'unavailable', 'rate-limited', 'expired', 'import-failed', 'changes', 'change-failed',
    ]);
  });

  it.each(cases)('renders %s / %s in the %s theme', async (id, state, theme) => {
    const entry = galleryEntries.find((e) => e.id === id)!;
    await render(<ThemeProvider name={theme}>{entry.states[state]!()}</ThemeProvider>);
    expect(screen.toJSON()).not.toBeNull();
  });
});

function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? (entry.name === '__tests__' ? [] : filesIn(full)) : [full];
  });
}
const sourceFiles = filesIn(path.join(__dirname, '..')).filter((file) => /\.(tsx?|json)$/.test(file));

describe('results-import source', () => {
  it('uses theme tokens only: no color literals', () => {
    for (const file of sourceFiles.filter((f) => f.endsWith('.tsx'))) {
      expect({ file, hex: /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(fs.readFileSync(file, 'utf8')) }).toEqual({ file, hex: false });
    }
  });

  it('writes no organization, federation, league or country name', () => {
    // Deny-list: real names may never appear in app code, so this test must name them to find them.
    const forbidden = /\b(fecna|liga|fina|world aquatics|la academia|atl[aá]ntico|colombia)\b/i;
    for (const file of sourceFiles) {
      expect({ file, hit: forbidden.test(fs.readFileSync(file, 'utf8')) }).toEqual({ file, hit: false });
    }
  });
});
