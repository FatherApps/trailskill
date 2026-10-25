import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, PixelRatio, StyleSheet } from 'react-native';

import { colors, ThemeProvider } from '../../../core/theme';
import { Stopwatch } from '../components/Stopwatch';

type Props = Parameters<typeof Stopwatch>[0];

async function renderWatch(props: Partial<Props> = {}) {
  const callbacks = {
    onStart: jest.fn(),
    onSplit: jest.fn(),
    onStop: jest.fn(),
    onSave: jest.fn(),
    onDiscard: jest.fn(),
  };
  const view = await render(<Stopwatch elapsedHundredths={0} state="ready" {...callbacks} {...props} />);
  return { ...view, ...callbacks };
}

const hidden = { includeHiddenElements: true };
const styleOf = (element: Parameters<typeof StyleSheet.flatten>[0]) => StyleSheet.flatten(element);

// Jest reports a system font scale of 2: pin 1 so the layout only depends on the theme scale under test.
beforeEach(() => jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1));
afterEach(() => jest.restoreAllMocks());

describe('Stopwatch ready', () => {
  it('shows the zero clock and a single full-width start button', async () => {
    const { onStart } = await renderWatch();

    expect(screen.getByText('0:00,00')).toBeOnTheScreen();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('draws the time muted, centered, tabular, in time-display', async () => {
    await renderWatch();

    const style = styleOf(screen.getByText('0:00,00').props.style);
    expect(style).toMatchObject({ fontSize: 72, textAlign: 'center', fontVariant: ['tabular-nums'], color: colors.light['ink-muted'] });
  });

  it('fits the clock on one line and leaves every other text unlimited', async () => {
    await renderWatch({ state: 'stopped', elapsedHundredths: 3391, bestTime: 3482 });

    const clock = screen.getByTestId('stopwatch-time');
    expect(clock.props.maxFontSizeMultiplier).toBe(1.3);
    expect(clock.props.adjustsFontSizeToFit).toBe(true);
    expect(clock.props.numberOfLines).toBe(1);
    const others = screen.container.queryAll((node) => node.type === 'Text' && node.props.testID !== 'stopwatch-time');
    expect(others.length).toBeGreaterThan(0);
    for (const text of others) {
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
      expect(text.props.adjustsFontSizeToFit).toBeUndefined();
      expect(text.props.numberOfLines).toBeUndefined();
    }
  });
});

describe('Stopwatch running', () => {
  it('draws the time only from props', async () => {
    const view = await renderWatch({ state: 'running', elapsedHundredths: 3391 });
    expect(screen.getByText('0:33,91', hidden)).toBeOnTheScreen();

    await view.rerender(
      <Stopwatch
        state="running"
        elapsedHundredths={6123}
        onStart={view.onStart}
        onSplit={view.onSplit}
        onStop={view.onStop}
        onSave={view.onSave}
        onDiscard={view.onDiscard}
      />,
    );

    expect(screen.getByText('1:01,23', hidden)).toBeOnTheScreen();
    expect(screen.queryByText('0:33,91', hidden)).toBeNull();
  });

  it('hides the running clock from screen readers and never makes it a live region', async () => {
    await renderWatch({ state: 'running', elapsedHundredths: 3391 });

    expect(screen.queryByText('0:33,91')).toBeNull();
    const clock = screen.getByText('0:33,91', hidden);
    expect(clock.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(clock.props.accessibilityElementsHidden).toBe(true);
    expect(clock.props.accessibilityLiveRegion).toBeUndefined();
  });

  it('announces the state, not the ticking clock', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    // The RN jest setup already mocks it, so calls from earlier tests would otherwise leak in.
    announce.mockClear();
    const view = await renderWatch({ state: 'running', elapsedHundredths: 100 });
    const afterMount = announce.mock.calls.length;

    await view.rerender(
      <Stopwatch
        state="running"
        elapsedHundredths={200}
        onStart={view.onStart}
        onSplit={view.onSplit}
        onStop={view.onStop}
        onSave={view.onSave}
        onDiscard={view.onDiscard}
      />,
    );

    expect(announce).toHaveBeenCalledWith('Cronómetro en marcha');
    expect(announce.mock.calls).toHaveLength(afterMount);
    expect(announce.mock.calls.every(([message]) => message === 'Cronómetro en marcha')).toBe(true);
  });

  it('offers split and stop, split narrower than stop (1 : 1.4)', async () => {
    const { onSplit, onStop } = await renderWatch({ state: 'running', elapsedHundredths: 3391 });

    expect(screen.queryByRole('button', { name: 'Iniciar' })).toBeNull();
    expect(styleOf(screen.getByTestId('stopwatch-split-slot').props.style)?.flex).toBe(1);
    expect(styleOf(screen.getByTestId('stopwatch-stop-slot').props.style)?.flex).toBe(1.4);

    await fireEvent.press(screen.getByRole('button', { name: 'Parcial' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Detener' }));
    expect(onSplit).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('lists the splits as rows with the label and the time', async () => {
    await renderWatch({
      state: 'running',
      elapsedHundredths: 3391,
      splits: [
        { label: '25 m', value: 1640 },
        { label: '50 m', value: 3391 },
      ],
    });

    expect(screen.getByText('25 m · 16,40')).toBeOnTheScreen();
    expect(screen.getByText('50 m · 33,91')).toBeOnTheScreen();
  });
});

describe('Stopwatch stopped', () => {
  it('shows the final time, the personal best and the discard and save actions', async () => {
    const { onDiscard, onSave } = await renderWatch({
      state: 'stopped',
      elapsedHundredths: 3391,
      bestTime: 3482,
    });

    expect(screen.getByText('0:33,91')).toBeOnTheScreen();
    expect(screen.getByText('MP 34,82')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Detener' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Descartar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows a missing personal best as a dash, never 0,00', async () => {
    await renderWatch({ state: 'stopped', elapsedHundredths: 3391, bestTime: null });

    expect(screen.getByText('MP —')).toBeOnTheScreen();
    expect(screen.queryByText(/0,00/)).toBeNull();
  });

  it('shows a missing personal best as a dash when the prop is absent', async () => {
    await renderWatch({ state: 'stopped', elapsedHundredths: 3391 });

    expect(screen.getByText('MP —')).toBeOnTheScreen();
  });

  it('faster than the personal best: shows the difference and the new MP tag, spoken', async () => {
    await renderWatch({ state: 'stopped', elapsedHundredths: 3391, bestTime: 3482 });

    expect(screen.getByText('−0,91 vs MP', hidden)).toBeOnTheScreen();
    expect(screen.getByText('MP', hidden)).toBeOnTheScreen();
    expect(screen.getByLabelText('91 centésimas menos que la marca personal. Marca personal')).toBeOnTheScreen();
    // The clock is printed once: the delta row does not repeat it.
    expect(screen.getAllByText('0:33,91', hidden)).toHaveLength(1);
  });

  it('wraps the personal best row instead of overflowing, centered and with its gap', async () => {
    await renderWatch({ state: 'stopped', elapsedHundredths: 3391, bestTime: 3482 });

    const caption = screen.getByText('MP 34,82');
    expect(styleOf(caption.parent!.props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    });
    expect(styleOf(caption.props.style)?.flexShrink).toBe(1);
  });

  it('slower than the personal best: shows the difference without the tag', async () => {
    await renderWatch({ state: 'stopped', elapsedHundredths: 3522, bestTime: 3482 });

    expect(screen.getByText('+0,40 vs MP', hidden)).toBeOnTheScreen();
    expect(screen.queryByText('MP', hidden)).toBeNull();
    expect(screen.getByLabelText('40 centésimas más que la marca personal')).toBeOnTheScreen();
  });

  it('without a personal best there is no difference', async () => {
    await renderWatch({ state: 'stopped', elapsedHundredths: 3391, bestTime: null });

    expect(screen.queryByText(/vs MP/, hidden)).toBeNull();
    expect(screen.queryByText('MP', hidden)).toBeNull();
  });

  it('announces the final time once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    // The RN jest setup already mocks it, so calls from earlier tests would otherwise leak in.
    announce.mockClear();
    await renderWatch({ state: 'stopped', elapsedHundredths: 3391 });

    expect(announce).toHaveBeenCalledWith('Tiempo detenido: 0:33,91');
  });
});

describe('Stopwatch stopped actions layout', () => {
  const props = { state: 'stopped', elapsedHundredths: 3391, bestTime: 3482 } as const;
  const noop = jest.fn();
  const handlers = { onStart: noop, onSplit: noop, onStop: noop, onSave: noop, onDiscard: noop };
  const order = () => {
    const tree = JSON.stringify(screen.toJSON());
    return tree.indexOf('"Guardar"') < tree.indexOf('"Descartar"') ? 'save-first' : 'discard-first';
  };

  it('keeps the 1 : 1.4 row at normal text size, Descartar first', async () => {
    await renderWatch(props);

    expect(styleOf(screen.getByTestId('stopwatch-stopped-actions').props.style)).toMatchObject({ flexDirection: 'row' });
    expect(order()).toBe('discard-first');
  });

  it('stacks the buttons full width with Guardar on top at a combined scale of 1.5 or more', async () => {
    await render(
      <ThemeProvider fontScale={2}>
        <Stopwatch elapsedHundredths={3391} state="stopped" bestTime={3482} {...handlers} />
      </ThemeProvider>,
    );

    expect(styleOf(screen.getByTestId('stopwatch-stopped-actions').props.style)?.flexDirection).toBe('column');
    expect(order()).toBe('save-first');
  });

  it('also stacks when only the system font scale is large', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.5);
    await renderWatch(props);

    expect(styleOf(screen.getByTestId('stopwatch-stopped-actions').props.style)?.flexDirection).toBe('column');
  });

  it('keeps the row just below the threshold', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.4);
    await renderWatch(props);

    expect(styleOf(screen.getByTestId('stopwatch-stopped-actions').props.style)?.flexDirection).toBe('row');
  });
});
