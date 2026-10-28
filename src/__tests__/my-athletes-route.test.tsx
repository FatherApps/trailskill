import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import MyAthletesRoute from '../app/(app)/athletes/index';

const mockSignOut = jest.fn();
let mockUserId = 'guardian-1';
jest.mock('../core/session', () => ({
  useSession: () => ({ syncConnectFailed: false, signOut: mockSignOut, session: { user: { id: mockUserId } } }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null }) }));
const mockClearDraft = jest.fn();
const mockClearPending = jest.fn();
jest.mock('../modules/accounts', () => ({
  // The real container: only the repositories it receives are replaced.
  ...jest.requireActual('../modules/accounts/screens/SignOutContainer'),
  createPowerSyncManagedAthleteRepository: () => ({}),
  createPowerSyncAuthorizationStatusRepository: () => ({}),
  createSecureStoreRegistrationDraftRepository: () => ({ clear: () => mockClearDraft() }),
  createSecureStorePendingInvitationRepository: () => ({ clear: (userId: string) => mockClearPending(userId) }),
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
  mockSignOut.mockReset().mockResolvedValue({ status: 'signed_out' });
  mockClearDraft.mockReset().mockResolvedValue(undefined);
  mockClearPending.mockReset().mockResolvedValue(undefined);
  mockPush.mockClear();
});

// A bridge until the account screen (#778): a guardian and an adult athlete have no other way to sign out or manage authorizations.
// The adult lands on their profile and reaches this screen with the "Deportistas" tab of the phone bar (app-layout-nav.test.tsx).
describe.each([
  ['a guardian', 'guardian-1'],
  ['an adult athlete', 'adult-1'],
])('My athletes: the footer of %s', (_role, userId) => {
  beforeEach(() => {
    mockUserId = userId;
  });

  it('shows the list with the authorizations and the sign-out below it', async () => {
    await render(<MyAthletesRoute />);

    expect(screen.getByText('list of athletes')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Autorizaciones' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeOnTheScreen();
  });

  it('opens the form to add an athlete', async () => {
    await render(<MyAthletesRoute />);

    mockContainerProps!.onAdd();

    expect(mockPush).toHaveBeenCalledWith('/athletes/add');
  });

  it('opens the authorizations', async () => {
    await render(<MyAthletesRoute />);

    await fireEvent.press(screen.getByRole('button', { name: 'Autorizaciones' }));

    expect(mockPush).toHaveBeenCalledWith('/authorizations');
  });

  it('signs out and clears what the next person on the phone must not find', async () => {
    await render(<MyAthletesRoute />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClearDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClearPending).toHaveBeenCalledWith(userId));
  });
});
