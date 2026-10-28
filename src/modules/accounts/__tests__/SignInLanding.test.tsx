import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '../../../core/theme';
import { t } from '../i18n';
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
    expect(screen.getByTestId('color-card-title-dot', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Los menores no crean cuenta: los registra su acudiente.')).toBeOnTheScreen();
    expect(screen.getByText('¿Te invitó una escuela? Abre el enlace de tu invitación.')).toBeOnTheScreen();
    expect(screen.queryByText('Hola de nuevo')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Términos|Política de datos/)).not.toBeOnTheScreen();
  });

  it('keeps the {{dot}} marker of the translated title through t() and puts the lilac dot after "entreno"', async () => {
    expect(t('accounts.landing.create_card_title')).toBe('Cada entreno{{dot}} suma a tu camino.');

    await render(<SignInLanding onCreateAccount={onCreateAccount} />);

    const parts = screen.getByText('Cada entreno suma a tu camino.').children.map((child) => (typeof child === 'string' ? child : child.props.testID));
    expect(parts).toEqual(['Cada entreno', 'color-card-title-dot', ' suma a tu camino.']);
    expect(screen.queryByText(/\{\{dot\}\}/)).not.toBeOnTheScreen();
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
    expect(screen.queryByRole('button', { name: 'Crear cuenta' })).not.toBeOnTheScreen();
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

  it('shows "Sin señal" as a white status card with the wifi_off icon, not as a yellow banner or a button', async () => {
    await openSignInTab();

    const notice = screen.getByTestId('offline-notice');
    expect(notice).toHaveStyle({ backgroundColor: colors.light['surface-1'] });
    expect(notice).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(notice.props.accessibilityRole).toBeUndefined();
    expect(notice.props.onPress).toBeUndefined();
    expect(screen.queryByTestId('banner')).not.toBeOnTheScreen();
    expect(screen.getByTestId('offline-notice-icon', { includeHiddenElements: true })).toBeTruthy();
  });

  it('underlines "Pide ayuda a tu escuela" without making it a link', async () => {
    await openSignInTab();

    const action = screen.getByText('Pide ayuda a tu escuela');
    expect(StyleSheet.flatten(action.props.style)).toMatchObject({ textDecorationLine: 'underline' });
    expect(screen.queryByRole('link')).not.toBeOnTheScreen();
  });

  it.each(['create', 'sign-in'] as const)('sticks the %s footer to the bottom of the screen', async (tab) => {
    if (tab === 'sign-in') await openSignInTab();
    else await render(<SignInLanding onCreateAccount={onCreateAccount} />);

    expect(StyleSheet.flatten(screen.getByTestId('sign-in-footer').props.style)).toMatchObject({ flex: 1, justifyContent: 'flex-end' });
  });

  it('puts the shield icon beside the minors notice on "Crear cuenta"', async () => {
    await render(<SignInLanding onCreateAccount={onCreateAccount} />);

    const notice = screen.getByTestId('minors-notice');
    expect(notice).toContainElement(screen.getByTestId('minors-notice-icon', { includeHiddenElements: true }));
    expect(notice).toContainElement(screen.getByText('Los menores no crean cuenta: los registra su acudiente.'));
  });
});
