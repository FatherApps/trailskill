import { render, screen } from '@testing-library/react-native';

import MyAthletesRoute from '../app/(app)/athletes/index';

let mockUserId = 'guardian-1';
jest.mock('../core/session', () => ({
  useSession: () => ({ syncConnectFailed: false, session: { user: { id: mockUserId } } }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null }) }));
jest.mock('../modules/accounts', () => ({
  AthleteAvatarWithPhoto: () => null,
  AthleteShareCodeChipContainer: () => null,
  createSecureStoreShareCodeCache: () => ({}),
  createSupabaseAthleteShareCodeRepository: () => ({}),
  createPowerSyncManagedAthleteRepository: () => ({}),
  createPowerSyncAuthorizationStatusRepository: () => ({}),
}));
let mockContainerProps: { onAdd: () => void } | undefined;
jest.mock('../modules/athletes', () => ({
  // The list itself is tested in the athletes module.
  MyAthletesContainer: (props: { onAdd: () => void }) => {
    const { Text } = jest.requireActual('react-native');
    mockContainerProps = props;
    return <Text>list of athletes</Text>;
  },
  createPowerSyncAthleteSchoolRepository: () => ({}),
  createPowerSyncSchoolAthleteRepository: () => ({}),
}));
jest.mock('../modules/school-console', () => ({
  createPowerSyncSchoolStructureRepository: () => ({}),
  createPowerSyncSchoolNameRepository: () => ({}),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockPush.mockClear();
});

// "Autorizaciones" and "Cerrar sesión" moved to "Ajustes" (#778, settings-route.test.tsx): the screen is only the list.
describe.each([
  ['a guardian', 'guardian-1'],
  ['an adult athlete', 'adult-1'],
])('My athletes for %s', (_role, userId) => {
  beforeEach(() => {
    mockUserId = userId;
  });

  it('shows the list without the authorizations or the sign-out below it', async () => {
    await render(<MyAthletesRoute />);

    expect(screen.getByText('list of athletes')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Autorizaciones' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });

  it('opens the form to add an athlete', async () => {
    await render(<MyAthletesRoute />);

    mockContainerProps!.onAdd();

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/athletes/add', params: { mode: 'add' } });
  });
});
