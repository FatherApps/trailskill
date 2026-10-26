import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, contrastRatio, ThemeProvider, type ThemeName } from '../../../core/theme';
import { historyFixture, historyResults } from '../__fixtures__/history';
import { profileContentFixture as content, storedOnFixture } from '../__fixtures__/screen';
import type { ImportPromptProps } from '../components/ImportPrompt';
import {
  AthleteProfileScreen,
  athleteProfileScreenColors,
  type AthleteProfileContent,
  type AthleteProfileView,
} from '../screens/AthleteProfileScreen';

const name = 'Lucía R.';
const hidden = { includeHiddenElements: true };

const importPrompt: ImportPromptProps = {
  athleteName: name,
  sourceName: historyFixture.sourceName,
  imported: false,
  onDismiss: jest.fn(),
  onRefresh: jest.fn(),
};

const show = (view: AthleteProfileView, wrap: (node: ReactElement) => ReactElement = (node) => node) =>
  render(wrap(<AthleteProfileScreen name={name} view={view} />));

// Host element types and accessibility labels and texts, in render order.
type Json = {
  type: string;
  props: { accessibilityLabel?: string; horizontal?: boolean };
  children: Json[] | string[] | null;
};
const flatten = (node: unknown): string[] => {
  if (node === null || node === undefined) return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (typeof node === 'string') return [node];
  const { type, props, children } = node as Json;
  // The selectors scroll sideways; only a vertical scroll container can hold the history.
  const kind = type === 'RCTScrollView' && !props.horizontal ? 'vertical-scroll' : type;
  return [kind, ...(props.accessibilityLabel ? [props.accessibilityLabel] : []), ...flatten(children)];
};
const order = () => flatten(screen.toJSON());
const at = (flat: string[], start: string) => flat.findIndex((item) => item.startsWith(start));

