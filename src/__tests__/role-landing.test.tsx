import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import Index from '../app/(app)/index';
import AuthorizationsRoute from '../app/(app)/athletes/authorizations';

// Everything the landing reads lives in `mockWorld`, read when a repository is used, so each test builds its own.
type World = {
  synced: boolean;
  syncConnectFailed: boolean;
  // Memberships on the device; the second list is the school_admin ones.
  schools: string[];
  adminSchools: string[];
  // The athlete links of the user, and the id of the 'self' one.
  managedIds: string[];
  selfId: string | null;
  ownAuthorizations: boolean;
  // true / false, or 'silent' when the server never answers.
  platformAdmin: boolean | 'silent';
};
const mockWorld: World = { synced: true, syncConnectFailed: false, schools: [], adminSchools: [], managedIds: [], selfId: null, ownAuthorizations: false, platformAdmin: false };

jest.mock('../core/sync', () => ({
  ...jest.requireActual('../core/sync/syncState'),
  useGlobalSyncSummary: () => ({ pending: 0, failed: 0, uploading: false, lastSyncedAt: mockWorld.synced ? new Date(1000) : null }),
}));
jest.mock('../core/session', () => ({
  useSession: () => ({ syncConnectFailed: mockWorld.syncConnectFailed, signOut: jest.fn(), session: { user: { id: 'user-1' } } }),
}));
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  createPowerSyncStaffSchoolRepository: () => ({
    listStaffSchools: async () => mockWorld.schools.map((id) => ({ id, name: id })),
    listAdminSchools: async () => mockWorld.adminSchools.map((id) => ({ id, name: id })),
  }),
}));
jest.mock('../modules/accounts', () => ({
  // The real container and the real landing: only the repositories, which need the native database, are replaced.
  ...jest.requireActual('../modules/accounts/screens/SignOutContainer'),
  ...jest.requireActual('../modules/accounts/data/landing'),
  createSecureStoreRegistrationDraftRepository: () => ({}),
  createSecureStorePendingInvitationRepository: () => ({}),
  createPowerSyncAuthorizationRepository: () => ({}),
  createPowerSyncOwnAuthorizationEvidence: () => async () => mockWorld.ownAuthorizations,
  createPowerSyncManagedAthleteRepository: () => ({
    listManagedAthleteIds: async () => mockWorld.managedIds,
    getSelfAthleteId: async () => mockWorld.selfId,
  }),
  // The last step of registration: the test presses "Continuar" where the person would.
  AuthorizationsContainer: ({ onDone }: { onDone: () => void }) => {
    const { Text: Label } = jest.requireActual('react-native');
    return <Label onPress={onDone}>Continuar</Label>;
  },
}));
jest.mock('../modules/athletes', () => ({
  ...jest.requireActual('../modules/athletes/data/useManagedAthletes'),
  ...jest.requireActual('../modules/athletes/athleteDisplay'),
  createPowerSyncSchoolAthleteRepository: () => ({
    listByIds: async (ids: string[]) => ids.map((id) => ({ id, firstName: 'Ana', lastName: 'Marin', categoryId: null, groupIds: [] })),
  }),
}));
jest.mock('../modules/timing', () => ({
  ...jest.requireActual('../modules/timing/data/usePlatformAdmin'),
  ...jest.requireActual('../modules/timing/data/usePlatformAdminStatus'),
  createSupabaseConflictReviewRepository: () => ({
    isPlatformAdmin: () => (mockWorld.platformAdmin === 'silent' ? new Promise<boolean>(() => {}) : Promise.resolve(mockWorld.platformAdmin)),
  }),
}));
jest.mock('@powersync/react', () => ({}));
jest.mock('../core/sync/db', () => ({ db: {} }));
let mockWidth = 390;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ width: mockWidth, height: 844, scale: 1, fontScale: 1 }),
}));

function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>{`profile ${id}`}</Text>;
}

const routes = {
  '(app)/index': Index,
  '(app)/athletes/index': () => <Text>my athletes</Text>,
  '(app)/athletes/[id]': Profile,
  '(app)/athletes/authorizations': AuthorizationsRoute,
};

beforeEach(() => {
  mockWidth = 390;
  Object.assign(mockWorld, { synced: true, syncConnectFailed: false, schools: [], adminSchools: [], managedIds: [], selfId: null, ownAuthorizations: false, platformAdmin: false });
});

const guardian = () => Object.assign(mockWorld, { managedIds: ['a1', 'a2'], ownAuthorizations: true });
const adult = () => Object.assign(mockWorld, { managedIds: ['self-1'], selfId: 'self-1', ownAuthorizations: true });

