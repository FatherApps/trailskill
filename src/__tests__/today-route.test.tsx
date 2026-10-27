import { act, fireEvent, render, screen } from '@testing-library/react-native';

import TodayRoute from '../app/(app)/today';

const mockListStaffSchools = jest.fn();
jest.mock('../core/session', () => ({ useSession: () => ({ session: { user: { id: 'user-1' } } }) }));
// One date for every render, as the real summary keeps it until the next sync: a new one each render would look the role up again each time.
jest.mock('../core/sync', () => {
  const lastSyncedAt = new Date();
  return { db: {}, RecordSyncStatus: () => null, useGlobalSyncSummary: () => ({ lastSyncedAt, connection: 'connected' }) };
});
jest.mock('../core/sync/db', () => ({ db: {} }));
jest.mock('../modules/accounts', () => ({ createPowerSyncManagedAthleteRepository: () => ({}) }));
jest.mock('../modules/athletes', () => ({
  ...jest.requireActual('../modules/athletes'),
  createPowerSyncAthleteSchoolRepository: () => ({}),
  createPowerSyncSchoolAthleteRepository: () => ({}),
  useManagedAthletes: () => ({ status: 'ready', athletes: [] }),
}));
jest.mock('../modules/timing', () => ({ createPowerSyncSeriesRepository: () => ({}) }));
jest.mock('../modules/training-plans', () => {
  const mocked: Record<string, unknown> = {
    // The real container (it brings its own translations): the only thing `today.tsx` takes besides the repositories that open the database, which are replaced.
    ...jest.requireActual('../modules/training-plans/screens/TodayContainer'),
    createPowerSyncAssignmentRepository: () => ({}),
    createPowerSyncFulfillmentRepository: () => ({}),
    createPowerSyncNoticeRepository: () => ({}),
    createPowerSyncTrainingPlanRepository: () => ({}),
  };
  // A value `today.tsx` starts importing from the module and this mock lacks would otherwise be `undefined`: "not a function" or an empty render. Fail naming the import.
  return new Proxy(mocked, {
    get: (target, name) => {
      // `toJSON` and `asymmetricMatch` are what Jest's printing and matchers probe; they are not imports of `today.tsx`. `default` is not probed by the interop (the mock sets no `__esModule`), so a default import fails naming the module.
      if (typeof name === 'symbol' || name in target || ['__esModule', 'then', 'toJSON', 'asymmetricMatch'].includes(name)) return target[name as string];
      throw new Error(`today.tsx imports "${name}" from the training-plans module, but today-route.test does not mock it. Add it to the jest.mock('../modules/training-plans') factory.`);
    },
  });
});
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  createPowerSyncStaffSchoolRepository: () => ({ listStaffSchools: (...args: unknown[]) => mockListStaffSchools(...args) }),
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ push: jest.fn() }) }));

const school = { id: 's1', name: 'Escuela Delfines' };
const MESSAGE = 'Aún no hay un deportista vinculado';
const ACTION = { name: 'Ir a Mis deportistas' };

describe('training-plans mock', () => {
  it('answers undefined to what the tooling probes and names the module and the import for the rest', () => {
    const mocked = jest.requireMock('../modules/training-plans');

    expect(mocked.toJSON).toBeUndefined();
    expect(mocked.asymmetricMatch).toBeUndefined();
    expect(() => mocked.default).toThrow('"default" from the training-plans module');
    expect(() => mocked.createPowerSyncMissingRepository).toThrow('"createPowerSyncMissingRepository" from the training-plans module');
  });
});

describe('today route, athlete-less message', () => {
  beforeEach(() => mockListStaffSchools.mockReset().mockResolvedValue([]));

  it('leads a guardian or adult athlete to "Mis deportistas"', async () => {
    await render(<TodayRoute />);

    expect(await screen.findByText(MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole('button', ACTION)).toBeOnTheScreen();
  });

  it('gives an admin or coach the same message without the action', async () => {
    mockListStaffSchools.mockResolvedValue([school]);
    await render(<TodayRoute />);

    expect(await screen.findByText(MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByRole('button', ACTION)).toBeNull();
  });

  it('waits for the role: loading first, then the message with its action, never the message without an exit', async () => {
    let answer!: (schools: unknown[]) => void;
    mockListStaffSchools.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await render(<TodayRoute />);

    expect(await screen.findByTestId('state-view')).toBeOnTheScreen();
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(screen.queryByRole('button', ACTION)).toBeNull();

    await act(async () => answer([]));

    expect(await screen.findByText(MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole('button', ACTION)).toBeOnTheScreen();
  });

  it('shows the error view with a retry, not the message with its action, when the role lookup fails', async () => {
    mockListStaffSchools.mockRejectedValue(new Error('db'));
    await render(<TodayRoute />);

    expect(await screen.findByText('No pudimos cargar el plan de hoy')).toBeOnTheScreen();
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(screen.queryByRole('button', ACTION)).toBeNull();
  });

  it('looks up the role again on "Intentar de nuevo" and leaves the error view', async () => {
    mockListStaffSchools.mockRejectedValueOnce(new Error('db')).mockResolvedValue([]);
    await render(<TodayRoute />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Intentar de nuevo' }));

    expect(mockListStaffSchools).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole('button', ACTION)).toBeOnTheScreen();
  });
});
