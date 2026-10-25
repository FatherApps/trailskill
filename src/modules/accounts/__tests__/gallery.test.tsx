import { render, screen } from '@testing-library/react-native';

import { galleryEntries } from '..';

// The accounts index reaches the PowerSync repository; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const statesOf = (id: string) => Object.keys(galleryEntries.find((entry) => entry.id === id)!.states);

describe('accounts gallery entries', () => {
  it('has one entry per screen with every listed state', () => {
    expect(galleryEntries.map((entry) => entry.id)).toEqual(['whoSwims', 'accountDetails', 'signIn']);
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
  });

  it.each(galleryEntries.flatMap((entry) => Object.keys(entry.states).map((state) => [entry.id, state] as const)))(
    'renders %s %s',
    async (id, state) => {
      const entry = galleryEntries.find((candidate) => candidate.id === id)!;
      await render(entry.states[state]());

      expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    },
  );
});