// "TrailSkill" is the title of the old home screen.
async function landsOnHome() {
  expect(await screen.findByText('TrailSkill')).toBeOnTheScreen();
  expect(screen.queryByText('my athletes')).toBeNull();
  expect(screen.queryByText(/^profile /)).toBeNull();
}

describe('landing by role', () => {
  it('takes a guardian to My athletes instead of the old home screen', async () => {
    guardian();
    await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('my athletes')).toBeOnTheScreen();
    expect(screen.queryByText('TrailSkill')).toBeNull();
  });

  it('takes an adult athlete to their own profile', async () => {
    adult();
    await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('profile self-1')).toBeOnTheScreen();
    expect(screen.queryByText('TrailSkill')).toBeNull();
  });

  it('takes an adult athlete on a tablet, which has no phone bar, to My athletes', async () => {
    adult();
    mockWidth = 800;
    await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('my athletes')).toBeOnTheScreen();
    expect(screen.queryByText(/^profile /)).toBeNull();
  });

  it('keeps a coach on the old home screen, with the timing', async () => {
    mockWorld.schools = ['s1'];
    await renderRouter(routes, { initialUrl: '/' });

    await landsOnHome();
    expect(await screen.findByRole('button', { name: 'Toma de tiempos' })).toBeOnTheScreen();
  });

  it('keeps a school admin on the old home screen, with the console', async () => {
    mockWorld.schools = ['s1'];
    mockWorld.adminSchools = ['s1'];
    await renderRouter(routes, { initialUrl: '/' });

    await landsOnHome();
    expect(await screen.findByRole('button', { name: 'Consola' })).toBeOnTheScreen();
  });

  it('keeps a platform admin on the old home screen, with the conflict review', async () => {
    mockWorld.platformAdmin = true;
    await renderRouter(routes, { initialUrl: '/' });

    await landsOnHome();
    expect(await screen.findByRole('button', { name: 'Revisar conflictos' })).toBeOnTheScreen();
  });

  it('keeps an account with no sign of being a guardian or an adult on the old home screen', async () => {
    await renderRouter(routes, { initialUrl: '/' });

    await landsOnHome();
  });
});

describe('landing of accounts with several roles', () => {
  it('keeps a coach who is also a guardian on the old home screen', async () => {
    guardian();
    mockWorld.schools = ['s1'];
    await renderRouter(routes, { initialUrl: '/' });

    await landsOnHome();
  });

  it('keeps a platform admin who is also a guardian on the old home screen', async () => {
    guardian();
    mockWorld.platformAdmin = true;
    await renderRouter(routes, { initialUrl: '/' });

    await landsOnHome();
  });

  it('takes an adult athlete who also manages others to My athletes', async () => {
    Object.assign(mockWorld, { managedIds: ['self-1', 'a2'], selfId: 'self-1', ownAuthorizations: true });
    await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('my athletes')).toBeOnTheScreen();
  });
});

describe('landing while data is missing', () => {
  it('shows neither the old home screen nor a destination before the first sync', async () => {
    guardian();
    mockWorld.synced = false;
    await renderRouter(routes, { initialUrl: '/' });

    await act(async () => {});
    expect(screen.queryByText('TrailSkill')).toBeNull();
    expect(screen.queryByText('my athletes')).toBeNull();
  });

  it('shows the home screen, with the sync failure and the sign-out, when the first sync cannot connect', async () => {
    guardian();
    mockWorld.synced = false;
    mockWorld.syncConnectFailed = true;
    await renderRouter(routes, { initialUrl: '/' });

    await landsOnHome();
    expect(screen.getByText(/No pudimos conectar la sincronización/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeOnTheScreen();
  });

  it('waits for the platform admin answer before sending a guardian away', async () => {
    guardian();
    mockWorld.platformAdmin = 'silent';
    await renderRouter(routes, { initialUrl: '/' });

    await act(async () => {});
    expect(screen.queryByText('TrailSkill')).toBeNull();
    expect(screen.queryByText('my athletes')).toBeNull();
  });
});

describe('the end of the registration', () => {
  it.each([
    ['a guardian', guardian, 'my athletes'],
    ['an adult athlete', adult, 'profile self-1'],
  ] as const)('ends %s on their landing', async (_role, setUp, text) => {
    setUp();
    await renderRouter(routes, { initialUrl: '/athletes/authorizations' });

    await act(async () => screen.getByText('Continuar').props.onPress());

    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(screen.queryByText('TrailSkill')).toBeNull();
  });
});
