import { createInMemoryAdultProfileRepository } from '../data/adultProfiles';
import {
  createInMemoryRegistrationDraftRepository,
  createSecureStoreRegistrationDraftRepository,
  finishRegistration,
  type RegistrationDraft,
} from '../data/registrationDraft';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockStore.set(key, value),
  deleteItemAsync: async (key: string) => void mockStore.delete(key),
}));
// The Supabase repository sits next to the in-memory one; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

const draft: RegistrationDraft = { swimmer: 'adult', firstName: ' Camila ', lastName: ' Rojas ', email: 'Camila@Example.test' };

beforeEach(() => mockStore.clear());

describe.each([
  ['in memory', () => createInMemoryRegistrationDraftRepository()],
  ['SecureStore', () => createSecureStoreRegistrationDraftRepository()],
])('registration draft repository (%s)', (_name, create) => {
  it('loads nothing at first, then what was saved, then nothing after clear', async () => {
    const drafts = create();
    expect(await drafts.load()).toBeNull();

    await drafts.save(draft);
    expect(await drafts.load()).toEqual(draft);

    await drafts.clear();
    expect(await drafts.load()).toBeNull();
  });
});

describe('SecureStore draft', () => {
  it('loads null when the stored text is not valid', async () => {
    mockStore.set('trailskill-registration-draft', '{not json');
    expect(await createSecureStoreRegistrationDraftRepository().load()).toBeNull();
  });
});

describe('finishRegistration', () => {
  const run = (drafts = createInMemoryRegistrationDraftRepository(draft), profiles = createInMemoryAdultProfileRepository()) =>
    finishRegistration({ userId: 'user-1', email: ' camila@example.test ', drafts, profiles }).then(() => ({ drafts, profiles }));

  it('saves the trimmed profile and clears the draft when the email matches', async () => {
    const { drafts, profiles } = await run();

    expect(profiles.saved).toEqual([{ userId: 'user-1', firstName: 'Camila', lastName: 'Rojas' }]);
    expect(await drafts.load()).toBeNull();
  });

  it('does nothing for a draft typed for another email', async () => {
    const other = createInMemoryRegistrationDraftRepository({ ...draft, email: 'other@example.test' });
    const { drafts, profiles } = await run(other);

    expect(profiles.saved).toEqual([]);
    expect(await drafts.load()).not.toBeNull();
  });

  it('does nothing when a name is blank', async () => {
    const blank = createInMemoryRegistrationDraftRepository({ ...draft, lastName: '  ' });
    const { profiles } = await run(blank);

    expect(profiles.saved).toEqual([]);
  });

  it('keeps the draft when the profile cannot be saved', async () => {
    const drafts = createInMemoryRegistrationDraftRepository(draft);
    await expect(run(drafts, createInMemoryAdultProfileRepository({ failing: true }))).rejects.toThrow('save failed');

    expect(await drafts.load()).toEqual(draft);
  });
});
