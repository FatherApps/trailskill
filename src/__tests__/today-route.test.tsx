import { render, screen } from '@testing-library/react-native';

import TodayRoute from '../app/(app)/today';

let mockStaff = false;
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
  TodayContainer: jest.requireActual('../modules/training-plans/screens/TodayContainer').TodayContainer,
  createPowerSyncAssignmentRepository: () => ({}),
  createPowerSyncFulfillmentRepository: () => ({}),
  createPowerSyncNoticeRepository: () => ({}),
  createPowerSyncTrainingPlanRepository: () => ({}),
}));
jest.mock('../modules/school-console', () => ({
  createPowerSyncStaffSchoolRepository: () => ({}),
  useStaffSchool: () => ({ status: mockStaff ? 'staff' : 'denied' }),
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ push: jest.fn() }) }));

describe('today route, athlete-less message', () => {
  it('leads a guardian or adult athlete to "Mis deportistas"', async () => {
    mockStaff = false;
    await render(<TodayRoute />);

    expect(await screen.findByText('Aún no hay un deportista vinculado')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ir a Mis deportistas' })).toBeOnTheScreen();
  });

  it('gives an admin or coach the same message without the action', async () => {
    mockStaff = true;
    await render(<TodayRoute />);

    expect(await screen.findByText('Aún no hay un deportista vinculado')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ir a Mis deportistas' })).toBeNull();
  });
});
