import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { t } from '../i18n';
import { SignInLanding } from '../screens/SignInLanding';

// Avoids loading the native PowerSync database.
jest.mock('../../../core/sync', () => ({}));
// The flag is set per test, so the landing is checked against both values whatever the real constant says.
let mockShowProviders = false;
jest.mock('../providerAvailability', () => ({
  get SHOW_PROVIDERS() {
    return mockShowProviders;
  },
}));

const mockSession = {
  session: null,
  configError: null as string | null,
  requestCode: jest.fn(),
  verifyCode: jest.fn(),
  signInWithProvider: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('../../../core/session', () => ({
  ...jest.requireActual('../../../core/session'),
  useSession: () => mockSession,
}));

const providerButton = (provider: 'google' | 'microsoft') =>
  screen.getByRole('button', { name: new RegExp(`^${t(`accounts.providers.${provider}`)}`) });
const hasProviderButton = (provider: 'google' | 'microsoft') =>
  screen.queryByRole('button', { name: new RegExp(`^${t(`accounts.providers.${provider}`)}`) }) !== null;

async function renderLanding(tab: 'create' | 'sign-in') {
  await render(<SignInLanding onCreateAccount={jest.fn()} />);
  if (tab === 'sign-in') await fireEvent.press(screen.getByRole('radio', { name: 'Ingresar' }));
}

beforeEach(() => {
  mockShowProviders = true;
  mockSession.configError = null;
  mockSession.signInWithProvider.mockReset().mockResolvedValue('signed_in');
});

describe('SignInLanding provider sign-in', () => {
  it.each(['create', 'sign-in'] as const)('shows the provider buttons on the "%s" tab exactly when SHOW_PROVIDERS is on', async (tab) => {
    await renderLanding(tab);
    expect(hasProviderButton('google')).toBe(true);
    expect(hasProviderButton('microsoft')).toBe(true);
  });

  it.each(['create', 'sign-in'] as const)('hides them on the "%s" tab when SHOW_PROVIDERS is off', async (tab) => {
    mockShowProviders = false;

    await renderLanding(tab);

    expect(hasProviderButton('google')).toBe(false);
    expect(hasProviderButton('microsoft')).toBe(false);
  });

  it.each(['create', 'sign-in'] as const)('signs in with Google and Microsoft from the "%s" tab', async (tab) => {
    await renderLanding(tab);

    await fireEvent.press(providerButton('google'));
    await waitFor(() => expect(mockSession.signInWithProvider).toHaveBeenLastCalledWith('google'));
    await fireEvent.press(providerButton('microsoft'));
    await waitFor(() => expect(mockSession.signInWithProvider).toHaveBeenLastCalledWith('azure'));
  });

  it('shows no error when the person cancels in the browser', async () => {
    mockSession.signInWithProvider.mockResolvedValue('cancelled');
    await renderLanding('sign-in');

    await fireEvent.press(providerButton('google'));

    await waitFor(() => expect(mockSession.signInWithProvider).toHaveBeenCalled());
    expect(screen.queryByText(t('accounts.failure.provider_title'))).toBeNull();
    expect(providerButton('google')).toBeOnTheScreen();
  });

  it('tells the person the provider failed and keeps the email code available', async () => {
    mockSession.signInWithProvider.mockRejectedValue(new Error('provider is not enabled'));
    await renderLanding('sign-in');

    await fireEvent.press(providerButton('microsoft'));

    expect(await screen.findByText(t('accounts.failure.provider_title'))).toBeOnTheScreen();
    expect(screen.getByText(t('accounts.failure.provider_message'))).toBeOnTheScreen();
    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
  });

  it('retries the provider that failed offline', async () => {
    mockSession.signInWithProvider.mockRejectedValueOnce(new AuthRetryableFetchError('offline', 0)).mockResolvedValue('cancelled');
    await renderLanding('create');
    await fireEvent.press(providerButton('microsoft'));
    await screen.findByText(t('accounts.failure.offline_title'));

    await fireEvent.press(screen.getByRole('button', { name: t('sync.retry') }));

    await waitFor(() => expect(mockSession.signInWithProvider).toHaveBeenCalledTimes(2));
    expect(mockSession.signInWithProvider).toHaveBeenLastCalledWith('azure');
    await waitFor(() => expect(screen.queryByText(t('accounts.failure.offline_title'))).toBeNull());
  });

  // The buttons push the footer below the fold on a phone: it must stay inside the scroll to be reachable.
  it('keeps the help line and the offline notice inside the scroll on "Ingresar" with the providers shown', async () => {
    await renderLanding('sign-in');

    const scroll = within(screen.getByTestId('sign-in-scroll'));

    expect(scroll.getByText('¿No puedes entrar? Pide ayuda a tu escuela')).toBeOnTheScreen();
    expect(scroll.getByTestId('offline-notice')).toBeOnTheScreen();
  });

  it('opens the browser once when a button is pressed again before it returns', async () => {
    let finish: (result: 'cancelled') => void = () => {};
    mockSession.signInWithProvider.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await renderLanding('create');

    await fireEvent.press(providerButton('google'));
    await fireEvent.press(providerButton('microsoft'));
    await act(async () => finish('cancelled'));

    expect(mockSession.signInWithProvider).toHaveBeenCalledTimes(1);
  });
});
