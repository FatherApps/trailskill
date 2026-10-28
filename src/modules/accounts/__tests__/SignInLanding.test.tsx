import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors } from '../../../core/theme';
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
  it('starts on "Crear cuenta": header, lime card, footer and no sign-in form', async () => {
    await render(<SignInLanding onCreateAccount={onCreateAccount} />);

    expect(screen.getByRole('image', { name: 'TrailSkill' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Crear cuenta' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Ingresar' })).not.toBeChecked();
    expect(screen.getByText('Cada entreno suma a tu camino.')).toBeOnTheScreen();
    expect(screen.getByText('Tiempos, historial y marcas de cada deportista.')).toBeOnTheScreen();
    expect(screen.getByText('Cada entreno suma a tu camino.').parent).toHaveStyle({ backgroundColor: colors.light.lime });
    expect(screen.getByTestId('color-card-ring', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('color-card-accent', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Los menores no crean cuenta: los registra su acudiente.')).toBeOnTheScreen();
    expect(screen.getByText('¿Te invitó una escuela? Abre el enlace de tu invitación.')).toBeOnTheScreen();
    expect(screen.queryByText('Hola de nuevo')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Términos|Política de datos/)).not.toBeOnTheScreen();
  });

  it('puts the card above the tabs', async () => {
    await render(<SignInLanding onCreateAccount={onCreateAccount} />);

    const order = screen.toJSON() && JSON.stringify(screen.toJSON());
    expect(order!.indexOf('Cada entreno suma a tu camino.')).toBeLessThan(order!.indexOf('Crear cuenta o ingresar'));
  });

  it('keeps everything reachable on small screens, large text or an open keyboard', async () => {
    await render(<SignInLanding onCreateAccount={onCreateAccount} />);

    expect(screen.getByTestId('sign-in-scroll')).toHaveProp('keyboardShouldPersistTaps', 'handled');
  });

  it('sends the "Crear cuenta" button to the registration', async () => {
    await render(<SignInLanding onCreateAccount={onCreateAccount} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(onCreateAccount).toHaveBeenCalledTimes(1);
  });

  it('shows the lilac card, the email step and the footer on "Ingresar", with a single title', async () => {
    await openSignInTab();

    expect(screen.getByRole('image', { name: 'TrailSkill' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Ingresar' })).toBeChecked();
    expect(screen.getByText('Hola de nuevo')).toBeOnTheScreen();
    expect(screen.getByText('Hola de nuevo').parent).toHaveStyle({ backgroundColor: colors.light.lilac });
    expect(screen.getByTestId('color-card-ring', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Ingresa con la misma opción que usaste al crear tu cuenta.')).toBeOnTheScreen();
    expect(screen.queryByText('Ingresa a TrailSkill')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
    expect(screen.getByText(/Sin señal:/)).toBeOnTheScreen();
    expect(screen.getByText(/para ingresar necesitas conexión/)).toBeOnTheScreen();
    expect(screen.getByText(/tus datos guardados siguen disponibles/)).toBeOnTheScreen();
    expect(screen.getByText('¿No puedes entrar? Pide ayuda a tu escuela')).toBeOnTheScreen();
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
