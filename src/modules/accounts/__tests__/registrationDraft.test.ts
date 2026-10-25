import { createInMemoryAthleteRepository } from '../../athletes';
import { createInMemoryAdultProfileRepository } from '../data/adultProfiles';
import { createInMemoryManagedAthleteProfileRepository } from '../data/managedAthleteProfiles';
import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import {
  createInMemoryRegistrationDraftRepository,
  createSecureStoreRegistrationDraftRepository,
  finishRegistration,
  loadResumableDraft,
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
    expect(await drafts.load()).toMatchObject(draft);

    await drafts.clear();
    expect(await drafts.load()).toBeNull();
  });
});

describe('SecureStore draft', () => {
  it('loads null when the stored text is not valid', async () => {
    mockStore.set('trailskill-registration-draft', '{not json');
    expect(await createSecureStoreRegistrationDraftRepository().load()).toBeNull();
  });

  it('stamps when the draft was last saved', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(5_000);
    const drafts = createSecureStoreRegistrationDraftRepository();
    await drafts.save(draft);
    now.mockReturnValue(9_000);
    await drafts.save(draft);
    now.mockRestore();

    expect((await drafts.load())?.savedAt).toBe(9_000);
  });
});

describe('loadResumableDraft', () => {
  const NOW = 1_000_000_000;
  const HOUR = 60 * 60 * 1000;
  const typed: RegistrationDraft = { swimmer: 'adult', firstName: 'Camila', lastName: 'Rojas', email: 'camila@example.test', savedAt: NOW - HOUR };

  it('returns a draft typed before the account existed', async () => {
    expect(await loadResumableDraft(createInMemoryRegistrationDraftRepository(typed), NOW)).toEqual(typed);
  });

  it.each([
    ['older than 24 hours', { ...typed, savedAt: NOW - 25 * HOUR }],
    ['saved before drafts were stamped', { ...typed, savedAt: undefined }],
  ])('discards a draft %s', async (_name, stale) => {
    const drafts = createInMemoryRegistrationDraftRepository(stale);

    expect(await loadResumableDraft(drafts, NOW)).toBeNull();
    expect(await drafts.load()).toBeNull();
  });

  it.each([
    ['only the swimmer choice', { swimmer: 'child', firstName: '', lastName: '', email: '', savedAt: NOW }],
    ['no swimmer choice', { ...typed, swimmer: undefined }],
    ['an account that already exists (resume step)', { ...typed, step: 'authorizations' }],
    ['an account that already exists (blank names)', { ...typed, firstName: '', lastName: '' }],
  ] as [string, RegistrationDraft][])('offers nothing for %s and leaves it alone', async (_name, kept) => {
    const drafts = createInMemoryRegistrationDraftRepository(kept);

    expect(await loadResumableDraft(drafts, NOW)).toBeNull();
    expect(await drafts.load()).toEqual(kept);
  });
});

