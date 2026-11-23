import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeProvider } from '../../../core/theme';
import {
  CompletedFlow,
  createInMemoryMeasurementRepository,
  createInMemorySeriesRepository,
  createInMemorySessionSetupRepository,
  IndividualTimingFlow,
  SeriesTimingFlow,
  type RosterAthlete,
} from '..';

jest.mock('../../../core/sync', () => ({
  useRecordSyncStates: () => new Map(),
  retryFailedRecord: jest.fn(),
  writeBatch: jest.fn(),
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
let mockId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockId}` }));

// Synthetic data only. Ben was given up by the school (#1436): the roster loader marks him as not authorized, for the reason `ended`.
const active: RosterAthlete[] = [
  { id: 'a1', shortName: 'Ana M.', initials: 'AM', color: 'athlete-1', authorized: true },
  { id: 'a2', shortName: 'Ben A.', initials: 'BA', color: 'athlete-2', authorized: true },
  { id: 'a3', shortName: 'Cleo O.', initials: 'CO', color: 'athlete-3', authorized: true },
];
const endOf = (rows: RosterAthlete[], id: string): RosterAthlete[] =>
  rows.map((a) => (a.id === id ? { ...a, authorized: false, skipReason: 'ended' as const } : a));
const withBenEnded = endOf(active, 'a2');

const second = 1_000_000_000n;
let clock: bigint;
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const MESSAGE = 'Este nadador fue dado de baja: el tiempo no se puede guardar. Asígnalo a otro nadador o descártalo.';

const press0 = (name: string) => fireEvent.press(screen.getByRole('switch', { name }));
const wrap = (flow: ReactElement) => <ThemeProvider>{flow}</ThemeProvider>;
const common = { subtitle: 'Escuela Delfines', schoolId: 'school-1', userId: 'coach-1', deviceId: 'device-1', now: () => clock, onExit: jest.fn() };

beforeEach(() => {
  clock = 10n * second;
});

describe('setup with an ended swimmer', () => {
  const individual = (loadRoster: () => Promise<RosterAthlete[]>, setups = createInMemorySessionSetupRepository(), measurements = createInMemoryMeasurementRepository()) =>
    wrap(<IndividualTimingFlow {...common} loadRoster={loadRoster} measurements={measurements} setups={setups} />);

  it('lists him as «Dado de baja», in place of the missing-authorization text, and leaves him out of the count', async () => {
    await render(individual(async () => withBenEnded));

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
    expect(screen.getByText('Dado de baja', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText('Falta autorización — se omitirá', { includeHiddenElements: true })).toBeNull();
  });

  it('does not offer him in the picker of individual timing', async () => {
    await render(individual(async () => withBenEnded));
    await screen.findByText('Nadadores (2 de 3)');

    await press('Elegir');

    expect(screen.getByRole('button', { name: '1 · Ana M.' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Ben A\./ })).toBeNull();
  });

  it('drops him from a saved setup that included him', async () => {
    const setups = createInMemorySessionSetupRepository();
    await render(individual(async () => active, setups));
    await screen.findByText('Nadadores (3 de 3)');
    await press('Elegir');
    await press('3 · Cleo O.');
    await press('Listo');
    await screen.findByText('Nadadores (2 de 3)');
    await screen.unmount();

    await render(individual(async () => withBenEnded, setups));

    // Ana and Ben were saved; Ben was ended since, so only Ana is timed.
    expect(await screen.findByText('Nadadores (1 de 3)')).toBeOnTheScreen();
  });

  it('skips him when the baja reaches the device while the individual setup is open', async () => {
    const view = await render(individual(async () => active));
    await screen.findByText('Nadadores (3 de 3)');

    await view.rerender(individual(async () => withBenEnded));

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
  });
});

describe('individual timing, baja after the time started', () => {
  const flow = (loadRoster: () => Promise<RosterAthlete[]>, measurements = createInMemoryMeasurementRepository()) =>
    wrap(<IndividualTimingFlow {...common} loadRoster={loadRoster} measurements={measurements} />);

  it('does not write the stopped time, keeps it on screen with the message, and moves on after discarding it', async () => {
    const measurements = createInMemoryMeasurementRepository();
    const view = await render(flow(async () => active, measurements));
    await screen.findByText('Nadadores (3 de 3)');
    await press('Empezar toma');
    // Ana first: time her, then Ben starts running.
    await press('Iniciar');
    clock += 31n * second;
    await press('Detener');
    await press('Guardar');
    await press('Iniciar');
    clock += 40n * second;
    await press('Detener');

    await view.rerender(flow(async () => withBenEnded, measurements));
    await screen.findByText('Dado de baja', { includeHiddenElements: true }).catch(() => undefined);
    await press('Guardar');

    expect(await screen.findByText(MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeOnTheScreen();
    expect((await measurements.listBySchool('school-1')).map((m) => m.athleteId)).toEqual(['a1']);

    await press('Descartar');

    // Cleo is next; Ben's turn passed and nothing was written for him.
    expect(await screen.findByText(/Cleo O\./)).toBeOnTheScreen();
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect((await measurements.listBySchool('school-1')).map((m) => m.athleteId)).toEqual(['a1']);
  });

  it('skips him at once when the baja arrives before his turn', async () => {
    const measurements = createInMemoryMeasurementRepository();
    const view = await render(flow(async () => active, measurements));
    await screen.findByText('Nadadores (3 de 3)');
    await press('Empezar toma');
    await press('Iniciar');
    clock += 31n * second;
    await press('Detener');

    await view.rerender(flow(async () => withBenEnded, measurements));
    await press('Guardar');

    expect(await screen.findByText(/Cleo O\./)).toBeOnTheScreen();
    expect(screen.queryByText(/Ben A\./)).toBeNull();
  });
});

describe('series timing, baja after the arrivals were taken', () => {
  const flow = (loadRoster: () => Promise<RosterAthlete[]>, series: ReturnType<typeof createInMemorySeriesRepository>) =>
    wrap(<SeriesTimingFlow {...common} loadRoster={loadRoster} series={series} />);

  it('lists him as «Dado de baja» and keeps him out of the lanes', async () => {
    const series = createInMemorySeriesRepository(createInMemoryMeasurementRepository());
    await render(flow(async () => withBenEnded, series));
    await screen.findByText('Nadadores (2 de 3)');

    expect(screen.getByText('Dado de baja', { includeHiddenElements: true })).toBeOnTheScreen();
    await press('Empezar toma');
    await screen.findByRole('header', { name: 'Serie 1 · Libre 50 m' });

    expect(screen.getAllByText('Esperando llegada…', { includeHiddenElements: true })).toHaveLength(2);
  });

  it('writes no name for him: the arrival stays with its time and the message, and goes to another swimmer', async () => {
    const measurements = createInMemoryMeasurementRepository();
    const series = createInMemorySeriesRepository(measurements);
    const openSpy = jest.spyOn(series, 'open');
    const view = await render(flow(async () => active, series));
    await screen.findByText('Nadadores (3 de 3)');
    await press('Empezar toma');
    await press('Llegada');
    clock += 31n * second;
    await press('Llegada');
    await press('Terminar y asignar');
    await screen.findByRole('button', { name: 'Asignar a Ben A.' });

    await view.rerender(flow(async () => withBenEnded, series));
    await screen.findByRole('button', { name: 'Asignar a Ben A.' });
    await press('Asignar a Ben A.');

    expect(await screen.findByText(MESSAGE)).toBeOnTheScreen();
    const seriesId = openSpy.mock.calls[0]![0].id;
    expect((await measurements.listBySeries(seriesId)).map((m) => [m.arrivalPosition, m.athleteId, m.hundredths])).toEqual([[1, null, 3100]]);

    await press('Asignar a Cleo O.');

    expect((await measurements.listBySeries(seriesId)).map((m) => m.athleteId)).toEqual(['a3']);
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });
});

describe('completed, baja after the setup', () => {
  it('writes no record for him and says why', async () => {
    const measurements = createInMemoryMeasurementRepository();
    const flow = (loadRoster: () => Promise<RosterAthlete[]>) => wrap(<CompletedFlow {...common} loadRoster={loadRoster} measurements={measurements} />);
    const view = await render(flow(async () => active));
    await screen.findByText('Nadadores (3 de 3)');
    await press('Empezar toma');
    await view.rerender(flow(async () => withBenEnded));

    await press0('Completado, Ben A.');

    expect(await screen.findByText(MESSAGE)).toBeOnTheScreen();
    expect(await measurements.listBySchool('school-1')).toEqual([]);
  });
});
