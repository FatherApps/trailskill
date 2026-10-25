import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Home from '../app/(app)/index';
import { t } from '../core/i18n';

let mockSummary: { pending: number; failed: number; uploading: boolean; lastSyncedAt: Date | null };
// The real recordSyncState: only the hook, which needs the native database, is replaced.
jest.mock('../core/sync', () => ({
  ...jest.requireActual('../core/sync/syncState'),
  useGlobalSyncSummary: () => mockSummary,
}));
let mockSyncConnectFailed = false;
const mockSignOut = jest.fn();
jest.mock('../core/session', () => ({
  useSession: () => ({ syncConnectFailed: mockSyncConnectFailed, signOut: mockSignOut }),
}));
jest.mock('@powersync/react', () => ({}));
jest.mock('../core/sync/db', () => ({ db: {} }));

beforeEach(() => {
  mockSummary = { pending: 0, failed: 0, uploading: false, lastSyncedAt: null };
  mockSyncConnectFailed = false;
  mockSignOut.mockReset().mockResolvedValue({ status: 'signed_out' });
});

// Lives outside src/app: Expo Router would treat a test file there as a route.
describe('home screen', () => {
  it('shows the app title', async () => {
    await render(<Home />);

    expect(screen.getByText('TrailSkill')).toBeTruthy();
  });

  it('shows records waiting on the phone', async () => {
    mockSummary = { ...mockSummary, pending: 2 };
    await render(<Home />);

    expect(screen.getByLabelText('En el teléfono')).toBeOnTheScreen();
  });

  it('shows records the server rejected', async () => {
    mockSummary = { ...mockSummary, failed: 1 };
    await render(<Home />);

    expect(screen.getByLabelText('No enviado')).toBeOnTheScreen();
  });

  it('shows everything sent when nothing is pending', async () => {
    await render(<Home />);

    expect(screen.getByLabelText('Enviado')).toBeOnTheScreen();
  });

  it('tells the person when sync could not connect', async () => {
    mockSyncConnectFailed = true;
    await render(<Home />);

    expect(
      screen.getByText('No pudimos conectar la sincronización. Tus registros siguen guardados en el teléfono.'),
    ).toBeOnTheScreen();
  });

  it('shows no sync connection message when it connected', async () => {
    await render(<Home />);

    expect(screen.queryByText(/No pudimos conectar la sincronización/)).toBeNull();
  });
});

describe('sign out from home', () => {
  const pendingTitle = '¿Cerrar sesión con registros sin enviar?';

  it('signs out at once when nothing is unsent', async () => {
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(mockSignOut).toHaveBeenCalledWith();
    expect(screen.queryByRole('header', { name: pendingTitle })).toBeNull();
  });

  it('warns with the number of unsent records, and continuing keeps the session', async () => {
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('header', { name: pendingTitle })).toBeOnTheScreen();
    expect(screen.getByText(/Hay 3 registros sin enviar/)).toBeOnTheScreen();
    expect(screen.queryByText(/no se pudieron enviar/)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir y enviar' }));

    expect(screen.queryByRole('header', { name: pendingTitle })).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('uses the singular for one unsent record', async () => {
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 1, rejected: 0 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByText(/Hay 1 registro sin enviar/)).toBeOnTheScreen();
  });

  it('says that rejected records will not be sent on their own', async () => {
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 2 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByText(/2 de ellos no se pudieron enviar/)).toBeOnTheScreen();
  });

  it('signs out anyway with force', async () => {
    mockSignOut.mockResolvedValueOnce({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<Home />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Cerrar sesión igual' }));

    expect(mockSignOut).toHaveBeenLastCalledWith({ force: true });
  });

  it('ignores a second press while signing out is in progress', async () => {
    let finish: (result: { status: 'signed_out' }) => void = () => {};
    mockSignOut.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render(<Home />);
    const button = screen.getByRole('button', { name: 'Cerrar sesión' });

    // Both presses land before React re-renders the button as loading, so only the handler itself can ignore the second (Pressable's onClick is the keyboard and accessibility press).
    const click = () => button.props.onClick({ stopPropagation() {}, nativeEvent: {} });
    await act(async () => {
      click();
      click();
      finish({ status: 'signed_out' });
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it.each([
    [true, true],
    [false, false],
  ])('with sync connect failed %p the warning says records go out on reconnect: %p', async (connectFailed, shown) => {
    mockSyncConnectFailed = connectFailed;
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await screen.findByRole('header', { name: pendingTitle });
    expect(screen.queryByText(/los registros se envían cuando vuelva la conexión/) !== null).toBe(shown);
  });

  it('tells the person when signing out failed', async () => {
    mockSignOut.mockRejectedValue(new Error('storage'));
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByText('No pudimos cerrar la sesión. Inténtalo de nuevo.')).toBeOnTheScreen();
  });
});

describe('t', () => {
  it('returns the es-CO text of a known key', () => {
    expect(t('home.title')).toBe('TrailSkill');
  });

  it('returns the key itself when the translation is missing', () => {
    expect(t('home.missing')).toBe('home.missing');
  });
});
