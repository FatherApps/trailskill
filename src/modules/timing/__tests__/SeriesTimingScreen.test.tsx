import { fireEvent, render, screen } from '@testing-library/react-native';
import { impactAsync } from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StyleSheet } from 'react-native';

import { SeriesTimingScreen } from '../screens/SeriesTimingScreen';
import { seriesFixture } from '../__fixtures__/series';

const hidden = { includeHiddenElements: true };

async function renderScreen(props: Partial<Parameters<typeof SeriesTimingScreen>[0]> = {}) {
  const callbacks = {
    onArrival: jest.fn(),
    onUndoLast: jest.fn(),
    onAssignNames: jest.fn(),
    onBack: jest.fn(),
    onUseOnScreenStopwatch: jest.fn(),
  };
  const view = await render(
    <SeriesTimingScreen
      athleteCount={4}
      eventSubtitle={seriesFixture.eventSubtitle}
      elapsedHundredths={3700}
      arrivals={seriesFixture.arrivals}
      {...callbacks}
      {...props}
    />,
  );
  return { view, ...callbacks };
}

describe('SeriesTimingScreen', () => {
  it('shows the title, the event and the shared clock with the stopwatch treatment', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Serie · 4 nadadores' })).toBeOnTheScreen();
    expect(screen.getByText(seriesFixture.eventSubtitle)).toBeOnTheScreen();
    const clock = screen.getByText('0:37,00', hidden);
    expect(clock.props.adjustsFontSizeToFit).toBe(true);
    expect(clock.props.numberOfLines).toBe(1);
    expect(clock.props.maxFontSizeMultiplier).toBe(1.3);
    expect(StyleSheet.flatten(clock.props.style)?.fontVariant).toEqual(['tabular-nums']);
    expect(StyleSheet.flatten(clock.props.style)?.fontSize).toBe(72);
  });

  it('lists the arrivals in order below the clock', async () => {
    await renderScreen();

    const rows = screen.getAllByLabelText(/^Llegada \d/);
    expect(rows.map((row) => row.props.accessibilityLabel.slice(0, 10))).toEqual([
      'Llegada 1,',
      'Llegada 2,',
      'Llegada 3,',
      'Llegada 4,',
    ]);
    expect(screen.queryByText('Aún no hay llegadas')).toBeNull();
  });

  it('records an arrival from the big button', async () => {
    const { onArrival } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Llegada' }));

    expect(onArrival).toHaveBeenCalledTimes(1);
  });

  it('undoes the last arrival', async () => {
    const { onUndoLast } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Deshacer última' }));

    expect(onUndoLast).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state and no undo without arrivals, keeping the Llegada button', async () => {
    await renderScreen({ arrivals: [], elapsedHundredths: 0 });

    expect(screen.getByText('Aún no hay llegadas')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Deshacer última' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Llegada' })).toBeOnTheScreen();
  });

  it('warns politely when the external timer disconnects and offers the on-screen stopwatch', async () => {
    const { onUseOnScreenStopwatch } = await renderScreen({ externalTimerDisconnected: true });

    expect(screen.getByTestId('external-disconnected').props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('Cronómetro externo desconectado.', { exact: false })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Usar cronómetro en pantalla' }));
    expect(onUseOnScreenStopwatch).toHaveBeenCalledTimes(1);
  });

  it('shows no disconnection notice by default', async () => {
    await renderScreen();

    expect(screen.queryByTestId('external-disconnected')).toBeNull();
  });

  it('shows the offline notice and blocks nothing', async () => {
    const { onArrival } = await renderScreen({ offline: true });

    expect(screen.getByText('Sin conexión.', { exact: false })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Llegada' }));
    expect(onArrival).toHaveBeenCalledTimes(1);
  });

  it('goes back', async () => {
    const { onBack } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers "Asignar nombres" once there are arrivals', async () => {
    const { onAssignNames } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Asignar nombres' }));

    expect(onAssignNames).toHaveBeenCalledTimes(1);
  });

  it('disables "Asignar nombres" and says why while there are no arrivals', async () => {
    const { onAssignNames } = await renderScreen({ arrivals: [] });

    const button = screen.getByRole('button', { name: /Asignar nombres/ });
    await fireEvent.press(button);

    expect(button).toBeDisabled();
    expect(screen.getByText('Asignar nombres · Registra una llegada primero', hidden)).toBeOnTheScreen();
    expect(onAssignNames).not.toHaveBeenCalled();
  });

  it('gives a light haptic tap on each arrival and still reports it', async () => {
    (impactAsync as jest.Mock).mockClear();
    const { onArrival } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Llegada' }));

    expect(onArrival).toHaveBeenCalledTimes(1);
    expect(impactAsync).toHaveBeenCalledWith('light');
  });

  it('keeps the screen awake only while the series runs', async () => {
    (activateKeepAwakeAsync as jest.Mock).mockClear();
    (deactivateKeepAwake as jest.Mock).mockClear();
    const idle = await renderScreen();
    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
    await idle.view.unmount();

    const running = await renderScreen({ running: true });
    expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
    await running.view.unmount();
    expect(deactivateKeepAwake).toHaveBeenCalledTimes(1);
  });

  it('shows the sync state of each arrival beside its time, reachable apart from the row', async () => {
    await renderScreen({
      arrivals: [
        { id: 'arrival-1', time: 3100, syncState: 'on_device' },
        { id: 'arrival-2', time: 3400, syncState: 'synced' },
      ],
    });

    expect(screen.getByLabelText('En el teléfono')).toBeOnTheScreen();
    expect(screen.getByLabelText('Enviado')).toBeOnTheScreen();
  });

  it('shows no pill for an arrival without a known state', async () => {
    await renderScreen({ arrivals: [{ id: 'arrival-1', time: 3100 }] });

    expect(screen.queryByLabelText('En el teléfono')).toBeNull();
  });
});
