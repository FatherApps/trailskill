import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SignIn from '../app/(auth)/sign-in';
import { CodeMismatchError } from '../core/session';

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
  createSecureStoreRegistrationDraftRepository: () => ({ load: () => mockLoadDraft() }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const email = 'ana@example.com';

beforeEach(() => {
  mockSession.configError = null;
  mockLoadDraft.mockReset().mockResolvedValue(null);
  mockPush.mockClear();
  mockSession.requestCode.mockReset().mockResolvedValue(undefined);
  mockSession.verifyCode.mockReset().mockResolvedValue(undefined);
});

async function openCodeStep() {
  await render(<SignIn />);
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), email);
  await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
  await screen.findByLabelText('Código de 6 dígitos');
}

describe('sign-in screen', () => {
  it('offers to create an account', async () => {
    await render(<SignIn />);

    await fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(mockPush).toHaveBeenCalledWith('/register');
  });

  it('never redirects to the registration nor mentions the draft left on the phone', async () => {
    mockLoadDraft.mockResolvedValue({ swimmer: 'adult', firstName: 'Ana', lastName: 'Mora', email: email });
    await render(<SignIn />);

    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
    expect(screen.queryByText(/Retomar|Empezar de nuevo|ana@example/)).not.toBeOnTheScreen();
    expect(mockLoadDraft).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('replaces the form with a not-ready notice when the server is not configured', async () => {
    mockSession.configError = 'Missing EXPO_PUBLIC_SUPABASE_URL';
    await render(<SignIn />);

    expect(screen.getByText('La app no está lista para ingresar')).toBeTruthy();
    expect(screen.getByText('Falta la configuración del servidor. Avísale a quien administra la app.')).toBeTruthy();
    expect(screen.queryByLabelText('Correo electrónico')).toBeNull();
    expect(screen.queryByText(/EXPO_PUBLIC/)).toBeNull();
  });

  it('requests a code for the typed email and then asks for it', async () => {
    await openCodeStep();

    expect(mockSession.requestCode).toHaveBeenCalledWith(email);
    // The help text is the field's accessibility hint.
    expect(screen.getByLabelText('Código de 6 dígitos').props.accessibilityHint).toBe(
      `Te enviamos un código de 6 dígitos a ${email}.`,
    );
  });

  it('verifies only once the code has 6 digits', async () => {
    await openCodeStep();
    const field = screen.getByLabelText('Código de 6 dígitos');

    await fireEvent.changeText(field, '12345');
    expect(mockSession.verifyCode).not.toHaveBeenCalled();

    await fireEvent.changeText(field, '123456');
    expect(mockSession.verifyCode).toHaveBeenCalledWith(email, '123456');
  });

  it('keeps only digits in the code', async () => {
    await openCodeStep();

    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '12a3 4');

    expect(screen.getByLabelText('Código de 6 dígitos').props.value).toBe('1234');
    expect(mockSession.verifyCode).not.toHaveBeenCalled();
  });

  it('tells a wrong code apart from other failures', async () => {
    mockSession.verifyCode.mockRejectedValueOnce(new CodeMismatchError());
    await openCodeStep();

    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '000000');

    expect(
      await screen.findByText('Ese código no coincide. Revisa el último mensaje o pide uno nuevo.'),
    ).toBeOnTheScreen();

    mockSession.verifyCode.mockRejectedValueOnce(new Error('offline'));
    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '111111');

    expect(await screen.findByText('No pudimos revisar el código. Inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('asks for a new code from the code step', async () => {
    await openCodeStep();
    mockSession.requestCode.mockClear();

    await fireEvent.press(screen.getByRole('button', { name: 'Pedir un código nuevo' }));

    expect(mockSession.requestCode).toHaveBeenCalledWith(email);
  });

  it('says a new code was sent', async () => {
    await openCodeStep();

    await fireEvent.press(screen.getByRole('button', { name: 'Pedir un código nuevo' }));

    expect(await screen.findByText('Te enviamos un código nuevo.')).toBeOnTheScreen();
  });

  it('says a new code could not be sent, not that verification failed', async () => {
    await openCodeStep();
    mockSession.requestCode.mockRejectedValueOnce(new Error('offline'));

    await fireEvent.press(screen.getByRole('button', { name: 'Pedir un código nuevo' }));

    expect(
      await screen.findByText('No pudimos enviar un código nuevo. Inténtalo de nuevo en un momento.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('No pudimos revisar el código. Inténtalo de nuevo.')).toBeNull();
  });

  it('ignores a late failure from a verification the person already replaced', async () => {
    let rejectFirst: (error: Error) => void = () => {};
    mockSession.verifyCode
      .mockReset()
      .mockImplementation((_email: string, code: string) =>
        code === '111111' ? new Promise((_, reject) => (rejectFirst = reject)) : new Promise(() => {}),
      );
    await openCodeStep();
    const field = screen.getByLabelText('Código de 6 dígitos');

    await fireEvent.changeText(field, '111111');
    await fireEvent.changeText(field, '11111');
    await fireEvent.changeText(field, '111112');
    await act(async () => rejectFirst(new CodeMismatchError()));

    expect(screen.queryByText(/Ese código no coincide/)).toBeNull();
  });

  it('shows the failure of the latest verification', async () => {
    let rejectLatest: (error: Error) => void = () => {};
    mockSession.verifyCode.mockReset().mockImplementation(() => new Promise((_, reject) => (rejectLatest = reject)));
    await openCodeStep();

    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '111111');
    await act(async () => rejectLatest(new CodeMismatchError()));

    expect(await screen.findByText(/Ese código no coincide/)).toBeOnTheScreen();
  });

  it('goes back to the email step', async () => {
    await openCodeStep();

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
  });

  it('shows a generic error and stays on the email step when the request fails', async () => {
    mockSession.requestCode.mockRejectedValueOnce(new Error('unknown email'));
    await render(<SignIn />);

    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), email);
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));

    expect(await screen.findByText('No pudimos enviar el código')).toBeOnTheScreen();
    expect(screen.getByText('Revisa el correo y tu conexión, e inténtalo de nuevo.')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen());
    expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull();
  });
});
