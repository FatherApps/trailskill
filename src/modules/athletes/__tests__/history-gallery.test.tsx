import { render, screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemeProvider, type ThemeName } from '../../../core/theme';
import { galleryEntries } from '..';
import { historyFixture } from '../__fixtures__/history';

const themes: ThemeName[] = ['light', 'dark'];
const scales = [1, 2];

const entryById = (id: string) => galleryEntries.find((entry) => entry.id === id)!;
const stateKeys = (id: string) => Object.keys(entryById(id).states);

const cases = galleryEntries.flatMap((entry) =>
  Object.keys(entry.states).flatMap((state) =>
    themes.flatMap((theme) => scales.map((scale) => [entry.id, state, theme, scale] as const)),
  ),
);

describe('athletes history gallery entries', () => {
  it('have unique ids', () => {
    const ids = galleryEntries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cover both components with all their states', () => {
    expect(stateKeys('historyList')).toEqual(['mixed', 'long-text']);
    expect(stateKeys('importPrompt')).toEqual(['not-imported', 'imported', 'no-source']);
  });

  it.each(cases)('%s / %s renders in %s theme at scale %s', async (id, state, theme, scale) => {
    await render(
      <ThemeProvider name={theme} fontScale={scale}>
        {entryById(id).states[state]()}
      </ThemeProvider>,
    );
  });

  it.each([
    ['historyList', 'mixed'],
    ['historyList', 'long-text'],
    ['importPrompt', 'not-imported'],
    ['importPrompt', 'imported'],
  ])('%s / %s fills the width of the preview', async (id, state) => {
    await render(<ThemeProvider>{entryById(id).states[state]()}</ThemeProvider>);

    const root = screen.toJSON() as unknown as { props: { style: StyleProp<ViewStyle> } };
    expect(StyleSheet.flatten(root.props.style)?.alignSelf).toBe('stretch');
  });

  it('importPrompt / no-source renders nothing', async () => {
    await render(<ThemeProvider>{entryById('importPrompt').states['no-source']()}</ThemeProvider>);

    expect(screen.toJSON()).toBeNull();
  });

  it('importPrompt / imported offers the refresh with a fictional source', async () => {
    await render(<ThemeProvider>{entryById('importPrompt').states.imported()}</ThemeProvider>);

    expect(screen.getByRole('button', { name: 'Actualizar desde FEDNAT' })).toBeOnTheScreen();
  });

  it('historyList / mixed shows an origin Tag from each kind of source', async () => {
    await render(<ThemeProvider>{entryById('historyList').states.mixed()}</ThemeProvider>);

    const hiddenText = (text: string) => screen.queryAllByText(text, { includeHiddenElements: true });
    expect(hiddenText(historyFixture.sourceName)).toHaveLength(1);
    expect(hiddenText('Botón externo')).toHaveLength(1);
    expect(hiddenText(`Otra escuela: ${historyFixture.otherSchool}`)).toHaveLength(1);
  });
});
