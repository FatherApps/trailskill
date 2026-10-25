import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { createInMemoryMeasurementRepository, createInMemorySeriesRepository, SeriesTimingFlow, type SeriesTimingFlowProps } from '..';

jest.mock('../../../core/sync', () => ({
  useRecordSyncStates: () => new Map(),
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
  const saveSpy = jest.spyOn(series, 'save');
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
  return { measurements, series, saveSpy, onExit };
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
    const { measurements, saveSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await arrive(3n);
    await press('Asignar nombres');

    await press('Asignar a Ana M.');
    await press('Asignar a Cleo O.');
    await press('Guardar serie');

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const saved = await measurements.listBySeries(saveSpy.mock.calls[0]![0].id);
    expect(saved.map((m) => [m.arrivalPosition, m.athleteId, m.hundredths])).toEqual([
      [1, 'a1', 3100],
      [2, 'a3', 3400],
    ]);
  });

  it('saves the event, the author, the device and the source with every arrival', async () => {
    const { measurements, saveSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await press('Asignar nombres');
    await press('Asignar a Ana M.');
    await press('Guardar serie');
    await screen.findByText('Nadadores (2 de 3)');

    const [series] = saveSpy.mock.calls[0]!;
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
    const { measurements, saveSpy } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await fireEvent.press(screen.getByRole('radio', { name: 'Competencia' }));
    await press('Empezar toma');
    await press('Llegada');
    await arrive(31n);
    await press('Asignar nombres');
    await press('Guardar serie');
    await screen.findByText('Nadadores (2 de 3)');

    const [saved] = await measurements.listBySeries(saveSpy.mock.calls[0]![0].id);

    expect(saved).toMatchObject({ kind: 'race', sessionType: 'competition' });
  });

  it('keeps an arrival without a name as "por asignar" instead of dropping it', async () => {
    const { measurements, saveSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await arrive(3n);
    await press('Asignar nombres');
    await press('Asignar a Ana M.');

    await press('Guardar serie');
    await screen.findByText('Nadadores (2 de 3)');

    const saved = await measurements.listBySeries(saveSpy.mock.calls[0]![0].id);
    expect(saved.map((m) => m.athleteId)).toEqual(['a1', null]);
  });

  it('reopens a position to give it to another athlete', async () => {
    const { measurements, saveSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);
    await press('Asignar nombres');
    await press('Asignar a Ana M.');

    await press(/^Ana M\.,? .*Posición 1/); // the assigned row reopens its position
    await press('Asignar a Cleo O.');
    await press('Guardar serie');
    await screen.findByText('Nadadores (2 de 3)');

    const [saved] = await measurements.listBySeries(saveSpy.mock.calls[0]![0].id);
    expect(saved?.athleteId).toBe('a3');
  });

  it('asks before leaving a series that already has arrivals, and goes back to the setup when confirmed', async () => {
    const { saveSpy } = await setup();
    await startSeries();
    await press('Llegada');
    await arrive(31n);

    await press('Volver');
    expect(await screen.findByText('¿Descartar la serie?')).toBeOnTheScreen();
    await press('Descartar serie');

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('goes back to the setup without asking when there are no arrivals', async () => {
    await setup();
    await startSeries();

    await press('Volver');

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
  });

  it('does not start when nobody is authorized', async () => {
    await setup({ loadRoster: async () => [roster[1]!] });
    await screen.findByText('Nadadores (0 de 1)');

    await press('Empezar toma');

    expect(screen.getByText('Nadadores (0 de 1)')).toBeOnTheScreen();
  });
});
