import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryAthleteSchoolRepository, useAthleteProfileRoute, type AthleteProfileRouteInput } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const federation = { name: 'Synthetic Federation', kind: 'federation' as const, provider: 'xx-demo' };
const platform = { name: 'Synthetic Platform', kind: 'platform' as const, provider: 'xx-torneo' };
const ana = { id: 'a1', firstName: 'Ana', lastName: 'Marin', categoryId: null, groupIds: [] };
const staffOf = (...ids: string[]) => ({ status: 'staff' as const, schools: ids.map((id) => ({ id })) });

function setup(overrides: Partial<AthleteProfileRouteInput> = {}) {
  const input: AthleteProfileRouteInput = {
    athleteId: 'a1',
    syncedAt: undefined,
    importedResults: { lastImportedAt: async () => null },
    identity: { isConfirmed: async () => false },
    schoolLinks: createInMemoryAthleteSchoolRepository([]),
    staff: { status: 'denied' },
    sources: [],
    managed: { status: 'ready', athletes: [ana] },
    onImport: jest.fn(),
    onImportTournament: jest.fn(),
    ...overrides,
  };
  return { input, hook: renderHook((props: AthleteProfileRouteInput) => useAthleteProfileRoute(props), { initialProps: input }) };
}

describe('useAthleteProfileRoute', () => {
  describe('started', () => {
    it('is false until something was imported or the identity is confirmed', async () => {
      const { hook } = setup();
      const { result } = await hook;

      await waitFor(() => expect(result.current.started).toBe(false));
    });

    it.each([
      ['something was imported', { importedResults: { lastImportedAt: async () => '2026-10-28T10:00:00Z' } }],
      ['the identity is confirmed', { identity: { isConfirmed: async () => true } }],
    ])('is true once %s', async (_label, overrides) => {
      const { hook } = setup(overrides);
      const { result } = await hook;

      await waitFor(() => expect(result.current.started).toBe(true));
    });

    it('treats a failed last-import lookup as nothing imported', async () => {
      const { hook } = setup({ importedResults: { lastImportedAt: async () => Promise.reject(new Error('offline')) }, identity: { isConfirmed: async () => true } });
      const { result } = await hook;

      await waitFor(() => expect(result.current.started).toBe(true));
    });

    it('looks again when a sync lands', async () => {
      let importedAt: string | null = null;
      const { input, hook } = setup({ importedResults: { lastImportedAt: async () => importedAt } });
      const { result, rerender } = await hook;
      await waitFor(() => expect(result.current.started).toBe(false));

      importedAt = '2026-10-28T10:00:00Z';
      await rerender({ ...input, syncedAt: 1 });

      await waitFor(() => expect(result.current.started).toBe(true));
    });
  });

  describe('sharingSchoolId', () => {
    const links = createInMemoryAthleteSchoolRepository([
      { athleteId: 'a1', schoolId: 'school-b', categoryId: null },
      { athleteId: 'a1', schoolId: 'school-a', categoryId: null },
    ]);

    it('is the first school of the user, in their order, that the swimmer belongs to', async () => {
      const { hook } = setup({ schoolLinks: links, staff: staffOf('school-z', 'school-a', 'school-b') });
      const { result } = await hook;

      await waitFor(() => expect(result.current.sharingSchoolId).toBe('school-a'));
    });

    it('is nothing when the swimmer is in no school of the user', async () => {
      const { hook } = setup({ schoolLinks: links, staff: staffOf('school-z') });
      const { result } = await hook;

      await waitFor(() => expect(result.current.sharingSchoolId).toBeUndefined());
    });

    it('is nothing for a user who is not staff, and they are not staff', async () => {
      const { hook } = setup({ schoolLinks: links, staff: { status: 'denied' } });
      const { result } = await hook;

      await waitFor(() => expect(result.current.isStaff).toBe(false));
      expect(result.current.sharingSchoolId).toBeUndefined();
    });

    it('is nothing when the school lookup fails', async () => {
      const { hook } = setup({ schoolLinks: { listByAthlete: async () => Promise.reject(new Error('db')), listActiveSchools: async () => [] }, staff: staffOf('school-a') });
      const { result } = await hook;

      await waitFor(() => expect(result.current.isStaff).toBe(true));
      expect(result.current.sharingSchoolId).toBeUndefined();
    });

    it('never shows the schools of the previous swimmer', async () => {
      const { input, hook } = setup({ schoolLinks: links, staff: staffOf('school-a') });
      const { result, rerender } = await hook;
      await waitFor(() => expect(result.current.sharingSchoolId).toBe('school-a'));

      await rerender({ ...input, athleteId: 'a2' });

      expect(result.current.sharingSchoolId).toBeUndefined();
    });
  });

  describe('sources', () => {
    it('names the origin of each imported result by its provider', async () => {
      const { hook } = setup({ sources: [federation, platform] });
      const { result } = await hook;

      expect(result.current.sourceNames).toEqual({ 'xx-demo': 'Synthetic Federation', 'xx-torneo': 'Synthetic Platform' });
    });

    it('dates by session only the results platforms', async () => {
      const { hook } = setup({ sources: [federation, platform] });
      const { result } = await hook;

      expect(result.current.sessionDated).toEqual(['xx-torneo']);
    });
  });

  describe('managedAthlete', () => {
    it('is the swimmer in the address when the user manages them', async () => {
      const { hook } = setup();
      const { result } = await hook;

      expect(result.current.managedAthlete).toBe(ana);
    });

    it.each([
      ['is still loading', { status: 'loading' as const }],
      ['does not include the swimmer', { status: 'ready' as const, athletes: [] }],
    ])('is nothing while the lookup %s', async (_label, managed) => {
      const { hook } = setup({ managed });
      const { result } = await hook;

      expect(result.current.managedAthlete).toBeUndefined();
    });
  });

  describe('importPrompt', () => {
    it('invites a manager to import from the federation before anything was imported', async () => {
      const { hook } = setup({ sources: [federation] });
      const { result } = await hook;

      expect(result.current.importPrompt).toMatchObject({ sourceName: 'Synthetic Federation', athleteName: 'Ana', imported: false });
      expect(result.current.importPrompt?.onStartTournament).toBeUndefined();
    });

    it('stops inviting to the federation once started: updating is the results panel', async () => {
      const { hook } = setup({ sources: [federation], identity: { isConfirmed: async () => true } });
      const { result } = await hook;

      await waitFor(() => expect(result.current.importPrompt).toBeUndefined());
    });

    it('keeps offering a tournament while a results platform is configured, after the federation import', async () => {
      const { hook } = setup({ sources: [federation, platform], identity: { isConfirmed: async () => true } });
      const { result } = await hook;

      await waitFor(() => expect(result.current.started).toBe(true));
      expect(result.current.importPrompt?.sourceName).toBeUndefined();
      expect(result.current.importPrompt?.onStart).toBeDefined();
      expect(result.current.importPrompt?.onStartTournament).toBeDefined();
    });

    it('offers nothing without a source, or to someone who does not manage the swimmer', async () => {
      const none = await setup().hook;
      expect(none.result.current.importPrompt).toBeUndefined();

      const notManager = await setup({ sources: [federation], managed: { status: 'ready', athletes: [] } }).hook;
      expect(notManager.result.current.importPrompt).toBeUndefined();
    });

    it('starts the imports through the callbacks of the route', async () => {
      const { input, hook } = setup({ sources: [federation, platform] });
      const { result } = await hook;

      result.current.importPrompt?.onStart?.();
      result.current.importPrompt?.onStartTournament?.();

      expect(input.onImport).toHaveBeenCalledTimes(1);
      expect(input.onImportTournament).toHaveBeenCalledTimes(1);
    });

    it('hides for good once dismissed', async () => {
      const { hook } = setup({ sources: [federation] });
      const { result } = await hook;

      await act(async () => result.current.importPrompt?.onDismiss());

      expect(result.current.importPrompt).toBeUndefined();
    });
  });
});
