import { render, screen } from '@testing-library/react-native';

import TimingRoute from '../app/(app)/timing';

let mockUserId: string | undefined;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({
  db: { getClientId: () => Promise.resolve('device-1') },
  useGlobalSyncSummary: () => ({ lastSyncedAt: null }),
}));
const mockListStaffSchools = jest.fn();
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  createPowerSyncStaffSchoolRepository: () => ({ listStaffSchools: (...args: unknown[]) => mockListStaffSchools(...args) }),
}));
jest.mock('../modules/athletes', () => ({
  ...jest.requireActual('../modules/athletes/athleteDisplay'),
  createPowerSyncSchoolAthleteRepository: () => ({}),
}));
jest.mock('../modules/timing', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    createPowerSyncMeasurementRepository: () => ({}),
    IndividualTimingFlow: ({ subtitle, userId, deviceId }: { subtitle: string; userId: string; deviceId: string }) => (
      <Text>{`timing flow for ${subtitle} by ${userId} on ${deviceId}`}</Text>
    ),
  };
});
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <RNText>{`redirected to ${href}`}</RNText>, router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => false } };
});

beforeEach(() => {
  mockUserId = 'user-1';
  mockListStaffSchools.mockReset().mockResolvedValue([]);
});

describe('timing route', () => {
  it('sends a user who belongs to no school, such as a guardian, back to the home', async () => {
    await render(<TimingRoute />);

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
    expect(screen.queryByText(/timing flow/)).toBeNull();
  });

  it('sends a signed-out user back to the home', async () => {
    mockUserId = undefined;
    await render(<TimingRoute />);

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
  });

  it('opens the timing of the school for school staff', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await render(<TimingRoute />);

    expect(await screen.findByText('timing flow for Escuela Delfines by user-1 on device-1')).toBeOnTheScreen();
    expect(screen.queryByText(/redirected/)).toBeNull();
  });
});
