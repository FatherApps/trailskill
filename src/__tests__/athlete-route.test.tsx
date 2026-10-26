import { render, screen } from '@testing-library/react-native';

import AthleteRoute from '../app/(app)/athletes/[id]';

let mockUserId: string | undefined;
let mockStaff = false;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null, connection: 'connected' }) }));
jest.mock('../modules/accounts', () => ({ createPowerSyncAuthorizationStatusRepository: () => ({}) }));
jest.mock('../modules/athletes', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    createPowerSyncSchoolAthleteRepository: () => ({}),
    createPowerSyncHistoryRepository: () => ({}),
    createPowerSyncAthleteSchoolRepository: () => ({}),
    createSupabaseOtherSchoolResultsRepository: () => ({}),
    AthleteProfileContainer: ({ athleteId, otherSchoolResults, online }: { athleteId: string; otherSchoolResults?: object; online?: boolean }) => (
      <Text>{`profile of ${athleteId}${otherSchoolResults ? ' with other schools' : ''}${online ? ' online' : ''}`}</Text>
    ),
  };
});
jest.mock('../modules/school-console', () => ({
  createPowerSyncSchoolNameRepository: () => ({}),
  createPowerSyncSchoolStructureRepository: () => ({}),
  createPowerSyncStaffSchoolRepository: () => ({}),
  useStaffSchool: () => ({ status: mockStaff ? 'staff' : 'none' }),
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'a1' }), useRouter: () => ({ back: jest.fn() }) }));

describe('athlete profile route', () => {
  it('shows the profile of the athlete in the address', async () => {
    mockUserId = 'user-1';
    await render(<AthleteRoute />);

    expect(await screen.findByText('profile of a1 online')).toBeOnTheScreen();
  });

  it('offers the results of other schools only to school staff', async () => {
    mockUserId = 'user-1';
    mockStaff = true;
    await render(<AthleteRoute />);
    mockStaff = false;

    expect(await screen.findByText('profile of a1 with other schools online')).toBeOnTheScreen();
  });

  it('shows nothing to a signed-out user', async () => {
    mockUserId = undefined;
    await render(<AthleteRoute />);

    expect(screen.queryByText(/profile of/)).toBeNull();
  });
});
