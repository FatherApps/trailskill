import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import {
  CompletedFlow,
  createInMemoryMeasurementRepository,
  type CompletedFlowProps,
  type MeasurementRepository,
} from '..';

const mockSyncStates = jest.fn((_table: string, _ids: string[]) => new Map());
jest.mock('../../../core/sync', () => ({
  useRecordSyncStates: (table: string, ids: string[]) => mockSyncStates(table, ids),
  retryFailedRecord: jest.fn(),
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

const setup = async (over: Partial<CompletedFlowProps> = {}) => {
  const measurements = over.measurements ?? createInMemoryMeasurementRepository();
  const onExit = jest.fn();
  await render(
    <ThemeProvider>
      <CompletedFlow
        subtitle="Escuela Delfines"
        loadRoster={async () => roster}
        measurements={measurements}
        userId="coach-1"
        deviceId="device-1"
        onExit={onExit}
        {...over}
      />
    </ThemeProvider>,
  );
  await screen.findByText('Nadadores (2 de 3)');
  await fireEvent.press(screen.getByRole('button', { name: 'Empezar toma' }));
  return { measurements: measurements as ReturnType<typeof createInMemoryMeasurementRepository>, onExit };
};

const toggle = (name: string) => fireEvent.press(screen.getByRole('switch', { name: `Completado, ${name}` }));

describe('completed flow', () => {
  beforeEach(() => mockSyncStates.mockClear());

  it('lists the authorized athletes of the session with every switch off', async () => {
    await setup();

    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(screen.getByRole('switch', { name: 'Completado, Ana M.' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Completado, Cleo O.' })).not.toBeChecked();
    expect(screen.queryByRole('switch', { name: 'Completado, Ben A.' })).toBeNull();
  });

  it('marking writes a completed measurement with no time, its author, device and source', async () => {
    const { measurements } = await setup();

    await toggle('Ana M.');

    expect(await measurements.listByAthlete('a1')).toEqual([
      expect.objectContaining({
        kind: 'completed',
        hundredths: null,
        athleteId: 'a1',
        seriesId: null,
        stroke: 'FR',
        distance: '50m',
        pool: 'SCM',
        sessionType: 'training',
        source: 'screen_button',
        createdBy: 'coach-1',
        deviceId: 'device-1',
      }),
    ]);
    expect(await measurements.listByAthlete('a3')).toEqual([]);
    expect(screen.getByRole('switch', { name: 'Completado, Ana M.' })).toBeChecked();
    expect(screen.getAllByLabelText('Completado, sin tiempo', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('unmarking discards the measurement instead of deleting it, and marking again writes a new one', async () => {
    const { measurements } = await setup();
    const discard = jest.spyOn(measurements, 'discard');

    await toggle('Ana M.');
    const [first] = await measurements.listByAthlete('a1');
    await toggle('Ana M.');

    expect(discard).toHaveBeenCalledWith(first!.id, 'coach-1');
    expect(await measurements.listByAthlete('a1')).toEqual([]);
    expect(screen.getByRole('switch', { name: 'Completado, Ana M.' })).not.toBeChecked();

    await toggle('Ana M.');
    const [second] = await measurements.listByAthlete('a1');
    expect(second!.id).not.toBe(first!.id);
    expect(second).toMatchObject({ kind: 'completed', hundredths: null });
  });

  it('reads the sync state of the live completed measurements only', async () => {
    const { measurements } = await setup();
    await toggle('Ana M.');
    const [ana] = await measurements.listByAthlete('a1');

    expect(mockSyncStates).toHaveBeenLastCalledWith('measurements', [ana!.id]);

    await toggle('Ana M.');
    expect(mockSyncStates).toHaveBeenLastCalledWith('measurements', []);
  });

  it('shows the sync pill of a completed athlete', async () => {
    const { measurements } = await setup();
    mockSyncStates.mockImplementation((_table, ids) => new Map(ids.map((id) => [id, 'on_device' as const])));

    await toggle('Ana M.');

    expect(screen.getByText('En el teléfono', { includeHiddenElements: true })).toBeOnTheScreen();
    expect((await measurements.listByAthlete('a1'))).toHaveLength(1);
    mockSyncStates.mockImplementation(() => new Map());
  });

  it('keeps the switch off and says so when the phone cannot save', async () => {
    const failing: MeasurementRepository = { ...createInMemoryMeasurementRepository(), add: () => Promise.reject(new Error('disk full')) };
    await setup({ measurements: failing });

    await toggle('Ana M.');

    expect(screen.getByText('No pudimos guardar el cambio', { exact: false })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Completado, Ana M.' })).not.toBeChecked();
  });

  it('ignores a second tap on the same athlete while the first one is being saved', async () => {
    const repository = createInMemoryMeasurementRepository();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const add = repository.add;
    repository.add = async (measurement) => {
      await gate;
      return add(measurement);
    };
    await setup({ measurements: repository });

    // Both taps arrive before the first save finishes; each press opens its own act, which React reports as overlapping.
    const overlapping = jest.spyOn(console, 'error').mockImplementation(() => {});
    const switchOf = screen.getByRole('switch', { name: 'Completado, Ana M.' });
    await act(async () => {
      void fireEvent.press(switchOf);
      void fireEvent.press(switchOf);
      release();
    });
    overlapping.mockRestore();

    expect(await repository.listByAthlete('a1')).toHaveLength(1);
  });

  it('leaves the flow from Terminar', async () => {
    const { onExit } = await setup();

    await fireEvent.press(screen.getByRole('button', { name: 'Terminar' }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
