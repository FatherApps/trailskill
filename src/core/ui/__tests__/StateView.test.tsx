import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { processColor, StyleSheet } from 'react-native';

import { colors, contrastRatio, ThemeProvider, typography, type ThemeName } from '../../theme';
import { iconPaths, StateView, stateViewColors, type IconName, type StateKind } from '..';

const themes: ThemeName[] = ['light', 'dark'];

const states: [Exclude<StateKind, 'loading'>, string, string][] = [
  ['empty', 'Aún no hay tiempos', 'Cuando el entrenador registre una medición, aparecerá aquí.'],
  ['error', 'No pudimos cargar el historial', 'Revisa tu conexión e inténtalo de nuevo.'],
  ['offline', 'Estás sin conexión', 'Mostramos lo guardado en este teléfono el martes 7:12.'],
  ['denied', 'Esta información es privada', 'Solo el acudiente y su escuela pueden verla.'],
];

const pathsOf = () => screen.container.queryAll((node) => node.type === 'RNSVGPath');
const defaultIcons: Record<Exclude<StateKind, 'loading'>, IconName> = {
  empty: 'timer',
  error: 'error',
  offline: 'wifi_off',
  denied: 'lock',
};

describe('StateView', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('StateView must not query the network');
    });
  });

  afterEach(() => fetchSpy.mockRestore());

  it.each(states)('%s shows its title and sentence without querying the network', async (kind, title, message) => {
    await render(<StateView kind={kind} title={title} message={message} />);

    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.getByTestId('state-view').props.accessibilityLiveRegion).toBe('polite');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers at most one action and calls it', async () => {
    const onPress = jest.fn();
    await render(
      <StateView
        kind="error"
        title="No pudimos cargar el historial"
        message="Revisa tu conexión e inténtalo de nuevo."
        action={{ label: 'Intentar de nuevo', onPress }}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    await fireEvent.press(buttons[0]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows no action when none is given', async () => {
    await render(<StateView kind="offline" title="Estás sin conexión" message="Mostramos lo guardado." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  describe('icon', () => {
    it.each(states)('%s shows the icon of its kind in the color of its ring', async (kind, title, message) => {
      await render(<StateView kind={kind} title={title} message={message} />);

      const paths = pathsOf();
      expect(paths).toHaveLength(1);
      expect(paths[0].props.d).toBe(iconPaths[defaultIcons[kind]]);
      expect(paths[0].props.fill).toEqual({
        type: 0,
        payload: processColor(colors.light[stateViewColors.kinds[kind].icon]),
      });
    });

    it('lets the caller pick another icon of the set', async () => {
      await render(<StateView kind="empty" icon="group" title="Aún no hay grupos" message="Crea el primero." />);

      expect(pathsOf().map((path) => path.props.d)).toEqual([iconPaths.group]);
    });

    it('loading shows no icon', async () => {
      await render(<StateView kind="loading" />);

      expect(pathsOf()).toHaveLength(0);
    });
  });

  describe('title size', () => {
    const titleSize = () => StyleSheet.flatten(screen.getByRole('header').props.style).fontSize;

    it('uses the title token of the theme', async () => {
      await render(<StateView kind="error" title="No pudimos cargar" message="Revisa tu conexión." />);

      expect(titleSize()).toBe(typography.title.fontSize);
    });

    it('grows with the text scale', async () => {
      await render(
        <ThemeProvider fontScale={2}>
          <StateView kind="error" title="No pudimos cargar" message="Revisa tu conexión." />
        </ThemeProvider>,
      );

      expect(titleSize()).toBe(typography.title.fontSize * 2);
    });
  });

  describe('loading', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('waits 300 ms before showing the skeleton, then announces "Cargando"', async () => {
      await render(<StateView kind="loading" />);

      expect(screen.queryByText('Cargando')).toBeNull();
      expect(screen.getByTestId('state-view').props.accessibilityLiveRegion).toBe('polite');

      await act(() => jest.advanceTimersByTime(299));
      expect(screen.queryByText('Cargando')).toBeNull();

      await act(() => jest.advanceTimersByTime(1));
      expect(screen.getByText('Cargando')).toBeOnTheScreen();
      expect(screen.getByTestId('state-view')).toBeBusy();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('waits the full delay again when loading starts a second time', async () => {
      await render(<StateView kind="loading" />);
      await act(() => jest.advanceTimersByTime(300));
      expect(screen.getByText('Cargando')).toBeOnTheScreen();

      await screen.rerender(<StateView kind="error" title="No pudimos cargar" message="Revisa tu conexión." />);
      await screen.rerender(<StateView kind="loading" />);
      expect(screen.queryByText('Cargando')).toBeNull();

      await act(() => jest.advanceTimersByTime(300));
      expect(screen.getByText('Cargando')).toBeOnTheScreen();
    });
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it('title and sentence are at least 4.5:1 on the card', () => {
      for (const text of [stateViewColors.title, stateViewColors.message]) {
        expect(contrastRatio(c[text], c[stateViewColors.background])).toBeGreaterThanOrEqual(4.5);
      }
    });

    it.each(states.map(([kind]) => kind))('%s icon is at least 4.5:1 on its ring', (kind) => {
      const { ring, icon } = stateViewColors.kinds[kind];
      expect(contrastRatio(c[icon], c[ring])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
