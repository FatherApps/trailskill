import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import AppLayout from '../app/(app)/_layout';

// Avoid loading the native PowerSync database.
jest.mock('../core/sync', () => ({ db: {}, useGlobalSyncSummary: () => ({ lastSyncedAt: null }) }));
const mockSignOut = jest.fn();
jest.mock('../core/session', () => ({
  ...jest.requireActual('../core/session'),
  useSession: () => ({ session: { user: { id: 'user-1', email: 'camila@example.test' } }, signOut: mockSignOut }),
}));
jest.mock('expo-router', () => ({
  Stack: () => null,
  useSegments: () => ['(app)'],
  useRouter: () => ({ replace: jest.fn() }),
}));

let mockHasNotice = true;
const mockDismiss = jest.fn();
jest.mock('../modules/accounts', () => ({
  ...jest.requireActual('../modules/accounts'),
  // Like the real hook, the notice goes away once it is dismissed.
  useFinishRegistration: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const [dismissed, setDismissed] = require('react').useState(false);
    return mockHasNotice && !dismissed
      ? { existing: true, email: 'camila@example.test', dismiss: () => (mockDismiss(), setDismissed(true)) }
      : undefined;
  },
  usePendingInvitations: jest.fn(),
}));

const IN_USE = 'Ya hay una cuenta con este correo. Inicia sesión';

describe('app layout: account that already existed', () => {
  beforeEach(() => {
    mockDismiss.mockClear();
    mockSignOut.mockReset().mockResolvedValue({ status: 'signed_out' });
    mockHasNotice = true;
  });

  it('shows the sheet over the app with the existing copy', async () => {
    await render(<AppLayout />);

    expect(screen.getByText(IN_USE)).toBeOnTheScreen();
    expect(screen.getByText('camila@example.test')).toBeOnTheScreen();
  });

  it('shows no sheet when the account was new, or before there is anything to say', async () => {
    mockHasNotice = false;
    await render(<AppLayout />);

    expect(screen.queryByText(IN_USE)).not.toBeOnTheScreen();
  });

  it('enters the app: the sheet closes and the session stays', async () => {
    await render(<AppLayout />);
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(IN_USE)).not.toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it.each([
    ['Android back', () => fireEvent(screen.container.queryAll((node) => typeof node.props.onRequestClose === 'function')[0], 'requestClose')],
    ['a tap outside', () => fireEvent.press(screen.getByTestId('confirm-sheet-scrim'))],
  ])('%s closes the sheet, keeps the session and never signs out', async (_how, dismissIt) => {
    await render(<AppLayout />);
    await dismissIt();

    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(IN_USE)).not.toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('cancel signs out with the existing sign-out', async () => {
    await render(<AppLayout />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith());
  });
});
