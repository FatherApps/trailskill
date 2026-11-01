import { fireEvent, render, screen } from '@testing-library/react-native';

import AthleteRoute from '../app/(app)/athletes/[id]';

let mockUserId: string | undefined;
let mockStaff = false;
let mockCanGoBack = true;
let mockImportedAt: string | null = null;
let mockConfirmed = false;
let mockManaged: { status: string; athletes?: object[] } = { status: 'loading' };
let mockSources: object[] = [];
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null, connection: 'connected' }) }));
jest.mock('../modules/accounts', () => ({
  createPowerSyncAuthorizationStatusRepository: () => ({}),
  createPowerSyncManagedAthleteRepository: () => ({}),
}));
jest.mock('../modules/results-import', () => ({
  createSupabaseImportSourcesRepository: () => ({}),
  useImportSources: () => mockSources,
  createPowerSyncImportedResultsRepository: () => ({ lastImportedAt: async () => mockImportedAt }),
  createSupabaseOfficialResultsService: () => ({}),
  createOfficialUpdate: () => ({}),
  createIdentityConfirmation: () => ({ isConfirmed: async () => mockConfirmed }),
  createSupabasePendingChangeResolver: () => ({}),
  OfficialUpdateContainer: () => null,
}));
jest.mock('../modules/athletes', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    createPowerSyncSchoolAthleteRepository: () => ({}),
    createPowerSyncHistoryRepository: () => ({}),
    createPowerSyncAthleteSchoolRepository: () => ({}),
    createSupabaseOtherSchoolResultsRepository: () => ({}),
    useManagedAthletes: () => mockManaged,
    AthleteProfileContainer: ({
      athleteId,
      otherSchoolResults,
      online,
      importPrompt,
      onBack,
    }: {
      athleteId: string;
      otherSchoolResults?: object;
      online?: boolean;
      importPrompt?: object;
      onBack: () => void;
    }) => (
      <Pressable accessibilityRole="button" onPress={onBack}>
        <Text>{`profile of ${athleteId}${otherSchoolResults ? ' with other schools' : ''}${online ? ' online' : ''}${importPrompt ? ' with import prompt' : ''}`}</Text>
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

  describe('import prompt', () => {
    const managed = { status: 'ready', athletes: [{ id: 'a1', firstName: 'Ana' }] };
    afterEach(() => {
      mockManaged = { status: 'loading' };
      mockSources = [];
      mockImportedAt = null;
      mockConfirmed = false;
    });

    it('invites a guardian to import before anything was imported', async () => {
      mockUserId = 'user-1';
      mockManaged = managed;
      mockSources = [{ organizationId: 'o1', name: 'Synthetic Federation' }];
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online with import prompt')).toBeOnTheScreen();
    });

    it('lets the results panel replace the invitation once the identity is confirmed, even with nothing imported', async () => {
      mockUserId = 'user-1';
      mockManaged = managed;
      mockSources = [{ organizationId: 'o1', name: 'Synthetic Federation' }];
      mockConfirmed = true;
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online')).toBeOnTheScreen();
    });

    it('stops inviting once something was imported: updating is the results panel', async () => {
      mockUserId = 'user-1';
      mockManaged = managed;
      mockSources = [{ organizationId: 'o1', name: 'Synthetic Federation' }];
      mockImportedAt = '2026-10-28T10:00:00Z';
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online')).toBeOnTheScreen();
    });
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
