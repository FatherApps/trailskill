import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeRoute from '../app/(app)/home';

let mockSession: { user: { id: string; user_metadata?: Record<string, unknown> } } | null = { user: { id: 'user-1' } };
jest.mock('../core/session', () => ({ useSession: () => ({ session: mockSession }) }));

// syncState.ts reads PowerSync hooks the route does not call; only its pure recordSyncState runs here.
jest.mock('@powersync/react', () => ({ useQuery: jest.fn(), useStatus: jest.fn() }));
jest.mock('../core/sync/db', () => ({ db: {} }));

let mockSummary = { lastSyncedAt: new Date(0) as Date | null, pending: 0, failed: 0, uploading: false };
jest.mock('../core/sync', () => ({
  ...jest.requireActual('../core/sync/syncState'),
  db: {},
  useGlobalSyncSummary: () => mockSummary,
}));

let mockOwn: 'loading' | { managedCount: number; selfAthleteId: string | null; authorized: boolean } = { managedCount: 1, selfAthleteId: null, authorized: true };
jest.mock('../modules/accounts', () => ({
  createPowerSyncManagedAthleteRepository: () => ({}),
  createPowerSyncOwnAuthorizationEvidence: () => async () => true,
  providerAccountOf: jest.requireActual('../modules/accounts/screens/ProviderRegistrationContainer').providerAccountOf,
  useOwnLandingEvidence: () => mockOwn,
}));

let mockManaged: { id: string; firstName: string; lastName: string }[] = [{ id: 'a1', firstName: 'Lucía', lastName: 'R' }];
jest.mock('../modules/athletes', () => ({
  createPowerSyncAthleteSchoolRepository: () => ({}),
  createPowerSyncHistoryRepository: () => ({}),
  createPowerSyncSchoolAthleteRepository: () => ({}),
  useManagedAthletes: () => ({ status: 'ready', athletes: mockManaged }),
}));
jest.mock('../modules/school-console', () => ({ createPowerSyncSchoolNameRepository: () => ({}) }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

// The container has its own suite; here only what the route hands it.
jest.mock('../modules/training-plans', () => {
  const { Pressable, Text: Label } = jest.requireActual('react-native');
  return {
    createPowerSyncAssignmentRepository: () => ({}),
    createPowerSyncTrainingPlanRepository: () => ({}),
    HomeContainer: (props: { greetingName?: string; syncState: string; athletes: { id: string }[]; synced: boolean; onOpenToday: (id: string) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => props.onOpenToday(props.athletes[0]!.id)}>
        <Label>{`greeting=${props.greetingName}|sync=${props.syncState}|synced=${props.synced}|athletes=${props.athletes.map((a) => a.id)}`}</Label>
      </Pressable>
    ),
  };
});

describe('home route', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSession = { user: { id: 'user-1' } };
    mockSummary = { lastSyncedAt: new Date(0), pending: 0, failed: 0, uploading: false };
    mockOwn = { managedCount: 1, selfAthleteId: null, authorized: true };
    mockManaged = [{ id: 'a1', firstName: 'Lucía', lastName: 'R' }];
  });

  it('greets an adult athlete by the name of their own athlete', async () => {
    mockOwn = { managedCount: 1, selfAthleteId: 'a1', authorized: true };
    await render(<HomeRoute />);

    expect(screen.getByText(/^greeting=Lucía\|/)).toBeOnTheScreen();
  });

  it('greets a guardian by the name their sign-in provider gave', async () => {
    mockSession = { user: { id: 'user-1', user_metadata: { given_name: 'Paula', family_name: 'Gómez' } } };
    await render(<HomeRoute />);

    expect(screen.getByText(/^greeting=Paula\|/)).toBeOnTheScreen();
  });

  it('greets a guardian with no provider name without one', async () => {
    await render(<HomeRoute />);

    expect(screen.getByText(/^greeting=\|/)).toBeOnTheScreen();
  });

  it('hands the container the athletes the user manages and the sync state of the device', async () => {
    mockSummary = { lastSyncedAt: new Date(0), pending: 2, failed: 0, uploading: true };
    await render(<HomeRoute />);

    expect(screen.getByText(/\|sync=sending\|synced=true\|athletes=a1$/)).toBeOnTheScreen();
  });

  it('opens the plan of the day of that athlete', async () => {
    await render(<HomeRoute />);

    await fireEvent.press(screen.getByRole('button'));

    expect(mockPush).toHaveBeenCalledWith('/today?athlete=a1');
  });

  it('draws nothing without a session', async () => {
    mockSession = null;
    await render(<HomeRoute />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
