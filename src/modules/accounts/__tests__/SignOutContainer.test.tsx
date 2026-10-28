import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPendingInvitationRepository } from '../data/pendingInvitations';
import { createInMemoryRegistrationDraftRepository } from '../data/registrationDraft';
import { SignOutContainer } from '../screens/SignOutContainer';

// Avoids loading the native PowerSync database.
jest.mock('../../../core/sync', () => ({}));

const mockSession = {
  session: { user: { id: 'user-1' } },
  syncConnectFailed: false,
  signOut: jest.fn(),
};
jest.mock('../../../core/session', () => ({
  ...jest.requireActual('../../../core/session'),
  useSession: () => mockSession,
}));

const pendingTitle = '¿Cerrar sesión con registros sin enviar?';
const signOutButton = { name: 'Cerrar sesión' };

const drafts = createInMemoryRegistrationDraftRepository();
const pending = createInMemoryPendingInvitationRepository();
const clearDraft = jest.spyOn(drafts, 'clear');
const clearPending = jest.spyOn(pending, 'clear');

beforeEach(() => {
  mockSession.syncConnectFailed = false;
  mockSession.signOut.mockReset().mockResolvedValue({ status: 'signed_out' });
  clearDraft.mockClear();
  clearPending.mockClear();
});

describe('SignOutContainer', () => {
  it('signs out at once and clears the draft and the queued invitations when nothing is unsent', async () => {
    await render(<SignOutContainer drafts={drafts} pending={pending} />);

    await fireEvent.press(screen.getByRole('button', signOutButton));

    expect(mockSession.signOut).toHaveBeenCalledWith();
    expect(screen.queryByRole('header', { name: pendingTitle })).toBeNull();
    await waitFor(() => expect(clearDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(clearPending).toHaveBeenCalledWith('user-1'));
  });

  it('opens the sheet and keeps the draft when records are unsent', async () => {
    mockSession.signOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<SignOutContainer drafts={drafts} pending={pending} />);

    await fireEvent.press(screen.getByRole('button', signOutButton));

    expect(await screen.findByRole('header', { name: pendingTitle })).toBeOnTheScreen();
    expect(screen.getByText(/Hay 3 registros sin enviar/)).toBeOnTheScreen();
    expect(screen.queryByText(/no se pudieron enviar/)).toBeNull();
    expect(clearDraft).not.toHaveBeenCalled();
    expect(clearPending).not.toHaveBeenCalled();
  });

  it('uses the singular for one unsent record', async () => {
    mockSession.signOut.mockResolvedValue({ status: 'blocked_pending', unsent: 1, rejected: 0 });
    await render(<SignOutContainer drafts={drafts} pending={pending} />);

    await fireEvent.press(screen.getByRole('button', signOutButton));

    expect(await screen.findByText(/Hay 1 registro sin enviar/)).toBeOnTheScreen();
  });

  it('says that rejected records will not be sent on their own', async () => {
    mockSession.signOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 2 });
    await render(<SignOutContainer drafts={drafts} pending={pending} />);

    await fireEvent.press(screen.getByRole('button', signOutButton));

    expect(await screen.findByText(/2 de ellos no se pudieron enviar/)).toBeOnTheScreen();
  });

  it('signs out anyway with force', async () => {
    mockSession.signOut.mockResolvedValueOnce({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<SignOutContainer drafts={drafts} pending={pending} />);
    await fireEvent.press(screen.getByRole('button', signOutButton));

    await fireEvent.press(await screen.findByRole('button', { name: 'Cerrar sesión igual' }));

    expect(mockSession.signOut).toHaveBeenLastCalledWith({ force: true });
    await waitFor(() => expect(clearDraft).toHaveBeenCalledTimes(1));
  });

  it('closes the sheet on cancel without signing out again', async () => {
    mockSession.signOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<SignOutContainer drafts={drafts} pending={pending} />);
    await fireEvent.press(screen.getByRole('button', signOutButton));
    await screen.findByRole('header', { name: pendingTitle });

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir y enviar' }));

    expect(screen.queryByRole('header', { name: pendingTitle })).toBeNull();
    expect(mockSession.signOut).toHaveBeenCalledTimes(1);
  });

  it('tells the person when signing out failed', async () => {
    mockSession.signOut.mockRejectedValue(new Error('storage'));
    await render(<SignOutContainer drafts={drafts} pending={pending} />);

    await fireEvent.press(screen.getByRole('button', signOutButton));

    expect(await screen.findByText('No pudimos cerrar la sesión. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(clearDraft).not.toHaveBeenCalled();
  });

  it('ignores a second press while signing out is in progress', async () => {
    let finish: (result: { status: 'signed_out' }) => void = () => {};
    mockSession.signOut.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render(<SignOutContainer drafts={drafts} pending={pending} />);
    const button = screen.getByRole('button', signOutButton);

    // Both presses land before React re-renders the button as loading, so only the handler itself can ignore the second (Pressable's onClick is the keyboard and accessibility press).
    const click = () => button.props.onClick({ stopPropagation() {}, nativeEvent: {} });
    await act(async () => {
      click();
      click();
      finish({ status: 'signed_out' });
    });

    expect(mockSession.signOut).toHaveBeenCalledTimes(1);
  });

  it.each([
    [true, true],
    [false, false],
  ])('with sync connect failed %p the warning says records go out on reconnect: %p', async (connectFailed, shown) => {
    mockSession.syncConnectFailed = connectFailed;
    mockSession.signOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<SignOutContainer drafts={drafts} pending={pending} />);

    await fireEvent.press(screen.getByRole('button', signOutButton));

    await screen.findByRole('header', { name: pendingTitle });
    expect(screen.queryByText(/si sigues en la sesión, se envían cuando vuelva la conexión/) !== null).toBe(shown);
  });
});
