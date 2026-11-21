import { fireEvent, render, screen } from '@testing-library/react-native';

import AthleteRoute from '../app/(app)/athletes/[id]';

let mockUserId: string | undefined;
let mockStaff = false;
let mockShowPhoto = true;
const mockPush = jest.fn();
let mockSwimmerSchoolIds: string[] = [];
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
jest.mock('../modules/accounts', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    createPowerSyncAuthorizationStatusRepository: () => ({}),
    createPowerSyncManagedAthleteRepository: () => ({}),
    createSupabaseAthleteShareCodeRepository: () => ({}),
    createSecureStoreShareCodeCache: () => ({}),
    useHasValidAuthorization: (athleteId: string, purpose: string) => mockShowPhoto && purpose === 'show_photo' && athleteId.length > 0,
    AthleteShareCodeContainer: ({ athleteId, athleteName }: { athleteId: string; athleteName: string }) => (
      <Text>{`share code of ${athleteId} for ${athleteName}`}</Text>
    ),
  };
});
jest.mock('../modules/results-import', () => ({
  createSupabaseImportSourcesRepository: () => ({}),
  useImportSources: () => mockSources,
  createPowerSyncImportedResultsRepository: () => ({ lastImportedAt: async () => mockImportedAt }),
  createSupabaseOfficialResultsService: () => ({}),
  createOfficialUpdate: () => ({}),
  createIdentityConfirmation: () => ({ isConfirmed: async () => mockConfirmed }),
  createSupabasePendingChangeResolver: () => ({}),
  useImportFooterStore: () => ({}),
  ImportFooterSlot: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>import footer slot</Text>;
  },
  OfficialUpdateContainer: ({ athleteId }: { athleteId: string }) => {
    // Runs once per mount: a new athlete in the address must mount a fresh container.
    jest.requireActual('react').useEffect(() => mockMounted(athleteId), []);
    return null;
  },
}));
jest.mock('../modules/athletes', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    createPowerSyncSchoolAthleteRepository: () => ({}),
    createPowerSyncHistoryRepository: () => ({}),
    createPowerSyncAthleteSchoolRepository: () => ({ listByAthlete: async () => mockSwimmerSchoolIds.map((schoolId) => ({ schoolId, categoryId: null })) }),
    createSupabaseOtherSchoolResultsRepository: () => ({}),
    getAthletePhotoService: () => ({}),
    createExpoPhotoPicker: () => ({}),
    AthletePhotoContainer: ({ athleteId, authorized, onAuthorize }: { athleteId: string; authorized: boolean; onAuthorize: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={`photo of ${athleteId} ${authorized ? 'authorized' : 'needs authorization'}`} onPress={onAuthorize} />
    ),
    useManagedAthletes: () => mockManaged,
    // The real hook: the route test keeps checking what the route does with the state this hook owns.
    useAthleteProfileRoute: jest.requireActual('../modules/athletes/data/useAthleteProfileRoute').useAthleteProfileRoute,
    AthleteProfileContainer: ({
      athleteId,
      name,
      pendingChanges,
      otherSchoolResults,
      online,
      importPrompt,
      officialUpdate,
      bottomBar,
      shareCode,
      guardianSharing,
      photoCard,
      onBack,
    }: {
      athleteId: string;
      name?: string;
      pendingChanges?: number;
      otherSchoolResults?: object;
      online?: boolean;
      importPrompt?: object;
      officialUpdate?: import('react').ReactNode;
      bottomBar?: import('react').ReactNode;
      shareCode?: import('react').ReactNode;
      guardianSharing?: import('react').ReactNode;
      photoCard?: (avatar: import('react').ReactNode) => import('react').ReactNode;
      onBack?: () => void;
    }) => (
      <View>
        {onBack && <Pressable accessibilityRole="button" accessibilityLabel="back" onPress={onBack} />}
        <Text>{`profile of ${athleteId}${otherSchoolResults ? ' with other schools' : ''}${online ? ' online' : ''}${importPrompt ? ' with import prompt' : ''}${name ? ` named ${name}` : ''} pending ${pendingChanges}`}</Text>
        {officialUpdate}
        {bottomBar}
        {shareCode}
        {guardianSharing}
        {photoCard?.(<Text>avatar</Text>)}
      </View>
    ),
  };
});
jest.mock('../modules/timing', () => ({ createPowerSyncMeasurementRepository: () => ({}) }));
jest.mock('../modules/school-console', () => ({
  createGuardianRecordsRepository: () => ({}),
  createSupabaseGuardianSharingRepository: () => ({}),
  SwimmerSharingSection: ({ athleteId, schoolId }: { athleteId: string; schoolId: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`guardian sharing of ${athleteId} in ${schoolId}`}</Text>;
  },
  createPowerSyncSchoolNameRepository: () => ({}),
  createPowerSyncSchoolStructureRepository: () => ({}),
  createPowerSyncStaffSchoolRepository: () => ({}),
  useStaffSchool: () => ({ status: mockStaff ? 'staff' : 'none', schools: mockStaff ? [{ id: 'school-a', name: 'Escuela A' }] : [] }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockId, name: mockName }),
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush, canGoBack: () => mockCanGoBack }),
}));

