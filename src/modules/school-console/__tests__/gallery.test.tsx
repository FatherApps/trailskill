import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { Dimensions, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemeProvider, type ThemeName } from '../../../core/theme';
import { galleryEntries } from '../gallery';

// The in-memory repository lives next to the PowerSync one, which loads the native database module.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const themes: ThemeName[] = ['light', 'dark'];
const scales = [1, 2];

// The four section screens show the same ten states as the athletes screen, minus the detail-only ones.
const sectionScreens = ['coachesScreen', 'recordsScreen', 'measurementsScreen', 'authorizationsScreen'];
const sectionScreenStates = [
  'with-data',
  'loading',
  'empty',
  'error',
  'offline-with-data',
  'offline-no-data',
  'denied',
  'expanded-1280',
  'medium-800',
  'compact-360',
];

const entryById = (id: string) => galleryEntries.find((entry) => entry.id === id)!;
const stateKeys = (id: string) => Object.keys(entryById(id).states);
const state = (id: string, key: string) => entryById(id).states[key]();

const cases = galleryEntries.flatMap((entry) =>
  Object.keys(entry.states).flatMap((key) => themes.flatMap((theme) => scales.map((scale) => [entry.id, key, theme, scale] as const))),
);

const moduleDir = path.join(__dirname, '..');
function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  });
}
const sourceFiles = filesIn(moduleDir).filter((file) => !file.includes('__tests__') && /\.(tsx?|json)$/.test(file));

// The preview reports its measured width the way the device does.
const measure = (width: number) =>
  act(() => fireEvent(screen.getByTestId('console-preview'), 'layout', { nativeEvent: { layout: { width, height: 800, x: 0, y: 0 } } }));

