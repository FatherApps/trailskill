import { fireEvent, render, screen } from '@testing-library/react-native';

import SignIn from '../app/(auth)/sign-in';

// Avoids loading the native PowerSync database.
jest.mock('../core/sync', () => ({}));

const mockSession = {
  session: null,
  configError: null as string | null,
  requestCode: jest.fn(),
  verifyCode: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('../core/session', () => ({
  ...jest.requireActual('../core/session'),
  useSession: () => mockSession,
}));

// A draft waits on this phone: the sign-in must neither read it nor show anything about it before a session exists.
const mockLoadDraft = jest.fn();
jest.mock('../modules/accounts', () => ({
  ...jest.requireActual('../modules/accounts'),
  createSecureStoreRegistrationDraftRepository: () => ({ load: () => mockLoadDraft() }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockLoadDraft.mockReset().mockResolvedValue(null);
  mockPush.mockClear();
});

describe('sign-in route', () => {
  it('renders the sign-in container and sends "Crear cuenta" to the registration', async () => {
    await render(<SignIn />);

    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(mockPush).toHaveBeenCalledWith('/register');
  });

  it('never redirects to the registration nor mentions the draft left on the phone', async () => {
    mockLoadDraft.mockResolvedValue({ swimmer: 'adult', firstName: 'Ana', lastName: 'Mora', email: 'ana@example.com' });
    await render(<SignIn />);

    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
    expect(screen.queryByText(/Retomar|Empezar de nuevo|ana@example/)).not.toBeOnTheScreen();
    expect(mockLoadDraft).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
