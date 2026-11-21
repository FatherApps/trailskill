import { act, render, screen } from '@testing-library/react-native';

import FulfillmentRoute from '../app/(app)/plans/fulfillment';

let mockUserId: string | undefined;
let mockParams: { assignment?: string; day?: string } = {};
let mockClientId: () => Promise<string>;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({ db: { getClientId: () => mockClientId() } }));
type ContainerProps = { userId: string; deviceId: string; assignmentId: string; day: string; refreshKey: number; onOpenTiming: (blockId: string) => void; onBack?: () => void };
let mockProps: ContainerProps;
// The flow lives in training-plans: only the grid it renders is replaced, so the session, the device and the repositories are its own.
jest.mock('../modules/training-plans/screens/FulfillmentContainer', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    FulfillmentContainer: (props: ContainerProps) => {
      mockProps = props;
      return <Text>{`grid of ${props.assignmentId} on ${props.day} by ${props.userId} on ${props.deviceId} (${props.refreshKey})`}</Text>;
    },
  };
});
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
let mockFocus: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => mockCanGoBack }),
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
  mockBack.mockReset();
  mockCanGoBack = true;
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

  it('goes back when there is history, and offers no way back without it', async () => {
    await render(<FulfillmentRoute />);
    await screen.findByText(/grid of/);

    mockProps.onBack!();
    expect(mockBack).toHaveBeenCalledTimes(1);

    mockCanGoBack = false;
    await render(<FulfillmentRoute />);
    await screen.findByText(/grid of/);
    expect(mockProps.onBack).toBeUndefined();
  });

  it('reloads the grid when the screen gets the focus again, so the times recorded show', async () => {
    await render(<FulfillmentRoute />);
    await screen.findByText(/grid of/);
    const before = mockProps.refreshKey;

    await act(async () => mockFocus!());

    expect(mockProps.refreshKey).toBe(before + 1);
  });
});
