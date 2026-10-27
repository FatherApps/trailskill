import { render, screen } from '@testing-library/react-native';

import { galleryEntries } from '..';
import { t } from '../../../core/i18n';
import { SHOW_PROVIDERS } from '../providerAvailability';

// The accounts index reaches the PowerSync repository; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, RecordSyncStatus: () => null }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

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
  it.each(statesOf('accountDetails'))('accountDetails %s shows the provider buttons only when SHOW_PROVIDERS is on', async (state) => {
    const entry = galleryEntries.find((candidate) => candidate.id === 'accountDetails')!;
    await render(entry.states[state]());

    for (const provider of ['google', 'microsoft']) {
      const name = new RegExp(`^${t(`accounts.providers.${provider}`)}`);
      const button = screen.queryByRole('button', { name });
      if (SHOW_PROVIDERS) expect(button).not.toBeNull();
      else expect(button).toBeNull();
    }
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
