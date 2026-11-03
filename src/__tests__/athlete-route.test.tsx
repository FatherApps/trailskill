import { fireEvent, render, screen } from '@testing-library/react-native';

import AthleteRoute from '../app/(app)/athletes/[id]';

let mockUserId: string | undefined;
let mockStaff = false;
let mockCanGoBack = true;
let mockImportedAt: string | null = null;
let mockConfirmed = false;
let mockManaged: { status: string; athletes?: object[] } = { status: 'loading' };
let mockSources: object[] = [];
let mockId = 'a1';
let mockName: string | undefined;
let mockUnsent = { pending: 0, failed: 0 };
const mockMounted = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null, connection: 'connected', ...mockUnsent }) }));
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
  OfficialUpdateContainer: ({ athleteId }: { athleteId: string }) => {
    // Runs once per mount: a new athlete in the address must mount a fresh container.
    jest.requireActual('react').useEffect(() => mockMounted(athleteId), []);
    return null;
  },
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
      name,
      pendingChanges,
      otherSchoolResults,
      online,
      importPrompt,
      officialUpdate,
      onBack,
    }: {
      athleteId: string;
      name?: string;
      pendingChanges?: number;
      otherSchoolResults?: object;
      online?: boolean;
      importPrompt?: object;
      officialUpdate?: import('react').ReactNode;
      onBack: () => void;
    }) => (
      <Pressable accessibilityRole="button" onPress={onBack}>
        <Text>{`profile of ${athleteId}${otherSchoolResults ? ' with other schools' : ''}${online ? ' online' : ''}${importPrompt ? ' with import prompt' : ''}${name ? ` named ${name}` : ''} pending ${pendingChanges}`}</Text>
        {officialUpdate}
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
  useLocalSearchParams: () => ({ id: mockId, name: mockName }),
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
}));

describe('athlete profile route', () => {
  afterEach(() => {
    mockId = 'a1';
    mockName = undefined;
    mockUnsent = { pending: 0, failed: 0 };
    mockMounted.mockClear();
  });

  it('mounts a new official update container when the athlete in the address changes', async () => {
    mockUserId = 'user-1';
    await render(<AthleteRoute />);
    mockId = 'a2';
    await screen.rerender(<AthleteRoute />);

    expect(mockMounted.mock.calls).toEqual([['a1'], ['a2']]);
  });

  it('shows the profile of the athlete in the address', async () => {
    mockUserId = 'user-1';
    await render(<AthleteRoute />);

    expect(await screen.findByText('profile of a1 online pending 0')).toBeOnTheScreen();
  });

  it('hands the container the name in the address and every record still to send, pending or failed (issue 851)', async () => {
    mockUserId = 'user-1';
    mockName = 'Ana Marin';
    mockUnsent = { pending: 2, failed: 1 };
    await render(<AthleteRoute />);

    expect(await screen.findByText('profile of a1 online named Ana Marin pending 3')).toBeOnTheScreen();
  });

  it('offers the results of other schools only to school staff', async () => {
    mockUserId = 'user-1';
    mockStaff = true;
    await render(<AthleteRoute />);
    mockStaff = false;

    expect(await screen.findByText('profile of a1 with other schools online pending 0')).toBeOnTheScreen();
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
      mockSources = [{ organizationId: 'o1', name: 'Synthetic Federation', provider: 'xx-demo' }];
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online with import prompt pending 0')).toBeOnTheScreen();
    });

    it('lets the results panel replace the invitation once the identity is confirmed, even with nothing imported', async () => {
      mockUserId = 'user-1';
      mockManaged = managed;
      mockSources = [{ organizationId: 'o1', name: 'Synthetic Federation', provider: 'xx-demo' }];
      mockConfirmed = true;
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online pending 0')).toBeOnTheScreen();
    });

    it('stops inviting once something was imported: updating is the results panel', async () => {
      mockUserId = 'user-1';
      mockManaged = managed;
      mockSources = [{ organizationId: 'o1', name: 'Synthetic Federation', provider: 'xx-demo' }];
      mockImportedAt = '2026-10-28T10:00:00Z';
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online pending 0')).toBeOnTheScreen();
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