const layoutShown = () =>
  (['expanded', 'medium', 'compact'] as const).find((layout) =>
    screen.queryByTestId(`console-layout-${layout}`, { includeHiddenElements: true }),
  );

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('school console gallery entries', () => {
  it('have unique ids and the expected states', () => {
    expect(galleryEntries.map((entry) => entry.id)).toEqual([
      'consoleNav',
      'sideSheet',
      'athleteIndicators',
      'athleteFilters',
      'athleteTable',
      'athleteDetail',
      'athletesScreen',
      'categoriesScreen',
      'consoleScreen',
      'coachList',
      'coachesScreen',
      'recordTable',
      'recordsScreen',
      'measurementLog',
      'measurementsScreen',
      'authorizationList',
      'authorizationsScreen',
    ]);
    expect(stateKeys('consoleNav')).toEqual(['side', 'top']);
    expect(stateKeys('sideSheet')).toEqual(['open']);
    expect(stateKeys('athleteIndicators')).toEqual(['default', 'large-numbers']);
    expect(stateKeys('athleteFilters')).toEqual(['empty', 'with-filter', 'all-filters']);
    expect(stateKeys('athleteTable')).toEqual(['default', 'selected', 'long-text', 'compact']);
    expect(stateKeys('athleteDetail')).toEqual(['default', 'pending-no-bests', 'category-selector', 'long-text']);
    expect(stateKeys('athletesScreen')).toEqual([
      'with-data',
      'loading',
      'empty',
      'error',
      'offline-with-data',
      'offline-no-data',
      'denied',
      'expanded-1280',
      'medium-800',
      'compact-360',
      'filter-sheet',
      'filter-sheet-coach',
      'no-match',
      'sin-dato',
    ]);
    expect(stateKeys('coachList')).toEqual(['default', 'long-text']);
    expect(stateKeys('recordTable')).toEqual(['default', 'other-pool', 'long-text', 'compact', 'pool-empty']);
    expect(stateKeys('measurementLog')).toEqual(['default', 'long-text', 'no-results']);
    expect(stateKeys('authorizationList')).toEqual(['default', 'long-text', 'sharing-requests', 'read-error']);
    for (const id of sectionScreens) expect(stateKeys(id)).toEqual(sectionScreenStates);
  });

  it.each(cases)('%s / %s renders in %s theme at scale %s', async (id, key, theme, scale) => {
    await render(<ThemeProvider name={theme} fontScale={scale}>{state(id, key)}</ThemeProvider>);
  });

  // The fixed-width screens, the side sheet and the side navigation size themselves.
  it.each(
    galleryEntries
      .flatMap((entry) => Object.keys(entry.states).map((key) => [entry.id, key]))
      // The side navigation has its own fixed width.
      .filter(([id, key]) => id !== 'sideSheet' && !/^(expanded|medium|compact)-\d+$/.test(key) && !(id === 'consoleNav' && key === 'side')),
  )('%s / %s fills the width of the preview', async (id, key) => {
    await render(<ThemeProvider>{state(id, key)}</ThemeProvider>);

    const root = screen.toJSON() as unknown as { props: { style: StyleProp<ViewStyle> } };
    expect(StyleSheet.flatten(root.props.style)?.alignSelf).toBe('stretch');
  });

  describe('categoriesScreen', () => {
    it('lists its states', () => {
      expect(stateKeys('categoriesScreen')).toEqual([
        'interactive',
        'with-inactive',
        'empty',
        'loading',
        'error',
        'renaming',
        'confirm-open',
        'long-names',
        'expanded-1280',
        'medium-800',
        'compact-360',
      ]);
    });

    it('interactive adds, renames, moves, deactivates and reactivates in place', async () => {
      await render(<ThemeProvider>{state('categoriesScreen', 'interactive')}</ThemeProvider>);
      expect(await screen.findByText('Categoría A')).toBeOnTheScreen();

      await fireEvent.changeText(screen.getByLabelText('Nueva categoría'), 'Categoría D');
      await fireEvent.press(screen.getByRole('button', { name: 'Agregar' }));
      expect(await screen.findByText('Categoría D')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Subir Categoría D' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Bajar Categoría D' })).toBeEnabled());

      await fireEvent.press(screen.getAllByRole('button', { name: 'Renombrar' })[0]);
      await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), 'Categoría Z');
      await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
      expect(await screen.findByText('Categoría Z')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Reactivar' }));
      await waitFor(() => expect(screen.queryByLabelText('Inactiva')).toBeNull());
    });

    it('with-inactive shows the tag, renaming the field and confirm-open the question', async () => {
      await render(<ThemeProvider>{state('categoriesScreen', 'with-inactive')}</ThemeProvider>);
      expect(screen.getByLabelText('Inactiva')).toBeOnTheScreen();

      await render(<ThemeProvider>{state('categoriesScreen', 'renaming')}</ThemeProvider>);
      expect(screen.getByLabelText('Nombre de la categoría').props.value).toBe('Categoría B');

      await render(<ThemeProvider>{state('categoriesScreen', 'confirm-open')}</ThemeProvider>);
      expect(screen.getByText('¿Desactivar Categoría A?')).toBeOnTheScreen();
    });

    it.each([
      ['empty', 'Aún no hay categorías'],
      ['error', 'No pudimos cargar las categorías'],
    ])('%s shows its message', async (key, message) => {
      await render(<ThemeProvider>{state('categoriesScreen', key)}</ThemeProvider>);

      expect(screen.getByText(message)).toBeOnTheScreen();
    });

    it('loading shows the loading state', async () => {
      await render(<ThemeProvider>{state('categoriesScreen', 'loading')}</ThemeProvider>);

      expect(screen.getByTestId('state-view')).toBeOnTheScreen();
    });

    it('long-names keeps the whole name', async () => {
      await render(<ThemeProvider>{state('categoriesScreen', 'long-names')}</ThemeProvider>);

      expect(screen.getByText(/perfeccionamiento técnico para nadadores de iniciación avanzada$/)).toBeOnTheScreen();
    });
  });

  describe('consoleScreen', () => {
    it('lists its states', () => {
      expect(stateKeys('consoleScreen')).toEqual(['shell', 'expanded-1280', 'medium-800', 'compact-360']);
    });

    it('shell follows the measured width of the preview and keeps the section across it', async () => {
      await render(<ThemeProvider>{state('consoleScreen', 'shell')}</ThemeProvider>);
      await measure(1280);
      expect(layoutShown()).toBe('expanded');
      await fireEvent.press(screen.getByRole('tab', { name: 'Récords' }));
      await measure(800);
      expect(layoutShown()).toBe('medium');
      await measure(360);
      expect(layoutShown()).toBe('compact');
      expect(screen.getByRole('header', { name: 'Récords' })).toBeOnTheScreen();
    });

    it.each([
      ['expanded-1280', 'expanded'],
      ['medium-800', 'medium'],
      ['compact-360', 'compact'],
    ])('%s shows "Categorías" in the %s layout', async (key, layout) => {
      await render(<ThemeProvider>{state('consoleScreen', key)}</ThemeProvider>);
      expect(layoutShown()).toBe(layout);
      expect(screen.getByRole('header', { name: 'Categorías' })).toBeOnTheScreen();
    });
  });

  describe('athletesScreen', () => {
    it('with-data follows the measured width of the preview: tablet landscape, tablet portrait and phone', async () => {
      await render(<ThemeProvider>{state('athletesScreen', 'with-data')}</ThemeProvider>);

      await measure(1280);
      expect(layoutShown()).toBe('expanded');
      await measure(800);
      expect(layoutShown()).toBe('medium');
      await measure(360);
      expect(layoutShown()).toBe('compact');
      await measure(1024);
      expect(layoutShown()).toBe('expanded');
      await measure(1023);
      expect(layoutShown()).toBe('medium');
      await measure(599);
      expect(layoutShown()).toBe('compact');
      await measure(600);
      expect(layoutShown()).toBe('medium');
    });

    it.each([
      ['expanded-1280', 'expanded'],
      ['medium-800', 'medium'],
      ['compact-360', 'compact'],
    ])('%s shows the %s layout whatever the device', async (key, layout) => {
      await render(<ThemeProvider>{state('athletesScreen', key)}</ThemeProvider>);

      expect(layoutShown()).toBe(layout);
    });

    it('expanded-1280 starts with the detail of the first athlete open in the panel', async () => {
      await render(<ThemeProvider>{state('athletesScreen', 'expanded-1280')}</ThemeProvider>);

      expect(screen.getByTestId('detail-panel')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();
    });

    it('opens and closes the detail when a row is tapped and keeps no state when mounted again', async () => {
      const { unmount } = await render(<ThemeProvider>{state('athletesScreen', 'medium-800')}</ThemeProvider>);
      expect(screen.queryByTestId('side-sheet')).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: /^Mateo Castro/ }));
      expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
      expect(screen.queryByTestId('side-sheet')).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: /^Mateo Castro/ }));
      await unmount();
      await render(<ThemeProvider>{state('athletesScreen', 'medium-800')}</ThemeProvider>);
      expect(screen.queryByTestId('side-sheet')).toBeNull();
    });

    it('compact-360 opens the detail full screen and Volver returns to the list', async () => {
      await render(<ThemeProvider>{state('athletesScreen', 'compact-360')}</ThemeProvider>);

      await fireEvent.press(screen.getByRole('button', { name: /^Sara Peña/ }));
      expect(screen.getByRole('header', { name: 'Sara Peña' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /^Mateo Castro/ })).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
      expect(screen.getByRole('button', { name: /^Mateo Castro/ })).toBeOnTheScreen();
    });

    it('filter-sheet shows the options of a filter and chooses one in place', async () => {
      await render(<ThemeProvider>{state('athletesScreen', 'filter-sheet')}</ThemeProvider>);

      expect(screen.getByTestId('side-sheet')).toHaveProp('accessibilityLabel', 'Filtrar por categoría');
      await fireEvent.press(screen.getByRole('button', { name: 'Categoría C' }));
      expect(screen.queryByTestId('side-sheet')).toBeNull();
      expect(screen.getByRole('button', { name: 'Categoría: Categoría C' })).toBeSelected();
    });

    it('filter-sheet-coach says the coach names are not available', async () => {
      await render(<ThemeProvider>{state('athletesScreen', 'filter-sheet-coach')}</ThemeProvider>);

      expect(screen.getByText('Los nombres de los entrenadores aún no están disponibles.')).toBeOnTheScreen();
    });

    it('no-match says nothing matches and clears in place', async () => {
      await render(<ThemeProvider>{state('athletesScreen', 'no-match')}</ThemeProvider>);

      expect(screen.getByText('Ningún deportista coincide con la búsqueda')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Limpiar búsqueda y filtros' }));
      expect(screen.getByRole('button', { name: /^Lucía Ramírez/ })).toBeOnTheScreen();
    });

    it('sin-dato shows the missing values as Sin dato, never as 0 or blank', async () => {
      await render(<ThemeProvider>{state('athletesScreen', 'sin-dato')}</ThemeProvider>);

      expect(screen.getByLabelText('Por revisar: Sin dato')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: /^Lucía Ramírez, Categoría B, Grupo B, Sin dato/ })).toBeOnTheScreen();
      expect(screen.getAllByText('Sin dato').length).toBeGreaterThanOrEqual(2);
    });

    it('with-data filters and searches in place', async () => {
      await render(<ThemeProvider>{state('athletesScreen', 'expanded-1280')}</ThemeProvider>);

      await fireEvent.press(screen.getByRole('button', { name: 'Categoría' }));
      expect(screen.getByRole('button', { name: 'Categoría: Categoría B' })).toBeSelected();
      await fireEvent.press(screen.getByRole('button', { name: 'Categoría: Categoría B' }));
      expect(screen.getByRole('button', { name: 'Categoría' })).not.toBeSelected();
      await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), 'Lu');
      expect(screen.getByLabelText('Buscar por nombre').props.value).toBe('Lu');
    });

    it.each([
      ['loading', 'state-view'],
      ['empty', 'state-view'],
      ['error', 'state-view'],
      ['offline-with-data', 'banner'],
      ['offline-no-data', 'state-view'],
      ['denied', 'state-view'],
    ])('%s shows its view state', async (key, testID) => {
      await render(<ThemeProvider>{state('athletesScreen', key)}</ThemeProvider>);

      expect(screen.getByTestId(testID)).toBeOnTheScreen();
    });
  });

  describe.each(sectionScreens)('%s', (id) => {
    it('with-data follows the measured width of the preview', async () => {
      await render(<ThemeProvider>{state(id, 'with-data')}</ThemeProvider>);

      await measure(1280);
      expect(layoutShown()).toBe('expanded');
      await measure(800);
      expect(layoutShown()).toBe('medium');
      await measure(360);
      expect(layoutShown()).toBe('compact');
    });

    it.each([
      ['expanded-1280', 'expanded'],
      ['medium-800', 'medium'],
      ['compact-360', 'compact'],
    ])('%s shows the %s layout whatever the device', async (key, layout) => {
      await render(<ThemeProvider>{state(id, key)}</ThemeProvider>);

      expect(layoutShown()).toBe(layout);
    });

    it.each([
      ['loading', 'state-view'],
      ['empty', 'state-view'],
      ['error', 'state-view'],
      ['offline-with-data', 'banner'],
      ['offline-no-data', 'state-view'],
      ['denied', 'state-view'],
    ])('%s shows its view state', async (key, testID) => {
      await render(<ThemeProvider>{state(id, key)}</ThemeProvider>);

      expect(screen.getByTestId(testID)).toBeOnTheScreen();
    });
  });

  it('recordsScreen / expanded-1280 changes the table when the pool is pressed', async () => {
    await render(<ThemeProvider>{state('recordsScreen', 'expanded-1280')}</ThemeProvider>);
    expect(screen.getAllByTestId('record-row')).toHaveLength(4);

    await fireEvent.press(screen.getByRole('radio', { name: '50 m' }));

    expect(screen.getAllByTestId('record-row')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: '50 m' })).toBeChecked();
  });

  it('measurementsScreen / expanded-1280 turns a filter chip on and off in place', async () => {
    await render(<ThemeProvider>{state('measurementsScreen', 'expanded-1280')}</ThemeProvider>);

    await fireEvent.press(screen.getByRole('button', { name: 'Entrenador' }));
    expect(screen.getByRole('button', { name: 'Entrenador: Paula G.' })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: 'Entrenador: Paula G.' }));
    expect(screen.getByRole('button', { name: 'Entrenador' })).not.toBeSelected();
  });

  it('coachesScreen / expanded-1280 asks for confirmation before deactivating', async () => {
    await render(<ThemeProvider>{state('coachesScreen', 'expanded-1280')}</ThemeProvider>);

    await fireEvent.press(screen.getAllByRole('button', { name: 'Desactivar' })[0]);

    expect(screen.getByText('¿Desactivar a Paula Gutiérrez?')).toBeOnTheScreen();
  });

  it('athleteFilters / with-filter turns a chip on and off in place', async () => {
    await render(<ThemeProvider>{state('athleteFilters', 'with-filter')}</ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Categoría: Categoría B' })).toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: 'Grupo' }));
    expect(screen.getByRole('button', { name: 'Grupo: Grupo B' })).toBeSelected();
  });

  it('athleteTable / default selects a row in place', async () => {
    await render(<ThemeProvider>{state('athleteTable', 'default')}</ThemeProvider>);

    await fireEvent.press(screen.getByRole('button', { name: /^Julián Ortiz/ }));

    expect(screen.getByRole('button', { name: /^Julián Ortiz/ })).toBeSelected();
  });

  it('no module file contains a hexadecimal color, a line limit that is not shrink-to-fit, or a font-scaling opt-out', () => {
    const offenders = sourceFiles.filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return (
        /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(text) ||
        // Shrink-to-fit never clips: numberOfLines is allowed only as {1} followed by adjustsFontSizeToFit in the same tag.
        text.replace(/numberOfLines=\{1\} adjustsFontSizeToFit(?![\w])/g, '').includes('numberOfLines') ||
        /allowFontScaling=\{false\}/.test(text)
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

  it('never uses a literal breakpoint width', () => {
    const offenders = sourceFiles
      .filter((file) => file.endsWith('.tsx'))
      .filter((file) => /\b(?:600|1024|599|1023)\b/.test(fs.readFileSync(file, 'utf8')) && !file.endsWith('gallery.tsx'));
    expect(offenders).toEqual([]);
  });
});
