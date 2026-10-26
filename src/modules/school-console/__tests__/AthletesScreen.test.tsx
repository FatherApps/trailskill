import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { colors, contrastRatio, ThemeProvider, type ThemeName } from '../../../core/theme';
import {
  athletesFixture,
  detailsFixture,
  indicatorsFixture,
  schoolNameFixture,
  storedOnFixture,
} from '../__fixtures__/athletes';
import { personalBestLabel } from '../components/eventLabel';
import {
  AthletesScreen,
  athletesScreenColors,
  type AthletesContent,
  type AthletesScreenProps,
  type AthletesView,
} from '../screens/AthletesScreen';

const themes: ThemeName[] = ['light', 'dark'];
const hidden = { includeHiddenElements: true };

const content: AthletesContent = {
  updatedMinutesAgo: 2,
  indicators: indicatorsFixture,
  query: '',
  filters: {},
  athletes: athletesFixture,
  bestLabel: personalBestLabel('FR', '50m'),
  selectedId: null,
  detail: null,
};

const handlers = () => ({
  onNavigate: jest.fn(),
  onInvite: jest.fn(),
  onQueryChange: jest.fn(),
  onFilterPress: jest.fn(),
  onSelect: jest.fn(),
  onCloseDetail: jest.fn(),
  onViewProfile: jest.fn(),
});

const show = async (view: AthletesView, extra: Partial<AthletesScreenProps> = {}) => {
  const actions = handlers();
  const props: AthletesScreenProps = { width: 1280, schoolName: schoolNameFixture, view, ...actions, ...extra };
  await render(<AthletesScreen {...props} />);
  return { actions };
};

