import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

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

afterEach(() => jest.restoreAllMocks());

describe('Stopwatch ready', () => {
  it('shows a missing time and a single full-width start button', async () => {
    const { onStart } = await renderWatch();

    expect(screen.getByText('—')).toBeOnTheScreen();
    expect(screen.queryByText(/0,00/)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('draws the time muted, centered, tabular, in time-display', async () => {
    await renderWatch();

    const style = styleOf(screen.getByText('—').props.style);
    expect(style).toMatchObject({ fontSize: 72, textAlign: 'center', fontVariant: ['tabular-nums'] });
  });
});

describe('Stopwatch running', () => {
  it('draws the time only from props', async () => {
    const view = await renderWatch({ state: 'running', elapsedHundredths: 3391 });
    expect(screen.getByText('33,91', hidden)).toBeOnTheScreen();

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
    expect(screen.queryByText('33,91', hidden)).toBeNull();
  });

  it('hides the running clock from screen readers and never makes it a live region', async () => {
    await renderWatch({ state: 'running', elapsedHundredths: 3391 });

    expect(screen.queryByText('33,91')).toBeNull();
    const clock = screen.getByText('33,91', hidden);
    expect(clock.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(clock.props.accessibilityElementsHidden).toBe(true);
    expect(clock.props.accessibilityLiveRegion).toBeUndefined();
  });

  it('announces the state, not the ticking clock', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
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
    expect(styleOf(screen.getByTestId('stopwatch-split-slot').props.style).flex).toBe(1);
    expect(styleOf(screen.getByTestId('stopwatch-stop-slot').props.style).flex).toBe(1.4);

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

    expect(screen.getByText('33,91')).toBeOnTheScreen();
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

  it('draws the delta slot after the personal best and nothing when it is absent', async () => {
    const { unmount } = await renderWatch({
      state: 'stopped',
      elapsedHundredths: 3391,
      bestTime: 3482,
      pbDelta: <Text>delta slot</Text>,
    });
    const row = screen.getByText('MP 34,82').parent!;
    expect(row.children.map((child) => (typeof child === 'string' ? child : child.props.children))).toEqual([
      'MP 34,82',
      'delta slot',
    ]);
    expect(styleOf(row.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 });

    await unmount();
    await renderWatch({ state: 'stopped', elapsedHundredths: 3391, bestTime: 3482 });
    expect(screen.queryByText('delta slot')).toBeNull();
  });

  it('announces the final time once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await renderWatch({ state: 'stopped', elapsedHundredths: 3391 });

    expect(announce).toHaveBeenCalledWith('Tiempo detenido: 33,91');
  });
});
