import { act, render, screen } from '@testing-library/react-native';

import FulfillmentRoute from '../app/(app)/plans/fulfillment';

let mockUserId: string | undefined;
let mockParams: { assignment?: string; day?: string } = {};
let mockClientId: () => Promise<string>;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({ db: { getClientId: () => mockClientId() } }));
jest.mock('../modules/school-console', () => ({
  createPowerSyncSchoolStructureRepository: () => ({}),
  createPowerSyncStaffSchoolRepository: () => ({}),
}));
jest.mock('../modules/athletes', () => ({ createPowerSyncSchoolAthleteRepository: () => ({}) }));
jest.mock('../modules/accounts', () => ({ createPowerSyncAuthorizationStatusRepository: () => ({}) }));
jest.mock('../modules/timing', () => ({ createPowerSyncSeriesRepository: () => ({}) }));
type ContainerProps = { userId: string; deviceId: string; assignmentId: string; day: string; refreshKey: number; onOpenTiming: (blockId: string) => void };
let mockProps: ContainerProps;
jest.mock('../modules/training-plans', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    createPowerSyncTrainingPlanRepository: () => ({}),
    createPowerSyncAssignmentRepository: () => ({}),
    createPowerSyncFulfillmentRepository: () => ({}),
    FulfillmentContainer: (props: ContainerProps) => {
      mockProps = props;
      return <Text>{`grid of ${props.assignmentId} on ${props.day} by ${props.userId} on ${props.deviceId} (${props.refreshKey})`}</Text>;
    },
  };
});
const mockPush = jest.fn();
let mockFocus: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
  // Runs once on mount, as a focus does; the test fires it again to simulate coming back to the screen.
  useFocusEffect: (effect: () => void) => {
    mockFocus = effect;
    jest.requireActual('react').useEffect(effect, []);
  },
}));

beforeEach(() => {
  mockUserId = 'user-1';
  mockParams = { assignment: 'assignment-1', day: '2026-11-16' };
  mockClientId = () => Promise.resolve('device-1');
  mockPush.mockReset();
  mockFocus = undefined;
});

describe('plans/fulfillment route', () => {
  it('opens the grid of the assignment and day of the URL for the signed-in user on this device', async () => {
    await render(<FulfillmentRoute />);

    expect(await screen.findByText(/^grid of assignment-1 on 2026-11-16 by user-1 on device-1/)).toBeOnTheScreen();
  });

  it('shows nothing while the device is unknown, and when its lookup fails', async () => {
    mockClientId = () => Promise.reject(new Error('db'));
    await render(<FulfillmentRoute />);

    expect(screen.queryByText(/grid of/)).toBeNull();
  });

  it.each([
    ['without a session', () => { mockUserId = undefined; }],
    ['without an assignment', () => { mockParams = { day: '2026-11-16' }; }],
    ['without a day', () => { mockParams = { assignment: 'assignment-1' }; }],
  ])('shows nothing %s', async (_name, arrange) => {
    arrange();
    await render(<FulfillmentRoute />);
    await act(async () => {});

    expect(screen.queryByText(/grid of/)).toBeNull();
  });

  it('opens the series timing from a block that records times', async () => {
    await render(<FulfillmentRoute />);
    await screen.findByText(/grid of/);

    mockProps.onOpenTiming('block-1');

    expect(mockPush).toHaveBeenCalledWith('/timing?mode=series');
  });

  it('reloads the grid when the screen gets the focus again, so the times recorded show', async () => {
    await render(<FulfillmentRoute />);
    await screen.findByText(/grid of/);
    const before = mockProps.refreshKey;

    await act(async () => mockFocus!());

    expect(mockProps.refreshKey).toBe(before + 1);
  });
});
