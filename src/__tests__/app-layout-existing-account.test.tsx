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

let mockNotice: unknown;
jest.mock('../modules/accounts', () => ({
  ...jest.requireActual('../modules/accounts'),
  useFinishRegistration: () => mockNotice,
  usePendingInvitations: jest.fn(),
}));

const IN_USE = 'Ya hay una cuenta con este correo. Inicia sesión';

describe('app layout: account that already existed', () => {
  const dismiss = jest.fn();

  beforeEach(() => {
    dismiss.mockClear();
    mockSignOut.mockReset().mockResolvedValue({ status: 'signed_out' });
    mockNotice = { existing: true, email: 'camila@example.test', dismiss };
  });

  it('shows the sheet over the app with the existing copy', async () => {
    await render(<AppLayout />);

    expect(screen.getByText(IN_USE)).toBeOnTheScreen();
    expect(screen.getByText('camila@example.test')).toBeOnTheScreen();
  });

  it('shows no sheet when the account was new, or before there is anything to say', async () => {
    mockNotice = undefined;
    await render(<AppLayout />);

    expect(screen.queryByText(IN_USE)).not.toBeOnTheScreen();
  });

  it('enters the app: the sheet closes and the session stays', async () => {
    await render(<AppLayout />);
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('cancel signs out with the existing sign-out', async () => {
    await render(<AppLayout />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith());
  });
});