describe('finishRegistration', () => {
  const run = (drafts = createInMemoryRegistrationDraftRepository(draft), profiles = createInMemoryAdultProfileRepository()) => {
    const links: ManagedAthleteRow[] = [];
    const athletes = createInMemoryAthleteRepository(createInMemoryManagedAthleteRepository(links));
    const managedProfiles = createInMemoryManagedAthleteProfileRepository(athletes, links);
    return finishRegistration({ userId: 'user-1', email: ' camila@example.test ', drafts, profiles, managedProfiles }).then((next) => ({
      drafts,
      profiles,
      athletes,
      next,
    }));
  };

  it('adult: saves the trimmed profile, creates the own athlete profile, keeps the swimmer and asks to open the authorizations', async () => {
    const { drafts, profiles, athletes, next } = await run();

    expect(profiles.saved).toEqual([{ userId: 'user-1', firstName: 'Camila', lastName: 'Rojas' }]);
    const own = await athletes.listManaged('user-1');
    expect(own.map((a) => `${a.firstName} ${a.lastName}`)).toEqual(['Camila Rojas']);
    expect(await drafts.load()).toEqual({ swimmer: 'adult', firstName: '', lastName: '', email: 'Camila@Example.test', step: 'authorizations' });
    expect(next).toBe('authorizations');
  });

  it('child: keeps only the swimmer choice, creates no athlete and asks to open the add screen', async () => {
    const { drafts, athletes, next } = await run(createInMemoryRegistrationDraftRepository({ ...draft, swimmer: 'child' }));

    expect(await drafts.load()).toEqual({ swimmer: 'child', firstName: '', lastName: '', email: 'Camila@Example.test' });
    await expect(athletes.listManaged('user-1')).resolves.toEqual([]);
    expect(next).toBe('add_athletes');
  });

  it('child: asks again to open the add screen on a later launch, when the names are already blank', async () => {
    const { next } = await run(createInMemoryRegistrationDraftRepository({ swimmer: 'child', firstName: '', lastName: '', email: 'Camila@Example.test' }));

    expect(next).toBe('add_athletes');
  });

  it('child: resumes to the authorizations once the add-athletes step was finished', async () => {
    const { next } = await run(
      createInMemoryRegistrationDraftRepository({ swimmer: 'child', firstName: '', lastName: '', email: 'Camila@Example.test', step: 'authorizations' }),
    );

    expect(next).toBe('authorizations');
  });

  it.each([undefined, 'authorizations' as const])('child: leaves a draft kept for another email alone and does not route (step %s)', async (step) => {
    const kept: RegistrationDraft = { swimmer: 'child', firstName: '', lastName: '', email: 'other@example.test', ...(step && { step }) };
    const { drafts, next } = await run(createInMemoryRegistrationDraftRepository(kept));

    expect(next).toBeUndefined();
    expect(await drafts.load()).toEqual(kept);
  });

  it('adult: resumes to the authorizations on a later launch for the same email', async () => {
    const kept: RegistrationDraft = { swimmer: 'adult', firstName: '', lastName: '', email: 'Camila@Example.test', step: 'authorizations' };
    const { next } = await run(createInMemoryRegistrationDraftRepository(kept));

    expect(next).toBe('authorizations');
  });

  it('adult: leaves a resume draft kept for another email alone and does not route', async () => {
    const kept: RegistrationDraft = { swimmer: 'adult', firstName: '', lastName: '', email: 'other@example.test', step: 'authorizations' };
    const { drafts, next } = await run(createInMemoryRegistrationDraftRepository(kept));

    expect(next).toBeUndefined();
    expect(await drafts.load()).toEqual(kept);
  });

  it('adult: keeps the draft when the own athlete profile cannot be created', async () => {
    const drafts = createInMemoryRegistrationDraftRepository(draft);
    const managedProfiles = { createManagedAthlete: jest.fn().mockRejectedValue(new Error('write failed')) };

    await expect(
      finishRegistration({ userId: 'user-1', email: 'camila@example.test', drafts, profiles: createInMemoryAdultProfileRepository(), managedProfiles }),
    ).rejects.toThrow('write failed');
    expect(await drafts.load()).toEqual(draft);
  });

  it('clears the draft when there is no swimmer choice', async () => {
    const { swimmer: _swimmer, ...noSwimmer } = draft;
    const { drafts, profiles, athletes } = await run(createInMemoryRegistrationDraftRepository(noSwimmer));

    expect(profiles.saved).toHaveLength(1);
    await expect(athletes.listManaged('user-1')).resolves.toEqual([]);
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

  describe.each(['adult', 'child'] as const)('%s: an account that already has a profile', (swimmer) => {
    const existing = { userId: 'user-1', firstName: 'Lucía', lastName: 'Pardo' };

    it('keeps the stored name, drops the draft and routes nowhere', async () => {
      const profiles = createInMemoryAdultProfileRepository({ existing });
      const { drafts, athletes, next } = await run(createInMemoryRegistrationDraftRepository({ ...draft, swimmer }), profiles);

      expect(profiles.saved).toEqual([existing]);
      expect(await drafts.load()).toBeNull();
      await expect(athletes.listManaged('user-1')).resolves.toEqual([]);
      expect(next).toBeUndefined();
    });

    it('goes on when the stored name is the one typed, as in a retry after a failed step', async () => {
      const profiles = createInMemoryAdultProfileRepository({ existing: { ...existing, firstName: 'camila', lastName: 'ROJAS' } });
      const { next } = await run(createInMemoryRegistrationDraftRepository({ ...draft, swimmer }), profiles);

      expect(next).toBe(swimmer === 'adult' ? 'authorizations' : 'add_athletes');
    });
  });

  it('keeps the draft when the profile cannot be saved', async () => {
    const drafts = createInMemoryRegistrationDraftRepository(draft);
    await expect(run(drafts, createInMemoryAdultProfileRepository({ failing: true }))).rejects.toThrow('save failed');

    expect(await drafts.load()).toEqual(draft);
  });
});
