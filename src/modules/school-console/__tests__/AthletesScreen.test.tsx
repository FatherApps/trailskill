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
      expect(screen.getByRole('button', { name: /^Lucía Ramírez, Infantil B · Grupo B · Paula G\./ })).toBeOnTheScreen();

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
      const json = JSON.stringify(screen.toJSON());
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
