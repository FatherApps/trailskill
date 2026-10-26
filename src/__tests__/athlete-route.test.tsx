import { fireEvent, render, screen } from '@testing-library/react-native';

import AthleteRoute from '../app/(app)/athletes/[id]';

let mockUserId: string | undefined;
let mockStaff = false;
let mockCanGoBack = true;
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null, connection: 'connected' }) }));
jest.mock('../modules/accounts', () => ({ createPowerSyncAuthorizationStatusRepository: () => ({}) }));
jest.mock('../modules/athletes', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    createPowerSyncSchoolAthleteRepository: () => ({}),
    createPowerSyncHistoryRepository: () => ({}),
    createPowerSyncAthleteSchoolRepository: () => ({}),
    createSupabaseOtherSchoolResultsRepository: () => ({}),
    AthleteProfileContainer: ({
      athleteId,
      otherSchoolResults,
      online,
      onBack,
    }: {
      athleteId: string;
      otherSchoolResults?: object;
      online?: boolean;
      onBack: () => void;
    }) => (
      <Pressable accessibilityRole="button" onPress={onBack}>
        <Text>{`profile of ${athleteId}${otherSchoolResults ? ' with other schools' : ''}${online ? ' online' : ''}`}</Text>
      </Pressable>
    ),
  };
});
jest.mock('../modules/school-console', () => ({
  createPowerSyncSchoolNameRepository: () => ({}),
  createPowerSyncSchoolStructureRepository: () => ({}),
  createPowerSyncStaffSchoolRepository: () => ({}),
  useStaffSchool: () => ({ status: mockStaff ? 'staff' : 'none' }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'a1' }),
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
}));

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

  it('goes back through the stack when there is one', async () => {
    mockUserId = 'user-1';
    mockCanGoBack = true;
    mockBack.mockClear();
    mockReplace.mockClear();
    await render(<AthleteRoute />);

    await fireEvent.press(await screen.findByRole('button'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes to the root when the profile was opened with an empty stack (deep link, cold start)', async () => {
    mockUserId = 'user-1';
    mockCanGoBack = false;
    mockBack.mockClear();
    mockReplace.mockClear();
    await render(<AthleteRoute />);

    await fireEvent.press(await screen.findByRole('button'));

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows nothing to a signed-out user', async () => {
    mockUserId = undefined;
    await render(<AthleteRoute />);

    expect(screen.queryByText(/profile of/)).toBeNull();
  });
});