const withDetail: AthletesContent = { ...content, selectedId: 'a1', detail: detailsFixture.a1 };

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('AthletesScreen', () => {
  describe('with data', () => {
    it('shows the title, the caption, the indicators, the filters and the table in the console layout', async () => {
      await show({ kind: 'data', content });

      expect(screen.getByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Deportistas' })).toHaveProp('numberOfLines', 1);
      expect(screen.getByRole('header', { name: 'Deportistas' })).toHaveProp('adjustsFontSizeToFit', true);
      expect(screen.getByRole('header', { name: 'Deportistas' })).toHaveProp('minimumFontScale', 0.7);
      expect(screen.getByText('128 activos · Actualizado hace 2 min')).toBeOnTheScreen();
      expect(screen.getByLabelText('Autorización pendiente: 7')).toBeOnTheScreen();
      expect(screen.getByLabelText('Buscar por nombre')).toBeOnTheScreen();
      expect(screen.getByText('MP Libre 50')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: /^Lucía Ramírez/ })).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Deportistas' })).toBeSelected();
      expect(screen.queryByTestId('state-view')).toBeNull();
      expect(screen.queryByTestId('banner')).toBeNull();
    });

    it.each([
      [{ ...content, updatedMinutesAgo: 0 }, '128 activos · Actualizado hace un momento'],
      [{ ...content, updatedMinutesAgo: null }, '128 activos'],
      [{ ...content, indicators: { ...indicatorsFixture, active: 1 } }, '1 activo · Actualizado hace 2 min'],
    ])('words the caption for %#', async (data, caption) => {
      await show({ kind: 'data', content: data });

      expect(screen.getByText(caption)).toBeOnTheScreen();
    });

    it('offers to invite a guardian, which only calls back', async () => {
      const { actions } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getByRole('button', { name: 'Invitar acudiente' }));

      expect(actions.onInvite).toHaveBeenCalledTimes(1);
    });

    it('passes the typing, the chips, the row and the navigation to the caller', async () => {
      const { actions } = await show({ kind: 'data', content });

      await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), 'Lu');
      await fireEvent.press(screen.getByRole('button', { name: 'Categoría' }));
      await fireEvent.press(screen.getByRole('button', { name: /^Sara Peña/ }));
      await fireEvent.press(screen.getByRole('tab', { name: 'Récords' }));

      expect(actions.onQueryChange).toHaveBeenCalledWith('Lu');
      expect(actions.onFilterPress).toHaveBeenCalledWith('category');
      expect(actions.onSelect).toHaveBeenCalledWith('a3');
      expect(actions.onNavigate).toHaveBeenCalledWith('records');
    });

    it('shows a dash for an athlete without time', async () => {
      await show({ kind: 'data', content });

      expect(screen.getAllByText('—', hidden)).toHaveLength(1);
      expect(screen.queryByText('0,00', hidden)).toBeNull();
    });
  });

  describe('by width', () => {
    it('expanded: side navigation, table and the detail in a panel', async () => {
      const { actions } = await show({ kind: 'data', content: withDetail }, { width: 1024 });

      expect(screen.getByTestId('console-nav-side')).toBeOnTheScreen();
      expect(screen.getByText('Categoría')).toBeOnTheScreen();
      expect(screen.getByTestId('detail-panel')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Ver perfil completo' }));
      expect(actions.onViewProfile).toHaveBeenCalledWith('a1');
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
      expect(actions.onCloseDetail).toHaveBeenCalledTimes(1);
    });

    it('medium: navigation on top, table and the detail in a side sheet', async () => {
      await show({ kind: 'data', content: withDetail }, { width: 1023 });

      expect(screen.getByTestId('console-nav-top', hidden)).toBeOnTheScreen();
      expect(screen.getByText('Deportista', hidden)).toBeOnTheScreen();
      expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();
      expect(screen.queryByTestId('detail-panel')).toBeNull();
      // The athletes behind the sheet are not reachable.
      expect(screen.queryByRole('button', { name: /^Mateo Castro/ })).toBeNull();
    });

    it('compact: a list of SwimmerRow and a full-screen detail with Volver', async () => {
      const { actions } = await show({ kind: 'data', content }, { width: 599 });
      expect(screen.queryByTestId('console-nav-side')).toBeNull();
      expect(screen.getByTestId('console-nav-top')).toBeOnTheScreen();
      expect(screen.queryByText('Categoría')).toBeNull();
      expect(screen.getByRole('button', { name: /^Lucía Ramírez, Categoría B · Grupo B · Paula G\./ })).toBeOnTheScreen();

      await screen.rerender(
        <AthletesScreen width={599} schoolName={schoolNameFixture} view={{ kind: 'data', content: withDetail }} {...actions} />,
      );
      expect(screen.queryByRole('button', { name: /^Mateo Castro/ })).toBeNull();
      expect(screen.getByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
      expect(actions.onCloseDetail).toHaveBeenCalledTimes(1);
    });

    it('switches layout exactly at 599/600 and 1023/1024', async () => {
      const layoutAt = async (width: number) => {
        await show({ kind: 'data', content }, { width });
        const result = [
          screen.queryByTestId('console-nav-side') ? 'side' : screen.queryByTestId('console-nav-top') ? 'top' : 'none',
          screen.queryByText('Categoría') ? 'table' : 'list',
        ].join('+');
        await screen.unmount();
        return result;
      };

      expect(await layoutAt(599)).toBe('top+list');
      expect(await layoutAt(600)).toBe('top+table');
      expect(await layoutAt(1023)).toBe('top+table');
      expect(await layoutAt(1024)).toBe('side+table');
    });
  });

  describe('view states', () => {
    it('loading shows the loading state under the title, without indicators or invite', async () => {
      await show({ kind: 'loading' });

      expect(screen.getByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
      expect(screen.getByTestId('state-view')).toHaveProp('accessibilityState', { busy: true });
      expect(screen.queryByLabelText('Activos: 128')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Invitar acudiente' })).toBeNull();
    });

    it('empty invites and says who creates the athletes', async () => {
      await show({ kind: 'empty' });

      expect(screen.getByText('Aún no hay deportistas')).toBeOnTheScreen();
      expect(
        screen.getByText('Aparecen cuando un acudiente o un deportista adulto crea su cuenta. Invita a un acudiente para empezar.'),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Invitar acudiente' })).toBeOnTheScreen();
      expect(screen.queryByLabelText('Buscar por nombre')).toBeNull();
    });

    it('error says what failed and retries', async () => {
      const onRetry = jest.fn();
      await show({ kind: 'error', onRetry });

      expect(screen.getByText('No pudimos cargar los deportistas')).toBeOnTheScreen();
      expect(screen.getByText('Revisa tu conexión e inténtalo de nuevo.')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('offline with stored data shows a dated warning banner above the content', async () => {
      await show({ kind: 'offline', storedOn: storedOnFixture, content });

      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este dispositivo el 23 de octubre de 2026.',
      );
      expect(screen.getByRole('button', { name: /^Lucía Ramírez/ })).toBeOnTheScreen();
      expect(screen.queryByTestId('state-view')).toBeNull();
      // The list passes its header and empty state as elements (props), which do not serialize: only the rendered tree counts.
      const json = JSON.stringify(screen.toJSON(), (key, value) => (key.startsWith('List') ? undefined : value));
      expect(json.indexOf('Mostramos lo guardado')).toBeLessThan(json.indexOf('Autorización pendiente: 7'));
    });

    it('offline with an unreadable date leaves the date out', async () => {
      await show({ kind: 'offline', storedOn: 'ayer', content });

      expect(screen.getByTestId('banner')).toHaveTextContent('Estás sin conexión Mostramos lo guardado en este dispositivo.');
    });

    it('offline without data uses the offline state', async () => {
      await show({ kind: 'offline-empty' });

      expect(screen.getByText('Estás sin conexión')).toBeOnTheScreen();
      expect(
        screen.getByText('No hay deportistas guardados en este dispositivo. Aparecerán cuando vuelva la conexión.'),
      ).toBeOnTheScreen();
      expect(screen.queryByTestId('banner')).toBeNull();
    });

    it('connecting without data says the first sync is running and never mentions the connection', async () => {
      await show({ kind: 'connecting-empty' });

      expect(screen.getByText('Estamos sincronizando')).toBeOnTheScreen();
      expect(
        screen.getByText('Todavía no hay deportistas guardados en este dispositivo. Aparecerán cuando termine la primera sincronización.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText('Estás sin conexión')).toBeNull();
    });

    it('denied says only that it is private, with no data and no invite', async () => {
      await show({ kind: 'denied' });

      expect(screen.getByText('Esta información es privada')).toBeOnTheScreen();
      expect(screen.queryByText(/administración/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Invitar acudiente' })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Lucía Ramírez/ })).toBeNull();
    });

    it.each<[string, AthletesView]>([
      ['loading', { kind: 'loading' }],
      ['empty', { kind: 'empty' }],
      ['error', { kind: 'error', onRetry: () => {} }],
      ['offline-empty', { kind: 'offline-empty' }],
      ['connecting-empty', { kind: 'connecting-empty' }],
      ['denied', { kind: 'denied' }],
    ])('keeps the console navigation in the %s state', async (_, view) => {
      await show(view);

      expect(screen.getByRole('tab', { name: 'Deportistas' })).toBeSelected();
    });
  });

  it.each(themes)('keeps the title and the caption readable in the %s theme', (theme) => {
    const c = colors[theme];
    expect(contrastRatio(c[athletesScreenColors.title], c[athletesScreenColors.canvas])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[athletesScreenColors.caption], c[athletesScreenColors.canvas])).toBeGreaterThanOrEqual(4.5);
  });

  it('follows the theme', async () => {
    const actions = handlers();
    await render(
      <ThemeProvider name="dark">
        <AthletesScreen width={1280} schoolName={schoolNameFixture} view={{ kind: 'data', content }} {...actions} />
      </ThemeProvider>,
    );

    expect(StyleSheet.flatten(screen.getByRole('header', { name: 'Deportistas' }).props.style).color).toBe(colors.dark.ink);
  });
});

describe('AthletesScreen: optional actions', () => {
  it('hides the invite button when there is no invitation flow', async () => {
    await show({ kind: 'data', content }, { onInvite: undefined });

    expect(screen.queryByRole('button', { name: 'Invitar acudiente' })).toBeNull();
    expect(screen.getByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
  });

  it('hides the invite button of the empty state too', async () => {
    await show({ kind: 'empty' }, { onInvite: undefined });

    expect(screen.queryByRole('button', { name: 'Invitar acudiente' })).toBeNull();
    expect(screen.getByText('Aún no hay deportistas')).toBeOnTheScreen();
  });

  it('hides "Ver perfil completo" when there is no profile screen', async () => {
    await show({ kind: 'data', content: withDetail }, { width: 1024, onViewProfile: undefined });

    expect(screen.getByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ver perfil completo' })).toBeNull();
  });

  it('shows Sin dato for an unknown "Por revisar" and for a coach that is not known', async () => {
    const unknown: AthletesContent = {
      ...content,
      indicators: { ...indicatorsFixture, toReview: null },
      athletes: athletesFixture.map((athlete) => ({ ...athlete, coach: null })),
    };
    await show({ kind: 'data', content: unknown });

    expect(screen.getByLabelText('Por revisar: Sin dato')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Lucía Ramírez, Categoría B, Grupo B, Sin dato, Vigente/ })).toBeOnTheScreen();
  });
});

describe('AthletesScreen: filter sheet', () => {
  const sheet = (over: Partial<NonNullable<AthletesScreenProps['filterSheet']>> = {}): NonNullable<AthletesScreenProps['filterSheet']> => ({
    id: 'category',
    options: [
      { id: 'c1', label: 'Categoría B' },
      { id: 'c2', label: 'Categoría C' },
    ],
    selectedId: 'c1',
    onChoose: jest.fn(),
    onClose: jest.fn(),
    ...over,
  });

  it.each([
    ['category', 'Filtrar por categoría'],
    ['group', 'Filtrar por grupo'],
    ['coach', 'Filtrar por entrenador'],
  ] as const)('names the %s sheet "%s"', async (id, label) => {
    await show({ kind: 'data', content }, { filterSheet: sheet({ id }) });

    expect(screen.getByTestId('side-sheet')).toHaveProp('accessibilityLabel', label);
    expect(screen.getByRole('header', { name: label })).toBeOnTheScreen();
  });

  it('lists the options as 48 dp buttons, marks the chosen one and reports the pressed one', async () => {
    const filterSheet = sheet();
    await show({ kind: 'data', content }, { filterSheet });

    expect(screen.getByRole('button', { name: 'Categoría B' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Categoría C' })).not.toBeSelected();
    for (const option of ['Categoría B', 'Categoría C']) {
      expect(StyleSheet.flatten(screen.getByRole('button', { name: option }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    }

    await fireEvent.press(screen.getByRole('button', { name: 'Categoría C' }));
    expect(filterSheet.onChoose).toHaveBeenCalledWith('c2');
  });

  it('closes with Cerrar and with the scrim', async () => {
    const filterSheet = sheet();
    await show({ kind: 'data', content }, { filterSheet });

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
    await fireEvent.press(screen.getByTestId('side-sheet-scrim'));

    expect(filterSheet.onClose).toHaveBeenCalledTimes(2);
  });

  it('hides the screen behind the sheet from screen readers', async () => {
    await show({ kind: 'data', content }, { filterSheet: sheet(), width: 599 });

    expect(screen.queryByRole('button', { name: /^Mateo Castro/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Récords' })).toBeNull();
  });

  it('says the coach names are not available when no option has a name, instead of empty rows', async () => {
    await show(
      { kind: 'data', content },
      { filterSheet: sheet({ id: 'coach', options: [{ id: 'k1', label: null }, { id: 'k2', label: null }], selectedId: undefined }) },
    );

    expect(screen.getByText('Los nombres de los entrenadores aún no están disponibles.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'k1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sin dato' })).toBeNull();
  });

  it('says there is nothing to choose when the sheet has no options', async () => {
    await show({ kind: 'data', content }, { filterSheet: sheet({ options: [], selectedId: undefined }) });

    expect(screen.getByText('No hay opciones para elegir')).toBeOnTheScreen();
    expect(screen.queryByText('Los nombres de los entrenadores aún no están disponibles.')).toBeNull();
  });

  it('is not shown without the prop', async () => {
    await show({ kind: 'data', content });

    expect(screen.queryByTestId('side-sheet')).toBeNull();
  });
});

describe('AthletesScreen: no athlete matches', () => {
  const none: AthletesContent = { ...content, query: 'zzz', athletes: [] };

  it('says nothing matches and clears the search and the filters from its action', async () => {
    const onClearFilters = jest.fn();
    await show({ kind: 'data', content: none }, { onClearFilters });

    expect(screen.getByText('Ningún deportista coincide con la búsqueda')).toBeOnTheScreen();
    expect(screen.queryByText('Aún no hay deportistas')).toBeNull();
    // The search and the filters stay, so the person sees what to change; the table header does not.
    expect(screen.getByLabelText('Buscar por nombre')).toBeOnTheScreen();
    expect(screen.queryByText('Deportista')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Limpiar búsqueda y filtros' }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('has no action without a handler', async () => {
    await show({ kind: 'data', content: none });

    expect(screen.getByText('Ningún deportista coincide con la búsqueda')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Limpiar búsqueda y filtros' })).toBeNull();
  });

  it('also shows it under the offline banner and in the page-scrolled preview', async () => {
    await show({ kind: 'offline', storedOn: storedOnFixture, content: none }, { scrollEnabled: false });

    expect(screen.getByTestId('banner')).toBeOnTheScreen();
    expect(screen.getByText('Ningún deportista coincide con la búsqueda')).toBeOnTheScreen();
  });
});

describe('AthletesScreen: virtualized list', () => {
  const many: AthletesContent = {
    ...content,
    indicators: { ...indicatorsFixture, active: 300 },
    athletes: Array.from({ length: 300 }, (_, index) => ({
      ...athletesFixture[0]!,
      id: `m${index}`,
      name: `Deportista ${String(index).padStart(3, '0')}`,
    })),
  };
  const rows = () => screen.queryAllByRole('button', { name: /^Deportista \d{3}/ });

  it('renders far fewer rows than athletes at first, in the table and in the list form', async () => {
    await show({ kind: 'data', content: many });
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThan(60);
    // The header, the indicators and the filters scroll with the rows.
    expect(screen.getByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
    expect(screen.getByText('Deportista')).toBeOnTheScreen();
    await screen.unmount();

    await show({ kind: 'data', content: many }, { width: 599 });
    expect(rows().length).toBeLessThan(60);
  });

  it('keeps the selected row marked', async () => {
    await show({ kind: 'data', content: { ...many, selectedId: 'm2' } });

    expect(screen.getByRole('button', { name: /^Deportista 002/ })).toBeSelected();
  });

  it('keeps typing in the search field while the list changes', async () => {
    const { actions } = await show({ kind: 'data', content: many });

    await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), 'De');

    expect(actions.onQueryChange).toHaveBeenCalledWith('De');
  });

  it('does not nest a list in the page scroll of the development gallery: every row is plain', async () => {
    await show({ kind: 'data', content: many }, { scrollEnabled: false });

    expect(rows()).toHaveLength(300);
    expect(JSON.stringify(screen.toJSON())).not.toContain('RCTScrollView');
  });
});
