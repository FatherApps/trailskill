import { render, waitFor } from '@testing-library/react-native';

import { createInMemoryAthleteRepository } from '../../athletes';
import { createInMemoryAdultProfileRepository } from '../data/adultProfiles';
import { createInMemoryManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import { createInMemoryRegistrationDraftRepository, useFinishRegistration, type RegistrationDraft } from '../data/registrationDraft';

// The Supabase repository sits next to the in-memory one; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {}, writeBatch: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('expo-secure-store', () => ({}));

const base: RegistrationDraft = { firstName: 'Camila', lastName: 'Rojas', email: 'camila@example.test' };

async function mount(draft: RegistrationDraft) {
  const links: ManagedAthleteRow[] = [];
  const managed = createInMemoryManagedAthleteProfileRepository(createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository(links)), links);
  const drafts = createInMemoryRegistrationDraftRepository(draft);
  const onNext = jest.fn();
  function Probe() {
    useFinishRegistration('user-1', 'camila@example.test', drafts, createInMemoryAdultProfileRepository(), managed, onNext);
    return null;
  }
  await render(<Probe />);
  await waitFor(async () => expect(await drafts.load()).not.toEqual(draft));
  return onNext;
}

describe('useFinishRegistration routing', () => {
  it('opens the add screen for a guardian', async () => {
    const onNext = await mount({ ...base, swimmer: 'child' });
    await waitFor(() => expect(onNext).toHaveBeenCalledWith('add_athletes'));
  });

  it('opens the authorizations for an adult', async () => {
    const onNext = await mount({ ...base, swimmer: 'adult' });
    await waitFor(() => expect(onNext).toHaveBeenCalledWith('authorizations'));
  });
});
