import { render, screen } from '@testing-library/react-native';

import { galleryEntries } from '..';
import { t } from '../../../core/i18n';
import { SHOW_PROVIDERS } from '../providerAvailability';

// The accounts index reaches the PowerSync repository; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, RecordSyncStatus: () => null }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
// The flag is set per test, so both values are covered whatever the real constant says.
let mockShowProviders = false;
jest.mock('../providerAvailability', () => ({
  get SHOW_PROVIDERS() {
    return mockShowProviders;
  },
}));

afterEach(() => {
  mockShowProviders = false;
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
      'resumeRegistration',
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
    expect(statesOf('resumeRegistration')).toEqual(['initial']);
  });

  // Prefix match: the offline button name carries the reason after the provider.
  // The last iteration is the one that would leak into later tests, so it is the one that must differ from the reset.
  describe.each([false, true])('with SHOW_PROVIDERS %s', (showProviders) => {
    beforeEach(() => {
      mockShowProviders = showProviders;
    });

    it.each(statesOf('accountDetails'))('accountDetails %s shows the provider buttons only when the flag is on', async (state) => {
      const entry = galleryEntries.find((candidate) => candidate.id === 'accountDetails')!;
      await render(entry.states[state]());

      for (const provider of ['google', 'microsoft']) {
        const name = new RegExp(`^${t(`accounts.providers.${provider}`)}`);
        const button = screen.queryByRole('button', { name });
        if (showProviders) expect(button).not.toBeNull();
        else expect(button).toBeNull();
      }
    });

    it('accountDetails offline disables the provider buttons and says why, only when the flag is on', async () => {
      const entry = galleryEntries.find((candidate) => candidate.id === 'accountDetails')!;
      await render(entry.states.offline());

      for (const provider of ['google', 'microsoft']) {
        const label = t(`accounts.providers.${provider}`);
        const button = screen.queryByRole('button', { name: new RegExp(`^${label}`) });
        if (!showProviders) {
          expect(button).toBeNull();
          continue;
        }
        if (button === null) throw new Error(`No button named "${label}…" with the flag on: the provider buttons are missing`);
        expect(button).toBeDisabled();
        // The reason is announced in the name or, if it moves, in the hint: either keeps the test valid.
        const announced = `${button.props.accessibilityLabel} ${button.props.accessibilityHint ?? ''}`;
        expect(announced).toContain(t('accounts.offline.reason'));
      }
    });
  });

  it('does not carry the flag of the last SHOW_PROVIDERS iteration into the tests that follow', () => {
    expect(SHOW_PROVIDERS).toBe(false);
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
