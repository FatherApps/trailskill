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
  const onAddAthletes = jest.fn();
  function Probe() {
    useFinishRegistration('user-1', 'camila@example.test', drafts, createInMemoryAdultProfileRepository(), managed, onAddAthletes);
    return null;
  }
  await render(<Probe />);
  await waitFor(async () => expect(await drafts.load()).not.toEqual(draft));
  return onAddAthletes;
}

describe('useFinishRegistration routing', () => {
  it('opens the add screen for a guardian', async () => {
    const onAddAthletes = await mount({ ...base, swimmer: 'child' });
    await waitFor(() => expect(onAddAthletes).toHaveBeenCalledTimes(1));
  });

  it('does not open it for an adult', async () => {
    const onAddAthletes = await mount({ ...base, swimmer: 'adult' });
    expect(onAddAthletes).not.toHaveBeenCalled();
  });
});
