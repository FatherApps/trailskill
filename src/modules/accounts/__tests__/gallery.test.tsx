import { render, screen } from '@testing-library/react-native';

import { galleryEntries } from '..';
import { t } from '../../../core/i18n';
import { ENABLED_PROVIDERS } from '../providerAvailability';

// The accounts index reaches the PowerSync repository; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, RecordSyncStatus: () => null }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
// The list is set per test, so any list is covered whatever the real constant says.
let mockEnabledProviders: string[] = [];
jest.mock('../providerAvailability', () => ({
  get ENABLED_PROVIDERS() {
    return mockEnabledProviders;
  },
}));

afterEach(() => {
  mockEnabledProviders = [];
});

const statesOf = (id: string) => Object.keys(galleryEntries.find((entry) => entry.id === id)!.states);

describe('accounts gallery entries', () => {
  it('has one entry per screen with every listed state', () => {
    expect(galleryEntries.map((entry) => entry.id)).toEqual([
      'whoSwims',
      'accountDetails',
      'signIn',
      'authorizations',
      'consentCard',
      'addAthletes',
      'providerRegistration',
      'resumeRegistration',
      'existingAccountSheet',
    ]);
    expect(statesOf('whoSwims')).toEqual(['initial', 'child', 'adult', 'invitation', 'invalidInvitation']);
    expect(statesOf('accountDetails')).toEqual([
      'initial',
      'codeSent',
      'codeMismatch',
      'emailInUse',
      'offline',
      'required',
      'noSignal',
      'sending',
      'verifying',
      'requestFailed',
      'verifyFailed',
      'invitation',
    ]);
    expect(statesOf('signIn')).toEqual(['initial', 'codeSent', 'codeMismatch', 'sending', 'offline']);
    expect(statesOf('authorizations')).toEqual(['initial']);
    expect(statesOf('consentCard')).toEqual(['unchecked', 'accepted']);
    expect(statesOf('addAthletes')).toEqual(['empty', 'withData', 'error', 'withCategories']);
    expect(statesOf('providerRegistration')).toEqual(['google', 'email']);
    expect(statesOf('resumeRegistration')).toEqual(['initial']);
    expect(statesOf('existingAccountSheet')).toEqual(['initial']);
  });

  // Prefix match: the offline button name carries the reason after the provider.
  // The last iteration is the one that would leak into later tests, so it is the one that must differ from the reset.
  describe.each([[[]], [['google']], [['google', 'microsoft']]] as string[][][])('with the providers %j enabled', (enabled) => {
    beforeEach(() => {
      mockEnabledProviders = enabled;
    });

    it.each(statesOf('accountDetails'))('accountDetails %s shows exactly the enabled provider buttons', async (state) => {
      const entry = galleryEntries.find((candidate) => candidate.id === 'accountDetails')!;
      await render(entry.states[state]());

      for (const provider of ['google', 'microsoft']) {
        const name = new RegExp(`^${t(`accounts.providers.${provider}`)}`);
        const button = screen.queryByRole('button', { name });
        if (enabled.includes(provider)) expect(button).not.toBeNull();
        else expect(button).toBeNull();
      }
    });

    it('accountDetails offline disables the enabled provider buttons and says why', async () => {
      const entry = galleryEntries.find((candidate) => candidate.id === 'accountDetails')!;
      await render(entry.states.offline());

      for (const provider of ['google', 'microsoft']) {
        const label = t(`accounts.providers.${provider}`);
        const button = screen.queryByRole('button', { name: new RegExp(`^${label}`) });
        if (!enabled.includes(provider)) {
          expect(button).toBeNull();
          continue;
        }
        if (button === null) throw new Error(`No button named "${label}…" with the provider enabled: the provider buttons are missing`);
        expect(button).toBeDisabled();
        // The reason is announced in the name or, if it moves, in the hint: either keeps the test valid.
        const announced = `${button.props.accessibilityLabel} ${button.props.accessibilityHint ?? ''}`;
        expect(announced).toContain(t('accounts.offline.reason'));
      }
    });
  });

  it('does not carry the list of the last iteration into the tests that follow', () => {
    expect(ENABLED_PROVIDERS).toEqual([]);
  });

  describe('providerRegistration', () => {
    const state = (name: string) => galleryEntries.find((entry) => entry.id === 'providerRegistration')!.states[name]();

    it('google shows the verified email, the provider and the names it gives', async () => {
      await render(state('google'));

      expect(screen.getByText('camila@example.test')).toBeOnTheScreen();
      expect(screen.getByText('Cuenta de Google · correo verificado')).toBeOnTheScreen();
      expect(screen.getByDisplayValue('Camila')).toBeOnTheScreen();
      expect(screen.getByDisplayValue('Rojas')).toBeOnTheScreen();
    });

    it('email shows the verified email with no provider and no names', async () => {
      await render(state('email'));

      expect(screen.getByText('camila@example.test')).toBeOnTheScreen();
      expect(screen.getByText('Correo verificado')).toBeOnTheScreen();
      expect(screen.queryByText(/Cuenta de/)).toBeNull();
      expect(screen.queryByDisplayValue('Camila')).toBeNull();
    });
  });

  it.each(galleryEntries.flatMap((entry) => Object.keys(entry.states).map((state) => [entry.id, state] as const)))(
    'renders %s %s',
    async (id, state) => {
      const entry = galleryEntries.find((candidate) => candidate.id === id)!;
      await render(entry.states[state]());

      // The consent card has a checkbox (unchecked) or a withdraw button (accepted).
      expect(screen.queryAllByRole('button').length + screen.queryAllByRole('checkbox').length).toBeGreaterThan(0);
    },
  );
});
