import { act, render, screen } from '@testing-library/react-native';

import TodayRoute from '../app/(app)/today';

const mockListStaffSchools = jest.fn();
jest.mock('../core/session', () => ({ useSession: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.mock('../core/sync', () => ({ db: {}, RecordSyncStatus: () => null, useGlobalSyncSummary: () => ({ lastSyncedAt: new Date(), connection: 'connected' }) }));
jest.mock('../core/sync/db', () => ({ db: {} }));
jest.mock('../modules/accounts', () => ({ createPowerSyncManagedAthleteRepository: () => ({}) }));
jest.mock('../modules/athletes', () => ({
  ...jest.requireActual('../modules/athletes'),
  createPowerSyncAthleteSchoolRepository: () => ({}),
  createPowerSyncSchoolAthleteRepository: () => ({}),
  useManagedAthletes: () => ({ status: 'ready', athletes: [] }),
}));
jest.mock('../modules/timing', () => ({ createPowerSyncSeriesRepository: () => ({}) }));
jest.mock('../modules/training-plans', () => ({
  ...jest.requireActual('../modules/training-plans'),
  createPowerSyncAssignmentRepository: () => ({}),
  createPowerSyncFulfillmentRepository: () => ({}),
  createPowerSyncNoticeRepository: () => ({}),
  createPowerSyncTrainingPlanRepository: () => ({}),
}));
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  createPowerSyncStaffSchoolRepository: () => ({ listStaffSchools: (...args: unknown[]) => mockListStaffSchools(...args) }),
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ push: jest.fn() }) }));

const school = { id: 's1', name: 'Escuela Delfines' };
const MESSAGE = 'Aún no hay un deportista vinculado';
const ACTION = { name: 'Ir a Mis deportistas' };

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

  it.each(['a guardian or adult athlete', 'an admin or coach'])('keeps the action for %s when the role lookup fails: nobody is left without an exit', async () => {
    mockListStaffSchools.mockRejectedValue(new Error('db'));
    await render(<TodayRoute />);

    expect(await screen.findByText(MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole('button', ACTION)).toBeOnTheScreen();
  });
});
