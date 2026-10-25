import { render, screen } from '@testing-library/react-native';

import AthleteRoute from '../app/(app)/athletes/[id]';

let mockUserId: string | undefined;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null }) }));
jest.mock('../modules/accounts', () => ({ createPowerSyncAuthorizationStatusRepository: () => ({}) }));
jest.mock('../modules/athletes', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    createPowerSyncSchoolAthleteRepository: () => ({}),
    createPowerSyncHistoryRepository: () => ({}),
    AthleteProfileContainer: ({ athleteId }: { athleteId: string }) => <Text>{`profile of ${athleteId}`}</Text>,
  };
});
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'a1' }) }));

describe('athlete profile route', () => {
  it('shows the profile of the athlete in the address', async () => {
    mockUserId = 'user-1';
    await render(<AthleteRoute />);

    expect(await screen.findByText('profile of a1')).toBeOnTheScreen();
  });

  it('shows nothing to a signed-out user', async () => {
    mockUserId = undefined;
    await render(<AthleteRoute />);

    expect(screen.queryByText(/profile of/)).toBeNull();
  });
});