describe('athlete profile route', () => {
  afterEach(() => {
    mockId = 'a1';
    mockName = undefined;
    mockUnsent = { pending: 0, failed: 0 };
    mockMounted.mockClear();
    mockSwimmerSchoolIds = [];
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

  it('hands the profile the import footer to pin outside its list', async () => {
    mockUserId = 'user-1';
    await render(<AthleteRoute />);

    expect(await screen.findByText('import footer slot')).toBeOnTheScreen();
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

  describe('what the guardian sees', () => {
    afterEach(() => {
      mockStaff = false;
    });

    it('gives the controls to staff of a school the swimmer belongs to', async () => {
      mockUserId = 'user-1';
      mockStaff = true;
      mockSwimmerSchoolIds = ['school-b', 'school-a'];
      await render(<AthleteRoute />);

      expect(await screen.findByText('guardian sharing of a1 in school-a')).toBeOnTheScreen();
    });

    it('does not give them when the swimmer is in no school of the user, or the user is not staff', async () => {
      mockUserId = 'user-1';
      mockStaff = true;
      mockSwimmerSchoolIds = ['school-b'];
      const { unmount } = await render(<AthleteRoute />);
      expect(await screen.findByText(/^profile of a1/)).toBeOnTheScreen();
      expect(screen.queryByText(/guardian sharing/)).not.toBeOnTheScreen();
      await unmount();

      mockStaff = false;
      mockSwimmerSchoolIds = ['school-a'];
      await render(<AthleteRoute />);
      expect(await screen.findByText(/^profile of a1/)).toBeOnTheScreen();
      expect(screen.queryByText(/guardian sharing/)).not.toBeOnTheScreen();
    });
  });

  describe('photo', () => {
    afterEach(() => {
      mockManaged = { status: 'loading' };
      mockShowPhoto = true;
    });

    it('gives the photo card to who manages the swimmer, with show_photo read by the route', async () => {
      mockUserId = 'user-1';
      mockManaged = { status: 'ready', athletes: [{ id: 'a1', firstName: 'Ana' }] };
      await render(<AthleteRoute />);

      expect(await screen.findByRole('button', { name: 'photo of a1 authorized' })).toBeOnTheScreen();
    });

    it('without show_photo the card opens the authorization flow of accounts first', async () => {
      mockUserId = 'user-1';
      mockShowPhoto = false;
      mockManaged = { status: 'ready', athletes: [{ id: 'a1', firstName: 'Ana' }] };
      await render(<AthleteRoute />);

      await fireEvent.press(await screen.findByRole('button', { name: 'photo of a1 needs authorization' }));

      expect(mockPush).toHaveBeenCalledWith('/authorizations');
    });

    it('gives no photo card to anyone else, for example the coach', async () => {
      mockUserId = 'user-1';
      mockManaged = { status: 'ready', athletes: [] };
      await render(<AthleteRoute />);

      await screen.findByText('profile of a1 online pending 0');
      expect(screen.queryByRole('button', { name: /photo of/ })).toBeNull();
    });
  });

  describe('share code', () => {
    afterEach(() => {
      mockManaged = { status: 'loading' };
    });

    it('gives the share code to who manages the swimmer', async () => {
      mockUserId = 'user-1';
      mockManaged = { status: 'ready', athletes: [{ id: 'a1', firstName: 'Ana' }] };
      await render(<AthleteRoute />);

      expect(await screen.findByText('share code of a1 for Ana')).toBeOnTheScreen();
    });

    it('renders the official update and the share code as siblings with different keys (issue 1035)', async () => {
      mockUserId = 'user-1';
      mockManaged = { status: 'ready', athletes: [{ id: 'a1', firstName: 'Ana' }] };
      const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
      await render(<AthleteRoute />);

      await screen.findByText('share code of a1 for Ana');
      expect(errors.mock.calls.filter((call) => String(call[0]).includes('same key'))).toEqual([]);
      errors.mockRestore();
    });

    it('gives no share code to anyone else, for example the coach', async () => {
      mockUserId = 'user-1';
      mockManaged = { status: 'ready', athletes: [] };
      await render(<AthleteRoute />);

      await screen.findByText('profile of a1 online pending 0');
      expect(screen.queryByText(/share code/)).toBeNull();
    });
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
      mockSources = [{ organizationId: 'o1', name: 'Synthetic Federation', kind: 'federation', provider: 'xx-demo' }];
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online with import prompt pending 0')).toBeOnTheScreen();
    });

    it('lets the results panel replace the invitation once the identity is confirmed, even with nothing imported', async () => {
      mockUserId = 'user-1';
      mockManaged = managed;
      mockSources = [{ organizationId: 'o1', name: 'Synthetic Federation', kind: 'federation', provider: 'xx-demo' }];
      mockConfirmed = true;
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online pending 0')).toBeOnTheScreen();
    });

    it('stops inviting once something was imported: updating is the results panel', async () => {
      mockUserId = 'user-1';
      mockManaged = managed;
      mockSources = [{ organizationId: 'o1', name: 'Synthetic Federation', kind: 'federation', provider: 'xx-demo' }];
      mockImportedAt = '2026-10-28T10:00:00Z';
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online pending 0')).toBeOnTheScreen();
    });
    it('still invites to import a tournament when a results platform is configured, even after the federation import', async () => {
      mockUserId = 'user-1';
      mockManaged = managed;
      mockSources = [
        { organizationId: 'o1', name: 'Synthetic Federation', kind: 'federation', provider: 'xx-demo' },
        { organizationId: 'o2', name: 'Synthetic Platform', kind: 'platform', provider: 'xx-torneo' },
      ];
      mockImportedAt = '2026-10-28T10:00:00Z';
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online with import prompt pending 0')).toBeOnTheScreen();
    });

    it('invites with a results platform alone, with no federation', async () => {
      mockUserId = 'user-1';
      mockManaged = managed;
      mockSources = [{ organizationId: 'o2', name: 'Synthetic Platform', kind: 'platform', provider: 'xx-torneo' }];
      await render(<AthleteRoute />);

      expect(await screen.findByText('profile of a1 online with import prompt pending 0')).toBeOnTheScreen();
    });
  });

  it('goes back through the stack when there is one', async () => {
    mockUserId = 'user-1';
    mockCanGoBack = true;
    mockBack.mockClear();
    mockReplace.mockClear();
    await render(<AthleteRoute />);

    await fireEvent.press(await screen.findByRole('button', { name: 'back' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // The landing sends a guardian with one athlete straight here with an empty stack; '/' would redirect back to this profile, so a back button would do nothing.
  it('passes no back action when the profile was opened with an empty stack (landing, deep link, cold start)', async () => {
    mockUserId = 'user-1';
    mockCanGoBack = false;
    mockBack.mockClear();
    mockReplace.mockClear();
    await render(<AthleteRoute />);

    expect(await screen.findByText(/^profile of a1/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'back' })).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows nothing to a signed-out user', async () => {
    mockUserId = undefined;
    await render(<AthleteRoute />);

    expect(screen.queryByText(/profile of/)).toBeNull();
  });
});
