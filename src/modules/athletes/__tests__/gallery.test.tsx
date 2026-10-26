import { fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemeProvider, type ThemeName } from '../../../core/theme';
import { galleryEntries } from '../gallery';

const themes: ThemeName[] = ['light', 'dark'];
const scales = [1, 2];

const entryById = (id: string) => galleryEntries.find((entry) => entry.id === id)!;
const stateKeys = (id: string) => Object.keys(entryById(id).states);

const cases = galleryEntries.flatMap((entry) =>
  Object.keys(entry.states).flatMap((state) =>
    themes.flatMap((theme) => scales.map((scale) => [entry.id, state, theme, scale] as const)),
  ),
);

const moduleDir = path.join(__dirname, '..');
function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  });
}
const sourceFiles = filesIn(moduleDir).filter((file) => !file.includes('__tests__') && /\.(tsx?|json)$/.test(file));

describe('athletes gallery entries', () => {
  it('have unique ids and the expected states', () => {
    expect(galleryEntries.map((entry) => entry.id)).toEqual(['profileHeader', 'eventSelector', 'personalBest', 'historyList', 'importPrompt', 'athleteProfileScreen', 'myAthletesScreen']);
    expect(stateKeys('myAthletesScreen')).toEqual(['with-data', 'long-text', 'empty', 'loading']);
    expect(stateKeys('profileHeader')).toEqual(['one-school', 'several-schools', 'pending-authorization', 'long-text']);
    expect(stateKeys('eventSelector')).toEqual(['one-pool', 'two-pools']);
    expect(stateKeys('personalBest')).toEqual(['with-improvement', 'no-improvement', 'missing', 'training']);
    expect(stateKeys('historyList')).toEqual(['mixed', 'long-text']);
    expect(stateKeys('importPrompt')).toEqual(['not-imported', 'imported', 'no-source']);
    expect(stateKeys('athleteProfileScreen')).toEqual([
      'with-data',
      'loading',
      'empty',
      'error',
      'offline-with-data',
      'offline-no-data',
      'denied',
      'other-school-offline',
      'with-import-prompt',
    ]);
  });

  it.each(cases)('%s / %s renders in %s theme at scale %s', async (id, state, theme, scale) => {
    await render(<ThemeProvider name={theme} fontScale={scale}>{entryById(id).states[state]()}</ThemeProvider>);
  });

  // importPrompt / no-source renders nothing by design, so it has no root to measure.
  it.each(
    galleryEntries
      .flatMap((entry) => Object.keys(entry.states).map((state) => [entry.id, state]))
      .filter(([id, state]) => !(id === 'importPrompt' && state === 'no-source')),
  )(
    '%s / %s fills the width of the preview',
    async (id, state) => {
      await render(<ThemeProvider>{entryById(id).states[state]()}</ThemeProvider>);

      const root = screen.toJSON() as unknown as { props: { style: StyleProp<ViewStyle> } };
      expect(StyleSheet.flatten(root.props.style)?.alignSelf).toBe('stretch');
    },
  );

  it('profileHeader / several-schools changes the school when tapped', async () => {
    await render(<ThemeProvider>{entryById('profileHeader').states['several-schools']()}</ThemeProvider>);
    expect(screen.getByText('Infantil B · Escuela Delfines')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Club Acuático Norte' }));

    expect(screen.getByText('Infantil B · Club Acuático Norte')).toBeOnTheScreen();
  });

  it('eventSelector / two-pools keeps the selection', async () => {
    await render(<ThemeProvider>{entryById('eventSelector').states['two-pools']()}</ThemeProvider>);

    await fireEvent.press(screen.getByRole('radio', { name: 'Espalda' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina de 50 m' }));

    expect(screen.getByRole('radio', { name: 'Espalda' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Libre' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Piscina de 50 m' })).toBeChecked();
  });

  it('eventSelector / one-pool has no pool row', async () => {
    await render(<ThemeProvider>{entryById('eventSelector').states['one-pool']()}</ThemeProvider>);

    expect(screen.queryByLabelText('Piscina')).toBeNull();
  });

  it('personalBest / missing shows a dash and never 0,00', async () => {
    await render(<ThemeProvider>{entryById('personalBest').states.missing()}</ThemeProvider>);

    expect(screen.getByText('—', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText('0,00', { includeHiddenElements: true })).toBeNull();
  });

  it('athleteProfileScreen / with-data keeps the event selection while it is shown and starts fresh when mounted again', async () => {
    const { unmount } = await render(<ThemeProvider>{entryById('athleteProfileScreen').states['with-data']()}</ThemeProvider>);

    await fireEvent.press(screen.getByRole('radio', { name: 'Espalda' }));
    expect(screen.getByRole('radio', { name: 'Espalda' })).toBeChecked();

    await unmount();
    await render(<ThemeProvider>{entryById('athleteProfileScreen').states['with-data']()}</ThemeProvider>);
    expect(screen.getByRole('radio', { name: 'Libre' })).toBeChecked();
  });

  it('athleteProfileScreen / with-import-prompt shows the prompt and with-data does not', async () => {
    await render(<ThemeProvider>{entryById('athleteProfileScreen').states['with-import-prompt']()}</ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeOnTheScreen();

    await screen.unmount();
    await render(<ThemeProvider>{entryById('athleteProfileScreen').states['with-data']()}</ThemeProvider>);
    expect(screen.queryByRole('button', { name: 'Ahora no' })).toBeNull();
  });

  it('no module file contains a hexadecimal color, a line limit or a font-scaling opt-out', () => {
    const offenders = sourceFiles.filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return (
        /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(text) ||
        /numberOfLines|adjustsFontSizeToFit|allowFontScaling=\{false\}/.test(text)
      );
    });
    expect(offenders).toEqual([]);
  });

  it('only imports other modules and core through their public entry', () => {
    const offenders = sourceFiles
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => /from '(?:\.\.\/)+(?:core|modules)\/[^']*\/[^']+'/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