describe('AthleteProfileScreen', () => {
  afterEach(() => jest.useRealTimers());

  describe('with data', () => {
    it('composes the header, the event selector, the personal best, the chart and the history in order', async () => {
      await show({
        kind: 'data',
        content: { ...content, chart: <Text>Gráfico de progreso</Text> },
      });

      const flat = order();
      const positions = [
        at(flat, 'Lucía R.'),
        at(flat, 'Prueba'),
        at(flat, 'Marca personal, Libre 50 m'),
        at(flat, 'Gráfico de progreso'),
        at(flat, 'Historial'),
        at(flat, 'Libre 50 m, 18 de octubre de 2026'),
      ];
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      expect(screen.queryByTestId('state-view')).toBeNull();
      expect(screen.queryByTestId('banner')).toBeNull();
    });

    it('leaves out the chart slot when there is no chart', async () => {
      await show({ kind: 'data', content });

      expect(screen.queryByText('Gráfico de progreso')).toBeNull();
      expect(screen.getByRole('header', { name: 'Historial' })).toBeOnTheScreen();
    });

    it('never shows a missing time as 0,00, in the personal best or in the history', async () => {
      await show({
        kind: 'data',
        content: {
          ...content,
          personalBest: {
            ...content.personalBest,
            best: null,
            improvement: undefined,
            kind: undefined,
            date: undefined,
          },
        },
      });

      expect(screen.queryAllByText('0,00', hidden)).toHaveLength(0);
      expect(screen.queryAllByText(/0,00/, hidden)).toHaveLength(0);
      // The personal best shows a dash and the history keeps its rows without a time.
      expect(screen.getAllByText('—', hidden).length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Pecho 50 m, 9 de octubre de 2026, Entrenamiento, Sin registro, Enviado')).toBeOnTheScreen();
    });

    it('keeps the history virtualized inside the one scrolling list', async () => {
      const many = Array.from({ length: 60 }, (_, index) => ({
        ...historyResults[0],
        id: `r-${index}`,
      }));
      await show({ kind: 'data', content: { ...content, history: many } });

      // One vertical scroll container only: the history is not a list inside a ScrollView.
      expect(order().filter((item) => item === 'vertical-scroll')).toHaveLength(1);
      const rows = screen.getAllByLabelText(/^Libre 50 m, /);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(many.length);
    });
  });

  describe('layout', () => {
    const rootStyle = () =>
      StyleSheet.flatten((screen.toJSON() as unknown as { props: { style: StyleProp<ViewStyle> } }).props.style);

    it('fills the width and, when it scrolls, the height it is given', async () => {
      await show({ kind: 'data', content });

      expect(rootStyle()).toMatchObject({ alignSelf: 'stretch', flex: 1 });
    });

    it('does not claim a height when a parent scrolls instead', async () => {
      await render(<AthleteProfileScreen name={name} view={{ kind: 'data', content }} scrollEnabled={false} />);

      expect(rootStyle()?.flex).toBeUndefined();
    });

    it.each(['light', 'dark'] as ThemeName[])('keeps the history title readable in the %s theme', (theme) => {
      const c = colors[theme];
      expect(contrastRatio(c[athleteProfileScreenColors.title], c['surface-0'])).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('import prompt', () => {
    it('shows it only when its props are given, with the exact words', async () => {
      await show({ kind: 'data', content: { ...content, importPrompt } });

      expect(screen.getByRole('button', { name: 'Ahora no' })).toBeOnTheScreen();
      expect(screen.getByText('¿Lucía R. compitió antes?', { exact: false })).toBeOnTheScreen();
    });

    it('is not rendered without its props', async () => {
      await show({ kind: 'data', content });

      expect(screen.queryByRole('button', { name: 'Ahora no' })).toBeNull();
      expect(screen.queryByText(/Actualizar desde/)).toBeNull();
    });

    it('offers the refresh after an import and emits its events', async () => {
      const onDismiss = jest.fn();
      const onRefresh = jest.fn();
      await show({
        kind: 'data',
        content: {
          ...content,
          importPrompt: {
            ...importPrompt,
            imported: true,
            onDismiss,
            onRefresh,
          },
        },
      });

      await fireEvent.press(screen.getByRole('button', { name: 'Actualizar desde FEDNAT' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));

      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading', () => {
    it('shows a skeleton only after 300 ms and nothing about the athlete', async () => {
      jest.useFakeTimers();
      // The container has no athlete yet, so it passes an empty name: the band must stay empty.
      await render(<AthleteProfileScreen name="" view={{ kind: 'loading' }} />);

      expect(screen.getByTestId('state-view')).toBeOnTheScreen();
      await act(() => jest.advanceTimersByTime(299));
      expect(screen.queryByText('Cargando')).toBeNull();

      await act(() => jest.advanceTimersByTime(1));
      expect(screen.getByText('Cargando')).toBeOnTheScreen();
      expect(screen.getByRole('header')).toBeEmptyElement();
    });
  });

  describe('back in the states without content', () => {
    const views: [string, AthleteProfileView][] = [
      ['loading', { kind: 'loading' }],
      ['error', { kind: 'error', onRetry: jest.fn() }],
      ['offline-empty', { kind: 'offline-empty' }],
      ['other-school-offline', { kind: 'other-school-offline' }],
      ['denied', { kind: 'denied' }],
    ];

    it.each(views)('the %s view shows the band with a "Volver" button that calls onBack', async (_, view) => {
      const onBack = jest.fn();
      await render(<AthleteProfileScreen name={name} view={view} onBack={onBack} />);

      expect(screen.getByRole('header', { name })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty', () => {
    it('keeps the header and the selector and invites instead of apologizing', async () => {
      await show({ kind: 'empty', content });

      expect(screen.getByText('Aún no hay tiempos')).toBeOnTheScreen();
      expect(
        screen.getByText('Cuando el entrenador registre una medición de Lucía R., aparecerá aquí.'),
      ).toBeOnTheScreen();
      expect(screen.getByText(name)).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Libre 50 m' })).toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Marca personal/)).toBeNull();
      expect(screen.queryByRole('header', { name: 'Historial' })).toBeNull();
      expect(screen.queryAllByText(/0,00/, hidden)).toHaveLength(0);
    });

    it('still offers the import when its props are given', async () => {
      await show({ kind: 'empty', content: { ...content, importPrompt } });

      expect(screen.getByRole('button', { name: 'Ahora no' })).toBeOnTheScreen();
    });
  });

  describe('error', () => {
    it('says what happened and retries', async () => {
      const onRetry = jest.fn();
      await show({ kind: 'error', onRetry });

      expect(screen.getByText('No pudimos cargar el perfil')).toBeOnTheScreen();
      expect(screen.getByText('Revisa tu conexión e inténtalo de nuevo.')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('offline', () => {
    it('with stored data shows a dated warning banner under the band, above the content', async () => {
      await show({ kind: 'offline', storedOn: storedOnFixture, content });

      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este teléfono el 23 de octubre de 2026.',
      );
      const flat = order();
      expect(at(flat, 'Lucía R.')).toBeGreaterThan(-1);
      // Under the full-width band, above the personal best and the history.
      const banner = flat.indexOf('Mostramos lo guardado en este teléfono el 23 de octubre de 2026.');
      expect(banner).toBeGreaterThan(at(flat, 'Lucía R.'));
      expect(banner).toBeLessThan(at(flat, 'Marca personal, Libre 50 m'));
      expect(screen.getByRole('header', { name: 'Historial' })).toBeOnTheScreen();
      expect(screen.queryByTestId('state-view')).toBeNull();
    });

    it('with stored data but an unreadable date leaves the date out instead of showing it wrong', async () => {
      await show({ kind: 'offline', storedOn: 'ayer', content });

      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este teléfono.',
      );
    });

    it('without stored data uses the offline state', async () => {
      await show({ kind: 'offline-empty' });

      expect(screen.getByText('Estás sin conexión')).toBeOnTheScreen();
      expect(
        screen.getByText('No hay datos guardados de Lucía R. en este teléfono. Aparecerán cuando vuelva la conexión.'),
      ).toBeOnTheScreen();
      expect(screen.getByTestId('state-view')).toBeOnTheScreen();
      expect(screen.queryByTestId('banner')).toBeNull();
    });

    it("never shows another school's results from storage: it is available with a connection", async () => {
      await show({ kind: 'other-school-offline' });

      expect(screen.getByText('Disponible con conexión')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Los resultados de otra escuela se ven solo con conexión. No guardamos copias en este teléfono.',
        ),
      ).toBeOnTheScreen();
      expect(screen.getByTestId('state-view')).toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Libre 50 m/)).toBeNull();
    });
  });

  describe('permission denied', () => {
    it('says who can see it and exposes nothing beyond the short name', async () => {
      await show({ kind: 'denied' });

      expect(screen.getByText('Esta información es privada')).toBeOnTheScreen();
      expect(screen.getByText('Solo el acudiente de Lucía R. y su escuela pueden verla.')).toBeOnTheScreen();
      // Without a way to ask, the only button is the band's back button.
      expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual(['Volver']);
      expect(screen.queryByText('Infantil B', { exact: false })).toBeNull();
    });

    it.each(['', '   '])('does not leave a gap in the sentence when the name is blank (%j)', async (blank) => {
      await render(<AthleteProfileScreen name={blank} view={{ kind: 'denied' }} />);

      expect(screen.getByText('Solo el acudiente del deportista y su escuela pueden verla.')).toBeOnTheScreen();
    });

    it('offers to ask the school for access', async () => {
      const onRequestAccess = jest.fn();
      await show({ kind: 'denied', onRequestAccess });

      await fireEvent.press(screen.getByRole('button', { name: 'Pedir acceso a la escuela' }));

      expect(onRequestAccess).toHaveBeenCalledTimes(1);
    });
  });

  describe.each<ThemeName>(['light', 'dark'])('in the %s theme at 200 % text', (theme) => {
    const withContent = (extra: Partial<AthleteProfileContent> = {}) => ({
      ...content,
      ...extra,
    });
    const views: [string, AthleteProfileView, string][] = [
      ['data', { kind: 'data', content: withContent({ importPrompt }) }, 'Historial'],
      ['loading', { kind: 'loading' }, 'state-view'],
      ['empty', { kind: 'empty', content: withContent() }, 'Aún no hay tiempos'],
      ['error', { kind: 'error', onRetry: jest.fn() }, 'No pudimos cargar el perfil'],
      [
        'offline',
        {
          kind: 'offline',
          storedOn: storedOnFixture,
          content: withContent(),
        },
        'Historial',
      ],
      ['offline-empty', { kind: 'offline-empty' }, 'Estás sin conexión'],
      ['other-school-offline', { kind: 'other-school-offline' }, 'Disponible con conexión'],
      ['denied', { kind: 'denied', onRequestAccess: jest.fn() }, 'Esta información es privada'],
    ];

    it.each(views)('renders the %s view without dropping its text', async (_, view, expected) => {
      await show(view, (node) => (
        <ThemeProvider name={theme} fontScale={2}>
          {node}
        </ThemeProvider>
      ));

      expect(screen.queryByText(expected) ?? screen.getByTestId(expected)).toBeOnTheScreen();
    });
  });
});
