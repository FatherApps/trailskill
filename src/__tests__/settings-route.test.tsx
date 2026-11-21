import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SettingsRoute from '../app/(app)/settings';

const mockSignOut = jest.fn();
jest.mock('../core/session', () => ({
  useSession: () => ({ syncConnectFailed: false, signOut: mockSignOut, session: { user: { id: 'user-1' } } }),
}));
jest.mock('../core/sync', () => ({ useGlobalSyncSummary: () => ({ lastSyncedAt: null }) }));
jest.mock('../core/navigation', () => ({ useGoBack: () => jest.fn() }));
const mockClearDraft = jest.fn();
const mockClearPending = jest.fn();
jest.mock('../modules/accounts', () => ({
  // The real container: only the repositories it receives are replaced.
  ...jest.requireActual('../modules/accounts/screens/SignOutContainer'),
  createPowerSyncManagedAthleteRepository: () => ({}),
  createSecureStoreRegistrationDraftRepository: () => ({ clear: () => mockClearDraft() }),
  createSecureStorePendingInvitationRepository: () => ({ clear: (userId: string) => mockClearPending(userId) }),
}));
let mockManaged: { status: 'loading' } | { status: 'ready'; athletes: { id: string }[] } = { status: 'loading' };
jest.mock('../modules/athletes', () => ({
  createPowerSyncSchoolAthleteRepository: () => ({}),
  useManagedAthletes: () => mockManaged,
}));
jest.mock('../modules/settings', () => ({
  // The screen itself is tested in the settings module; here only what the route hands it.
  SettingsContainer: (props: { onOpenAccount?: () => void; onOpenAuthorizations?: () => void; signOut?: ReactNode }) => {
    const { Pressable, Text, View } = jest.requireActual('react-native');
    return (
      <View>
        {props.onOpenAuthorizations && (
          <Pressable accessibilityRole="button" onPress={props.onOpenAuthorizations}>
            <Text>Autorizaciones</Text>
          </Pressable>
        )}
        {props.onOpenAccount && (
          <Pressable accessibilityRole="button" onPress={props.onOpenAccount}>
            <Text>Mi cuenta</Text>
          </Pressable>
        )}
        {props.signOut}
      </View>
    );
  },
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

// "Autorizaciones" and "Cerrar sesión" left the foot of "Mis deportistas" for the end of "Ajustes" (#778).
describe('Settings route: the account entries', () => {
  it('opens the authorizations for a person who manages athletes', async () => {
    await render(<SettingsRoute />);

    await fireEvent.press(screen.getByRole('button', { name: 'Autorizaciones' }));

    expect(mockPush).toHaveBeenCalledWith('/authorizations');
  });

  it.each([
    ['manages no athletes', { status: 'ready' as const, athletes: [] }],
    ['is still being looked up', { status: 'loading' as const }],
  ])('hides the authorizations from a person who %s', async (_case, managed) => {
    mockManaged = managed;
    await render(<SettingsRoute />);

    expect(screen.queryByRole('button', { name: 'Autorizaciones' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeOnTheScreen();
  });

  it('keeps the way to "Mi cuenta"', async () => {
    await render(<SettingsRoute />);

    await fireEvent.press(screen.getByRole('button', { name: 'Mi cuenta' }));

    expect(mockPush).toHaveBeenCalledWith('/account');
  });

  it('signs out and clears what the next person on the phone must not find', async () => {
    await render(<SettingsRoute />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClearDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClearPending).toHaveBeenCalledWith('user-1'));
  });
});
