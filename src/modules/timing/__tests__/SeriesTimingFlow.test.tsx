import { impactAsync } from 'expo-haptics';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import {
  createInMemoryMeasurementRepository,
  createInMemorySeriesRepository,
  SeriesTimingFlow,
  type Measurement,
  type SeriesRepository,
  type SeriesTimingFlowProps,
} from '..';

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

const setup = async (over: Partial<SeriesTimingFlowProps> = {}, seed?: (series: SeriesRepository) => Promise<void>) => {
  const measurements = createInMemoryMeasurementRepository();
  const series = createInMemorySeriesRepository(measurements);
  await seed?.(series);
  const openSpy = jest.spyOn(series, 'open');
  const onExit = jest.fn();
  clock = 10n * second;
  await render(
    <ThemeProvider>
      <SeriesTimingFlow
        subtitle="Escuela Delfines"
        schoolId="school-1"
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
  await screen.findByRole('header', { name: 'Serie 1 · Libre 50 m' });
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

    expect(screen.getAllByText('Esperando llegada…', { includeHiddenElements: true })).toHaveLength(2);
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

    expect(screen.getByRole('button', { name: /Terminar y asignar/ })).toBeDisabled();
  });

  it('assigns the names to the arrivals and saves the series with its arrivals', async () => {
    const { measurements, openSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await arrive(3n);
    await press('Terminar y asignar');

    await press('Asignar a Ana M.');
    await press('Asignar a Cleo O.');
    await press('Guardar serie');

    expect(await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' })).toBeOnTheScreen();
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
    await press('Terminar y asignar');
    await press('Asignar a Ana M.');
    await press('Guardar serie');
    await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' });

    const [series] = openSpy.mock.calls[0]!;
    const [saved] = await measurements.listBySeries(series.id);

    expect(series).toMatchObject({ createdBy: 'coach-1', schoolId: 'school-1', deviceId: 'device-1', ...event, sessionType: 'training' });
    expect(saved).toMatchObject({
      kind: 'repetition',
      seriesId: series.id,
      source: 'screen_button',
      createdBy: 'coach-1',
      schoolId: 'school-1',
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
    await press('Terminar y asignar');
    await press('Guardar serie');
    await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' });

    const [saved] = await measurements.listBySeries(openSpy.mock.calls[0]![0].id);

    expect(saved).toMatchObject({ kind: 'race', sessionType: 'competition' });
  });

  it('keeps an arrival without a name as "por asignar" instead of dropping it', async () => {
    const { measurements, openSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await arrive(3n);
    await press('Terminar y asignar');
    await press('Asignar a Ana M.');

    await press('Guardar serie');
    await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' });

    const saved = await measurements.listBySeries(openSpy.mock.calls[0]![0].id);
    expect(saved.map((m) => m.athleteId)).toEqual(['a1', null]);
  });

  it('reopens a position to give it to another athlete', async () => {
    const { measurements, openSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await press('Terminar y asignar');
    await press('Asignar a Ana M.');

    await press(/^Ana M\.,? .*Posición 1/); // the assigned row reopens its position
    await press('Asignar a Cleo O.');
    await press('Guardar serie');
    await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' });

    const [saved] = await measurements.listBySeries(openSpy.mock.calls[0]![0].id);
    expect(saved?.athleteId).toBe('a3');
  });

  it('numbers the series of the visit and says when it started and when each arrival happened', async () => {
    await setup();
    await startSeries();
    expect(screen.getByText('Reloj de la serie')).toBeOnTheScreen();
    await press('Llegada');
    await arrive(31n);

    expect(screen.getByText(/^Reloj de la serie · salida a las \d{1,2}:\d{2}:\d{2}$/)).toBeOnTheScreen();
    expect(screen.getByText(/^\d{1,2}:\d{2}:\d{2} · sin asignar$/, { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Entrenamiento · 2 nadadores en el agua')).toBeOnTheScreen();
    expect(screen.getByText('Siguiente: 2.º puesto')).toBeOnTheScreen();
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

    expect(screen.getByRole('header', { name: 'Serie 1 · Libre 50 m' })).toBeOnTheScreen();
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
        { arrivalPosition: 1, hundredths: 3100, athleteId: null, source: 'screen_button', createdBy: 'coach-1', schoolId: 'school-1', deviceId: 'device-1', kind: 'repetition' },
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
      await press('Terminar y asignar');
      await press('Asignar a Ana M.');

      await press('Guardar serie');
      await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' });

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
      await press('Terminar y asignar');
      await press('Asignar a Ana M.');

      await press('Guardar serie');
      await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' });

      expect(series.discardArrival).toHaveBeenCalledTimes(2);
      expect((await measurements.listBySeries(seriesOf(openSpy))).map((m) => m.arrivalPosition)).toEqual([1]);
    });

    it('is ready for the next series right after saving, without going through the setup', async () => {
      const { measurements, openSpy } = await setup();
      await startSeries();
      await press('Llegada');
      await arrive(31n);
      await press('Terminar y asignar');
      await press('Asignar a Ana M.');

      await press('Guardar serie');

      expect(await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' })).toBeOnTheScreen();
      expect(screen.getAllByText('Esperando llegada…', { includeHiddenElements: true })).toHaveLength(2);
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
      expect(screen.getAllByLabelText(/, En el teléfono$/)).toHaveLength(2);
      expect(screen.getByLabelText('2 en el teléfono')).toBeOnTheScreen();

      mockSyncStates.mockImplementation((_table, ids) => new Map(ids.map((id) => [id, 'synced'])));
      await arrive(1n);

      expect(screen.getAllByLabelText(/, Enviado$/)).toHaveLength(3);
      expect(screen.queryByLabelText(/en el teléfono$/)).toBeNull();
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

  describe('naming the arrivals', () => {
    const seriesOf = (openSpy: jest.SpyInstance) => openSpy.mock.calls[0]![0].id as string;
    const positionsOf = async (measurements: { listBySeries(id: string): Promise<Measurement[]> }, id: string) =>
      (await measurements.listBySeries(id)).map((m) => [m.arrivalPosition, m.athleteId]);

    // Two arrivals, already on the phone, then the naming screen.
    async function nameTwo(over: Partial<SeriesTimingFlowProps> = {}) {
      const result = await setup(over);
      await startSeries();
      await press('Llegada');
      await arrive(31n);
      await arrive(3n);
      await press('Terminar y asignar');
      await screen.findByRole('header', { name: '¿Quién llegó en cada puesto?' });
      return result;
    }

    it('writes each name the moment its card is tapped, with the device, before leaving', async () => {
      const { measurements, series, openSpy } = await nameTwo();
      const assign = jest.spyOn(series, 'assign');

      await press('Asignar a Ana M.');

      await waitFor(async () => expect(await positionsOf(measurements, seriesOf(openSpy))).toEqual([[1, 'a1'], [2, null]]));
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign.mock.calls[0]![1]).toEqual({ deviceId: 'device-1' });
      expect(screen.getByLabelText('Ana M., en la posición 1')).toBeOnTheScreen();
    });

    it('leaves the unnamed positions "por asignar" on the phone when leaving, and offers them at the next setup', async () => {
      const { measurements, openSpy } = await nameTwo();
      await press('Asignar a Ana M.');

      await press('Guardar serie');
      await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' });
      await press('Volver');

      expect(await screen.findByText('1 llegada sin nombre de Libre 50 m · Entrenamiento.')).toBeOnTheScreen();
      expect(await positionsOf(measurements, seriesOf(openSpy))).toEqual([[1, 'a1'], [2, null]]);
    });

    it('takes the arrivals up again in another session and names them', async () => {
      const pendingSeries = { id: 'S-old', createdBy: 'coach-1', schoolId: 'school-1', deviceId: 'device-1', ...event, sessionType: 'training' } as const;
      const arrival = (id: string, position: number, hundredths: number | null) =>
        ({ id, kind: 'repetition', athleteId: null, seriesId: 'S-old', arrivalPosition: position, hundredths, ...event, sessionType: 'training', source: 'screen_button', createdBy: 'coach-1', schoolId: 'school-1', deviceId: 'device-1', capturedAt: '2026-10-25T08:00:00Z', parentId: null, version: 1, editedBy: null, editedAt: null, editReason: null }) as Measurement;
      const { measurements } = await setup({}, async (series) => {
        await series.open(pendingSeries, arrival('old-1', 1, 3100));
        await series.addArrival(arrival('old-2', 2, null));
      });
      await screen.findByText('Nadadores (2 de 3)');
      expect(await screen.findByText('2 llegadas sin nombre de Libre 50 m · Entrenamiento.')).toBeOnTheScreen();

      await press('Asignar nombres');
      await screen.findByRole('header', { name: '¿Quién llegó en cada puesto?' });
      // The arrival saved without a time reads as missing, never 0,00.
      expect(screen.queryByText(/0,00/)).toBeNull();
      await press('Asignar a Cleo O.');
      await press('Guardar serie');

      await waitFor(async () => expect(await positionsOf(measurements, 'S-old')).toEqual([[1, 'a3'], [2, null]]));
      // Back at the setup, what is still unnamed is still offered.
      expect(await screen.findByText('1 llegada sin nombre de Libre 50 m · Entrenamiento.')).toBeOnTheScreen();
    });

    it('shows each swimmer\'s personal best on the name cards, and nothing for one without', async () => {
      const loadBestTime = jest.fn(async (athleteId: string) => (athleteId === 'a1' ? 3100 : null));
      await nameTwo({ loadBestTime });

      expect(await screen.findByText('MP 31,00')).toBeOnTheScreen();
      expect(screen.getAllByText(/^MP /)).toHaveLength(1);
      expect(loadBestTime).toHaveBeenCalledWith('a1', { stroke: 'FR', distance: '50m', pool: 'SCM' });
    });

    it('names the series in the heading of the naming screen', async () => {
      await nameTwo();

      expect(screen.getByText('Serie 1 · Libre 50 m · toca un nombre para asignarlo al puesto marcado')).toBeOnTheScreen();
    });

    it('offers no arrival of another school for naming, and still offers the ones of the active school', async () => {
      const arrival = (id: string, seriesId: string, schoolId: string) =>
        ({ id, kind: 'repetition', athleteId: null, seriesId, arrivalPosition: 1, hundredths: 3100, ...event, sessionType: 'training', source: 'screen_button', createdBy: 'coach-1', schoolId, deviceId: 'device-1', capturedAt: '2026-10-25T08:00:00Z', parentId: null, version: 1, editedBy: null, editedAt: null, editReason: null }) as Measurement;
      const seriesOf = (id: string, schoolId: string) => ({ id, createdBy: 'coach-1', schoolId, deviceId: 'device-1', ...event, sessionType: 'training' }) as const;
      await setup({}, async (series) => {
        await series.open(seriesOf('S-other', 'school-2'), arrival('other-1', 'S-other', 'school-2'));
      });
      await screen.findByText('Nadadores (2 de 3)');
      expect(screen.queryByText(/sin nombre de/)).toBeNull();

      await screen.unmount();
      await setup({}, async (series) => {
        await series.open(seriesOf('S-other', 'school-2'), arrival('other-1', 'S-other', 'school-2'));
        await series.open(seriesOf('S-own', 'school-1'), arrival('own-1', 'S-own', 'school-1'));
      });
      expect(await screen.findByText('1 llegada sin nombre de Libre 50 m · Entrenamiento.')).toBeOnTheScreen();
    });

    it('offers nothing at the setup when no arrival is waiting', async () => {
      await setup();
      await screen.findByText('Nadadores (2 de 3)');

      expect(screen.queryByText(/sin nombre de/)).toBeNull();
    });

    it('reopens a named position to choose another card for it, and frees the first athlete', async () => {
      const { measurements, openSpy } = await nameTwo();
      await press('Asignar a Ana M.');
      await press(/^Ana M\.,? .*Posición 1/);

      await press('Asignar a Cleo O.');
      await press('Asignar a Ana M.');

      await waitFor(async () => expect(await positionsOf(measurements, seriesOf(openSpy))).toEqual([[1, 'a3'], [2, 'a1']]));
    });

    it('refuses an athlete another position holds, writing nothing', async () => {
      const { series } = await nameTwo();
      await press('Asignar a Ana M.');
      const assign = jest.spyOn(series, 'assign');

      // Her card now says where she is.
      await press('Ana M., en la posición 1');

      expect(assign).not.toHaveBeenCalled();
    });

    it('keeps the card free when its write fails, so it can be tapped again', async () => {
      const { measurements, series, openSpy } = await nameTwo();
      jest.spyOn(series, 'assign').mockRejectedValueOnce(new Error('disk full'));

      await press('Asignar a Ana M.');
      expect(await positionsOf(measurements, seriesOf(openSpy))).toEqual([[1, null], [2, null]]);
      // The position is not marked as named, and the coach is told.
      expect(screen.getByText('No pudimos guardar ese nombre. Toca la tarjeta de nuevo.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Asignar a Ana M.' })).toBeOnTheScreen();
      await press('Asignar a Ana M.');
      expect(screen.queryByText(/No pudimos guardar ese nombre/)).toBeNull();

      await waitFor(async () => expect(await positionsOf(measurements, seriesOf(openSpy))).toEqual([[1, 'a1'], [2, null]]));
    });

    it('shows the sync state of each arrival while naming', async () => {
      await nameTwo();
      expect(screen.getAllByLabelText(/, En el teléfono$/)).toHaveLength(2);

      mockSyncStates.mockImplementation((_table, ids) => new Map(ids.map((id) => [id, 'synced'])));
      await press('Asignar a Ana M.');

      expect(screen.getAllByLabelText(/, Enviado$/)).toHaveLength(2);
    });

    it('ends the capture: going back from the naming starts the next series', async () => {
      await nameTwo();

      await press('Volver');

      expect(await screen.findByRole('header', { name: 'Serie 2 · Libre 50 m' })).toBeOnTheScreen();
      expect(screen.getAllByText('Esperando llegada…', { includeHiddenElements: true })).toHaveLength(2);
    });
  });

  it('writes a pending arrival only once when "Terminar y asignar" is tapped twice in a row', async () => {
    const { openSpy } = await setup();
    openSpy.mockRejectedValueOnce(new Error('disk full'));
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    const name = screen.getByRole('button', { name: /Terminar y asignar/ });

    await act(async () => {
      fireEvent.press(name);
      fireEvent.press(name);
    });

    await screen.findByRole('header', { name: '¿Quién llegó en cada puesto?' });
    expect(openSpy).toHaveBeenCalledTimes(2);
  });

  it('stays on the timing screen, without an unhandled rejection, when the arrivals cannot be written', async () => {
    const { openSpy } = await setup();
    openSpy.mockRejectedValue(new Error('disk full'));
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));

    await press('Terminar y asignar');

    expect(screen.getByRole('header', { name: 'Serie 1 · Libre 50 m' })).toBeOnTheScreen();
    expect(screen.getByText('No pudimos guardar las llegadas en este teléfono. Inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('tells the coach when the arrivals cannot be written, and lets them try again', async () => {
    const { measurements, openSpy } = await setup();
    openSpy.mockRejectedValueOnce(new Error('disk full')).mockRejectedValueOnce(new Error('disk full'));
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));

    await press('Terminar y asignar');
    expect(screen.getByText('No pudimos guardar las llegadas en este teléfono. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Terminar y asignar/ })).toBeEnabled();

    await press('Terminar y asignar');

    await screen.findByRole('header', { name: '¿Quién llegó en cada puesto?' });
    expect(await measurements.listBySeries(openSpy.mock.calls[2]![0].id)).toHaveLength(1);
    expect(screen.queryByText(/No pudimos guardar/)).toBeNull();
  });

  it('shows no pending notice when the list of pending arrivals cannot be read', async () => {
    const { series, onExit } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    jest.spyOn(series, 'listPending').mockRejectedValue(new Error('unreadable'));
    await startSeries();
    await press('Volver');

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
    expect(screen.queryByText(/sin nombre de/)).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('writes a pending arrival only once when the exit is confirmed twice in a row', async () => {
    const { openSpy } = await setup();
    openSpy.mockRejectedValueOnce(new Error('disk full'));
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    await press('Volver');
    const confirm = screen.getByRole('button', { name: 'Salir de la serie' });

    await act(async () => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });

    await screen.findByText('Nadadores (2 de 3)');
    expect(openSpy).toHaveBeenCalledTimes(2);
  });

  it('does not start when nobody is authorized', async () => {
    await setup({ loadRoster: async () => [roster[1]!] });
    await screen.findByText('Nadadores (0 de 1)');

    await press('Empezar toma');

    expect(screen.getByText('Nadadores (0 de 1)')).toBeOnTheScreen();
  });
});
