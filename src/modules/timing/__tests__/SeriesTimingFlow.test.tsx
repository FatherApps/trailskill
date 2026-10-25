import { impactAsync } from 'expo-haptics';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { createInMemoryMeasurementRepository, createInMemorySeriesRepository, SeriesTimingFlow, type SeriesTimingFlowProps } from '..';

const mockSyncStates = jest.fn((_table: string, _ids: string[]): Map<string, string> => new Map());
jest.mock('../../../core/sync', () => ({
  useRecordSyncStates: (table: string, ids: string[]) => mockSyncStates(table, ids),
  writeBatch: jest.fn(),
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
let mockId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockId}` }));

// Synthetic data only.
const roster = [
  { id: 'a1', shortName: 'Ana M.', initials: 'AM', color: 'athlete-1' as const, authorized: true },
  { id: 'a2', shortName: 'Ben A.', initials: 'BA', color: 'athlete-2' as const, authorized: false },
  { id: 'a3', shortName: 'Cleo O.', initials: 'CO', color: 'athlete-3' as const, authorized: true },
];

let clock: bigint;
const second = 1_000_000_000n;
const event = { stroke: 'FR', distance: '50m', pool: 'SCM' } as const;

const setup = async (over: Partial<SeriesTimingFlowProps> = {}) => {
  const measurements = createInMemoryMeasurementRepository();
  const series = createInMemorySeriesRepository(measurements);
  const openSpy = jest.spyOn(series, 'open');
  const onExit = jest.fn();
  clock = 10n * second;
  await render(
    <ThemeProvider>
      <SeriesTimingFlow
        subtitle="Escuela Delfines"
        loadRoster={async () => roster}
        series={series}
        userId="coach-1"
        deviceId="device-1"
        now={() => clock}
        onExit={onExit}
        {...over}
      />
    </ThemeProvider>,
  );
  return { measurements, series, openSpy, onExit };
};

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

async function startSeries() {
  await screen.findByText('Nadadores (2 de 3)');
  await press('Empezar toma');
  await screen.findByRole('header', { name: 'Serie · 2 nadadores' });
}

// The first press starts the shared clock; each later one is an arrival `seconds` after the previous.
async function arrive(seconds: bigint) {
  clock += seconds * second;
  await press('Llegada');
}

beforeEach(() => mockSyncStates.mockImplementation(() => new Map()));

describe('series timing flow', () => {
  it('sets up the event and starts a series with the authorized athletes only', async () => {
    await setup();
    await startSeries();

    expect(screen.getByText('Aún no hay llegadas')).toBeOnTheScreen();
  });

  it('leaves the flow from the setup back button', async () => {
    const { onExit } = await setup();
    await screen.findByText('Nadadores (2 de 3)');

    await press('Volver');

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('records the arrivals in order and undoes the last one', async () => {
    await setup();
    await startSeries();

    await press('Llegada'); // starts the clock
    await arrive(31n);
    await arrive(2n);
    await press('Deshacer última');

    expect(screen.getAllByLabelText(/^Llegada \d/)).toHaveLength(1);
  });

  it('does not offer to assign names before an arrival', async () => {
    await setup();
    await startSeries();

    expect(screen.getByRole('button', { name: /Asignar nombres/ })).toBeDisabled();
  });

  it('assigns the names to the arrivals and saves the series with its arrivals', async () => {
    const { measurements, openSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await arrive(3n);
    await press('Asignar nombres');

    await press('Asignar a Ana M.');
    await press('Asignar a Cleo O.');
    await press('Guardar serie');

    expect(await screen.findByRole('header', { name: 'Serie · 2 nadadores' })).toBeOnTheScreen();
    expect(openSpy).toHaveBeenCalledTimes(1);
    const saved = await measurements.listBySeries(openSpy.mock.calls[0]![0].id);
    expect(saved.map((m) => [m.arrivalPosition, m.athleteId, m.hundredths])).toEqual([
      [1, 'a1', 3100],
      [2, 'a3', 3400],
    ]);
  });

  it('saves the event, the author, the device and the source with every arrival', async () => {
    const { measurements, openSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await press('Asignar nombres');
    await press('Asignar a Ana M.');
    await press('Guardar serie');
    await screen.findByRole('header', { name: 'Serie · 2 nadadores' });

    const [series] = openSpy.mock.calls[0]!;
    const [saved] = await measurements.listBySeries(series.id);

    expect(series).toMatchObject({ createdBy: 'coach-1', deviceId: 'device-1', ...event, sessionType: 'training' });
    expect(saved).toMatchObject({
      kind: 'repetition',
      seriesId: series.id,
      source: 'screen_button',
      createdBy: 'coach-1',
      deviceId: 'device-1',
      ...event,
      sessionType: 'training',
      parentId: null,
    });
  });

  it('saves a competition series as races', async () => {
    const { measurements, openSpy } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await fireEvent.press(screen.getByRole('radio', { name: 'Competencia' }));
    await press('Empezar toma');
    await press('Llegada');
    await arrive(31n);
    await press('Asignar nombres');
    await press('Guardar serie');
    await screen.findByRole('header', { name: 'Serie · 2 nadadores' });

    const [saved] = await measurements.listBySeries(openSpy.mock.calls[0]![0].id);

    expect(saved).toMatchObject({ kind: 'race', sessionType: 'competition' });
  });

  it('keeps an arrival without a name as "por asignar" instead of dropping it', async () => {
    const { measurements, openSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await arrive(3n);
    await press('Asignar nombres');
    await press('Asignar a Ana M.');

    await press('Guardar serie');
    await screen.findByRole('header', { name: 'Serie · 2 nadadores' });

    const saved = await measurements.listBySeries(openSpy.mock.calls[0]![0].id);
    expect(saved.map((m) => m.athleteId)).toEqual(['a1', null]);
  });

  it('reopens a position to give it to another athlete', async () => {
    const { measurements, openSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await press('Asignar nombres');
    await press('Asignar a Ana M.');

    await press(/^Ana M\.,? .*Posición 1/); // the assigned row reopens its position
    await press('Asignar a Cleo O.');
    await press('Guardar serie');
    await screen.findByRole('header', { name: 'Serie · 2 nadadores' });

    const [saved] = await measurements.listBySeries(openSpy.mock.calls[0]![0].id);
    expect(saved?.athleteId).toBe('a3');
  });

  it('asks before leaving a series that already has arrivals, which stay on the phone as "por asignar"', async () => {
    const { measurements, openSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);

    await press('Volver');
    expect(await screen.findByText('¿Salir de la serie?')).toBeOnTheScreen();
    await press('Salir de la serie');

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
    const saved = await measurements.listBySeries(openSpy.mock.calls[0]![0].id);
    expect(saved.map((m) => [m.athleteId, m.hundredths])).toEqual([[null, 3100]]);
  });

  it('keeps timing when the exit is not confirmed', async () => {
    await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);

    await press('Volver');
    await press('Seguir midiendo');

    expect(screen.getByRole('header', { name: 'Serie · 2 nadadores' })).toBeOnTheScreen();
    expect(screen.queryByText('¿Salir de la serie?')).toBeNull();
  });

  it('goes back to the setup without asking when there are no arrivals', async () => {
    await setup();
    await startSeries();

    await press('Volver');

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
  });

  describe('arrivals saved as they come', () => {
    const seriesOf = (openSpy: jest.SpyInstance) => openSpy.mock.calls[0]![0].id as string;

    it('writes each arrival on the phone the moment it is pressed, before any name is assigned', async () => {
      const { measurements, openSpy } = await setup();
      await startSeries();
      await press('Llegada'); // starts the clock: nothing to save yet
      expect(openSpy).not.toHaveBeenCalled();

      await arrive(31n);
      await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
      const id = seriesOf(openSpy);
      expect(await measurements.listBySeries(id)).toMatchObject([
        { arrivalPosition: 1, hundredths: 3100, athleteId: null, source: 'screen_button', createdBy: 'coach-1', deviceId: 'device-1', kind: 'repetition' },
      ]);

      await arrive(3n);
      await waitFor(async () => expect(await measurements.listBySeries(id)).toHaveLength(2));
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect((await measurements.listBySeries(id)).map((m) => [m.arrivalPosition, m.hundredths])).toEqual([
        [1, 3100],
        [2, 3400],
      ]);
    });

    it('discards the undone arrival on the phone and keeps the others', async () => {
      const { measurements, openSpy } = await setup();
      await startSeries();
      await press('Llegada');
      await arrive(31n);
      await arrive(3n);
      await waitFor(async () => expect(await measurements.listBySeries(seriesOf(openSpy))).toHaveLength(2));

      await press('Deshacer última');

      await waitFor(async () => expect((await measurements.listBySeries(seriesOf(openSpy))).map((m) => m.arrivalPosition)).toEqual([1]));
    });

    it('takes the mark of each arrival at its touch, however late the screen renders', async () => {
      const { measurements, openSpy } = await setup();
      await startSeries();
      await press('Llegada');
      clock += 17n * second;
      const arrival = screen.getByRole('button', { name: 'Llegada' });
      await act(async () => {
        fireEvent.press(arrival);
        clock += 18n * second;
        fireEvent.press(arrival);
        clock += 5n * second;
      });

      await waitFor(async () => expect(await measurements.listBySeries(seriesOf(openSpy))).toHaveLength(2));
      expect((await measurements.listBySeries(seriesOf(openSpy))).map((m) => m.hundredths)).toEqual([1700, 3500]);
    });

    it('keeps an arrival whose write failed and writes it again when the series is saved', async () => {
      const { measurements, openSpy } = await setup();
      openSpy.mockRejectedValueOnce(new Error('disk full'));
      await startSeries();
      await press('Llegada');
      await arrive(31n);
      await arrive(3n);
      await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(2));
      await press('Asignar nombres');
      await press('Asignar a Ana M.');

      await press('Guardar serie');
      await screen.findByRole('header', { name: 'Serie · 2 nadadores' });

      const saved = await measurements.listBySeries(openSpy.mock.calls[1]![0].id);
      expect(saved.map((m) => [m.arrivalPosition, m.athleteId, m.hundredths])).toEqual([
        [1, 'a1', 3100],
        [2, null, 3400],
      ]);
    });

    it('writes an arrival whose write failed once more when the series is left', async () => {
      const { measurements, openSpy } = await setup();
      openSpy.mockRejectedValueOnce(new Error('disk full'));
      await startSeries();
      await press('Llegada');
      await arrive(31n);
      await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));

      await press('Volver');
      await press('Salir de la serie');
      await screen.findByText('Nadadores (2 de 3)');

      expect(openSpy).toHaveBeenCalledTimes(2);
      expect(await measurements.listBySeries(openSpy.mock.calls[1]![0].id)).toHaveLength(1);
    });

    it('discards again on save an arrival whose discard failed', async () => {
      const { measurements, series, openSpy } = await setup();
      jest.spyOn(series, 'discardArrival').mockRejectedValueOnce(new Error('disk full'));
      await startSeries();
      await press('Llegada');
      await arrive(31n);
      await arrive(3n);
      await press('Deshacer última');
      await waitFor(() => expect(series.discardArrival).toHaveBeenCalledTimes(1));
      await press('Asignar nombres');
      await press('Asignar a Ana M.');

      await press('Guardar serie');
      await screen.findByRole('header', { name: 'Serie · 2 nadadores' });

      expect(series.discardArrival).toHaveBeenCalledTimes(2);
      expect((await measurements.listBySeries(seriesOf(openSpy))).map((m) => m.arrivalPosition)).toEqual([1]);
    });

    it('is ready for the next series right after saving, without going through the setup', async () => {
      const { measurements, openSpy } = await setup();
      await startSeries();
      await press('Llegada');
      await arrive(31n);
      await press('Asignar nombres');
      await press('Asignar a Ana M.');

      await press('Guardar serie');

      expect(await screen.findByRole('header', { name: 'Serie · 2 nadadores' })).toBeOnTheScreen();
      expect(screen.getByText('Aún no hay llegadas')).toBeOnTheScreen();
      // The next series is a new one: its first press starts the clock and its arrivals belong to another series.
      await press('Llegada');
      await arrive(20n);
      await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(2));
      expect(openSpy.mock.calls[1]![0].id).not.toBe(seriesOf(openSpy));
      expect(await measurements.listBySeries(openSpy.mock.calls[1]![0].id)).toHaveLength(1);
      expect(await measurements.listBySeries(seriesOf(openSpy))).toHaveLength(1);
    });

    it('shows the sync state of each arrival, on the phone first and sent later', async () => {
      await setup();
      await startSeries();
      await press('Llegada');
      await arrive(31n);
      await arrive(3n);
      expect(screen.getAllByLabelText('En el teléfono')).toHaveLength(2);

      mockSyncStates.mockImplementation((_table, ids) => new Map(ids.map((id) => [id, 'synced'])));
      await arrive(1n);

      expect(screen.getAllByLabelText('Enviado')).toHaveLength(3);
    });

    it('keeps the screen awake and taps while timing', async () => {
      (impactAsync as jest.Mock).mockClear();
      (activateKeepAwakeAsync as jest.Mock).mockClear();
      await setup();
      await startSeries();
      expect(activateKeepAwakeAsync).not.toHaveBeenCalled();

      await press('Llegada');
      await arrive(31n);

      expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
      expect(impactAsync).toHaveBeenCalledTimes(2);
    });
  });

  it('does not start when nobody is authorized', async () => {
    await setup({ loadRoster: async () => [roster[1]!] });
    await screen.findByText('Nadadores (0 de 1)');

    await press('Empezar toma');

    expect(screen.getByText('Nadadores (0 de 1)')).toBeOnTheScreen();
  });
});
