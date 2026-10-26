import { fireEvent, render, screen } from '@testing-library/react-native';
import { impactAsync } from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Dimensions, StyleSheet } from 'react-native';

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
      seriesNumber={2}
      eventTitle={seriesFixture.eventTitle}
      sessionLabel={seriesFixture.sessionLabel}
      elapsedHundredths={3700}
      arrivals={seriesFixture.arrivals}
      {...callbacks}
      {...props}
    />,
  );
  return { view, ...callbacks };
}

const setWidth = (width: number) => Dimensions.set({ window: { width, height: 844, scale: 1, fontScale: 1 }, screen: { width, height: 844, scale: 1, fontScale: 1 } });

// The jest window is a tablet; the phone design starts below the medium breakpoint.
const phone = () => setWidth(390);
afterEach(() => setWidth(750));

describe('SeriesTimingScreen', () => {
  it('shows the series, the event and the shared clock with the stopwatch treatment', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Serie 2 · Libre 50 m' })).toBeOnTheScreen();
    expect(screen.getByText('Entrenamiento · 4 nadadores en el agua')).toBeOnTheScreen();
    const clock = screen.getByText('0:37,00', hidden);
    expect(clock.props.adjustsFontSizeToFit).toBe(true);
    expect(clock.props.numberOfLines).toBe(1);
    expect(clock.props.maxFontSizeMultiplier).toBe(1.3);
    expect(StyleSheet.flatten(clock.props.style)?.fontVariant).toEqual(['tabular-nums']);
    expect(StyleSheet.flatten(clock.props.style)?.fontSize).toBe(72);
  });

  it('says when the series started and counts the arrivals against the swimmers in the water', async () => {
    await renderScreen({ startedAt: '7:14:02' });

    expect(screen.getByText('Reloj de la serie · salida a las 7:14:02')).toBeOnTheScreen();
    expect(screen.getByText('4 de 4')).toBeOnTheScreen();
  });

  it('keeps the series clock label without a start time before the first press', async () => {
    await renderScreen({ arrivals: [], elapsedHundredths: 0 });

    expect(screen.getByText('Reloj de la serie')).toBeOnTheScreen();
  });

  it('names no next position before the clock runs: the first press only starts it', async () => {
    await renderScreen({ arrivals: [], elapsedHundredths: 0 });
    expect(screen.queryByText(/Siguiente/)).toBeNull();
  });

  it('names the next position under the big button while the series runs', async () => {
    await renderScreen({ running: true });

    expect(screen.getByText('Siguiente: 5.º puesto')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Llegada' }).props.accessibilityHint).toBe('Toca cuando toque la pared');
  });

  it('counts the arrivals still on the phone in the header', async () => {
    await renderScreen({
      arrivals: [
        { id: 'a', time: 3100, syncState: 'on_device' },
        { id: 'b', time: 3400, syncState: 'synced' },
        { id: 'c', time: 3500, syncState: 'on_device' },
      ],
    });

    expect(screen.getByLabelText('2 en el teléfono')).toBeOnTheScreen();
  });

  it('shows no phone count when every arrival was sent', async () => {
    await renderScreen({ arrivals: [{ id: 'a', time: 3100, syncState: 'synced' }] });

    expect(screen.queryByLabelText(/en el teléfono$/)).toBeNull();
  });

  it('shows the wall-clock time of each arrival beside its position', async () => {
    await renderScreen({ arrivals: [{ id: 'a', time: 3105, clockTime: '7:14:33' }] });

    expect(screen.getByText('7:14:33 · sin asignar', hidden)).toBeOnTheScreen();
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

  it('shows the positions still to come and no undo without arrivals, keeping the Llegada button', async () => {
    await renderScreen({ arrivals: [], elapsedHundredths: 0 });

    expect(screen.getAllByText('Esperando llegada…', hidden)).toHaveLength(4);
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

  it('offers "Terminar y asignar" once there are arrivals', async () => {
    const { onAssignNames } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Terminar y asignar' }));

    expect(onAssignNames).toHaveBeenCalledTimes(1);
  });

  it('disables "Terminar y asignar" and says why while there are no arrivals', async () => {
    const { onAssignNames } = await renderScreen({ arrivals: [] });

    const button = screen.getByRole('button', { name: /Terminar y asignar/ });
    await fireEvent.press(button);

    expect(button).toBeDisabled();
    expect(screen.getByText('Terminar y asignar · Registra una llegada primero', hidden)).toBeOnTheScreen();
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

  it('reads the sync state of each arrival with its row and draws a pill only when it did not go through', async () => {
    await renderScreen({
      arrivals: [
        { id: 'arrival-1', time: 3100, syncState: 'on_device' },
        { id: 'arrival-2', time: 3400, syncState: 'synced' },
        { id: 'arrival-3', time: 3500, syncState: 'not_sent' },
      ],
    });

    expect(screen.getByLabelText('Llegada 1, 31 segundos, En el teléfono')).toBeOnTheScreen();
    expect(screen.getByLabelText('Llegada 2, 34 segundos, Enviado')).toBeOnTheScreen();
    // The row of the failed arrival and the header both say it.
    expect(screen.getAllByLabelText('No enviado', { exact: false })).not.toHaveLength(0);
  });

  it('shows no pill for an arrival without a known state', async () => {
    await renderScreen({ arrivals: [{ id: 'arrival-1', time: 3100 }] });

    expect(screen.queryByLabelText('En el teléfono')).toBeNull();
  });

  it('shows why the arrivals could not be named, in a notice that is read out', async () => {
    await renderScreen({ error: 'No pudimos guardar las llegadas en este teléfono. Inténtalo de nuevo.' });

    expect(screen.getByText('No pudimos guardar las llegadas en este teléfono. Inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('shows no notice without an error', async () => {
    await renderScreen();

    expect(screen.queryByText(/No pudimos guardar/)).toBeNull();
  });

  describe('on a phone', () => {
    beforeEach(phone);

    it('shows the series in a tag, the clock and the arrivals as pills', async () => {
      await renderScreen({ running: true });

      expect(screen.getByRole('header', { name: 'Serie 2 · Libre 50 m' })).toBeOnTheScreen();
      expect(screen.getByText('0:37,00', hidden)).toBeOnTheScreen();
      expect(screen.getByLabelText('1.º 31,05')).toBeOnTheScreen();
      expect(screen.getByText('4 de 4 llegadas')).toBeOnTheScreen();
      expect(screen.getByText('Siguiente: 5.º')).toBeOnTheScreen();
    });

    it('keeps every action of the tablet with the phone wording', async () => {
      const { onArrival, onUndoLast, onAssignNames, onBack } = await renderScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Llegada' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Deshacer' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Asignar nombres' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

      expect(onArrival).toHaveBeenCalledTimes(1);
      expect(onUndoLast).toHaveBeenCalledTimes(1);
      expect(onAssignNames).toHaveBeenCalledTimes(1);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('offers no undo and disables the assignment without arrivals', async () => {
      await renderScreen({ arrivals: [], elapsedHundredths: 0 });

      expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
      expect(screen.getByRole('button', { name: /Asignar nombres/ })).toBeDisabled();
    });
  });
});
