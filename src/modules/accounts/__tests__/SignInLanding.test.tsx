import { fireEvent, render, screen } from '@testing-library/react-native';

import { SignInLanding } from '../screens/SignInLanding';

// Avoids loading the native PowerSync database.
jest.mock('../../../core/sync', () => ({}));

const mockSession = {
  session: null,
  configError: null as string | null,
  requestCode: jest.fn(),
  verifyCode: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('../../../core/session', () => ({
  ...jest.requireActual('../../../core/session'),
  useSession: () => mockSession,
}));

const onCreateAccount = jest.fn();

beforeEach(() => {
  mockSession.configError = null;
  onCreateAccount.mockClear();
  mockSession.requestCode.mockReset().mockResolvedValue(undefined);
  mockSession.verifyCode.mockReset().mockResolvedValue(undefined);
});

async function openSignInTab() {
  await render(<SignInLanding onCreateAccount={onCreateAccount} />);
  await fireEvent.press(screen.getByRole('radio', { name: 'Ingresar' }));
}

describe('SignInLanding', () => {
  it('starts on "Crear cuenta" with its card and no sign-in form', async () => {
    await render(<SignInLanding onCreateAccount={onCreateAccount} />);

    expect(screen.getByRole('radio', { name: 'Crear cuenta' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Ingresar' })).not.toBeChecked();
    expect(screen.getByText('Cada entreno suma a tu camino.')).toBeOnTheScreen();
    expect(screen.queryByText('Hola de nuevo')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeOnTheScreen();
  });

  it('sends the "Crear cuenta" button to the registration', async () => {
    await render(<SignInLanding onCreateAccount={onCreateAccount} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(onCreateAccount).toHaveBeenCalledTimes(1);
  });

  it('shows "Hola de nuevo" and the email step on "Ingresar", without the card', async () => {
    await openSignInTab();

    expect(screen.getByRole('radio', { name: 'Ingresar' })).toBeChecked();
    expect(screen.getByRole('header', { name: 'Hola de nuevo' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
    expect(screen.queryByText('Cada entreno suma a tu camino.')).not.toBeOnTheScreen();
  });

  it('keeps the sign-in behavior on "Ingresar": the typed email is the only thing sent', async () => {
    await openSignInTab();

    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), ' ana@example.com ');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));

    // No createUser option: the session's default is shouldCreateUser: false (pinned in session.test.tsx).
    expect(mockSession.requestCode).toHaveBeenCalledWith('ana@example.com');
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeOnTheScreen();
  });

  it('goes back to the "Crear cuenta" tab from the sign-in form instead of leaving the screen', async () => {
    await openSignInTab();

    await fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByRole('radio', { name: 'Crear cuenta' })).toBeChecked();
    expect(onCreateAccount).not.toHaveBeenCalled();
  });
});
