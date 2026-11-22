import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import AccountRoute from '../app/(app)/account';

const mockSignOut = jest.fn();
jest.mock('../core/session', () => ({
  useSession: () => ({ syncConnectFailed: false, signOut: mockSignOut, session: { user: { id: 'user-1' } } }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null }) }));
jest.mock('../core/navigation', () => ({ useGoBack: () => jest.fn() }));
const mockClearDraft = jest.fn();
const mockClearPending = jest.fn();
jest.mock('../modules/accounts', () => ({
  // The real screen: only the repositories it receives are replaced.
  ...jest.requireActual('../modules/accounts/screens/AccountContainer'),
  createPowerSyncManagedAthleteRepository: () => ({}),
  createSecureStoreRegistrationDraftRepository: () => ({ clear: () => mockClearDraft() }),
  createSecureStorePendingInvitationRepository: () => ({ clear: (userId: string) => mockClearPending(userId) }),
}));
let mockManaged: { status: 'loading' } | { status: 'ready'; athletes: { id: string }[] } = { status: 'loading' };
jest.mock('../modules/athletes', () => ({
  createPowerSyncSchoolAthleteRepository: () => ({}),
  useManagedAthletes: () => mockManaged,
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockSignOut.mockReset().mockResolvedValue({ status: 'signed_out' });
  mockClearDraft.mockReset().mockResolvedValue(undefined);
  mockClearPending.mockReset().mockResolvedValue(undefined);
  mockPush.mockClear();
  mockManaged = { status: 'ready', athletes: [{ id: 'a1' }] };
});

// "Autorizaciones" and "Cerrar sesión" left the end of "Ajustes" for "Mi cuenta", which opens from it.
describe('Account route', () => {
  it('shows "Autorizaciones", "Cerrar sesión" and "Eliminar mis datos", in that order', async () => {
    await render(<AccountRoute />);

    const order = screen.getAllByText(/^(Autorizaciones|Cerrar sesión|Eliminar mis datos)$/).map((node) => node.props.children);
    expect(order).toEqual(['Autorizaciones', 'Cerrar sesión', 'Eliminar mis datos']);
  });

  it('opens the authorizations for a person who manages athletes', async () => {
    await render(<AccountRoute />);

    await fireEvent.press(screen.getByRole('button', { name: 'Autorizaciones' }));

    expect(mockPush).toHaveBeenCalledWith('/authorizations');
  });

  it.each([
    ['manages no athletes', { status: 'ready' as const, athletes: [] }],
    ['is still being looked up', { status: 'loading' as const }],
  ])('hides the authorizations from a person who %s', async (_case, managed) => {
    mockManaged = managed;
    await render(<AccountRoute />);

    expect(screen.queryByRole('button', { name: 'Autorizaciones' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeOnTheScreen();
  });

  it('opens the deletion', async () => {
    await render(<AccountRoute />);

    await fireEvent.press(screen.getByRole('button', { name: 'Eliminar mis datos' }));

    expect(mockPush).toHaveBeenCalledWith('/delete-account');
  });

  it('signs out and clears what the next person on the phone must not find', async () => {
    await render(<AccountRoute />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClearDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClearPending).toHaveBeenCalledWith('user-1'));
  });
});
