import { render, screen } from '@testing-library/react-native';

import { galleryEntries } from '..';

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
    ]);
    expect(statesOf('whoSwims')).toEqual(['initial', 'child', 'adult', 'invitation']);
    expect(statesOf('accountDetails')).toEqual([
      'initial',
      'codeSent',
      'codeMismatch',
      'emailInUse',
      'offline',
      'required',
      'noSignal',
      'sending',
      'invitation',
    ]);
    expect(statesOf('signIn')).toEqual(['initial', 'codeSent', 'codeMismatch', 'sending', 'offline']);
    expect(statesOf('authorizations')).toEqual(['initial']);
    expect(statesOf('consentCard')).toEqual(['unchecked', 'accepted']);
    expect(statesOf('addAthletes')).toEqual(['withData']);
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
