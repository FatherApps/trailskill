import { renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryAthleteSchoolRepository, type AthleteSchoolRepository } from '../data/athleteSchools';
import type { SchoolAthlete } from '../data/schoolAthletes';
import { useAthleteDetails, type AthleteStructure } from '../data/useAthleteDetails';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const ana: SchoolAthlete = { id: 'a1', firstName: 'Ana', lastName: 'Marin', categoryId: 'c1', groupIds: ['g1'] };
const ben: SchoolAthlete = { id: 'a2', firstName: 'Ben', lastName: 'Arce', categoryId: 'c1', groupIds: ['g1'] };
const structure: AthleteStructure = {
  listCategories: async () => [{ id: 'c1', name: 'Under 12' }],
  listGroups: async () => [
    { id: 'g1', name: 'Group A' },
    { id: 'g2', name: 'Group B' },
  ],
};
const schoolNames = { listByIds: async () => [{ id: 's1', name: 'Dolphins' }] };
const rows = [
  { athleteId: 'a1', schoolId: 's1', categoryId: 'c1' },
  { athleteId: 'a2', schoolId: 's1', categoryId: 'c1' },
];

const renderAthleteDetails = (links: AthleteSchoolRepository) =>
  renderHook(({ athletes }: { athletes: SchoolAthlete[] }) => useAthleteDetails(athletes, links, schoolNames, structure), {
    initialProps: { athletes: [ana] },
  });

describe('useAthleteDetails', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps the details and does not read again when the athletes arrive as a new array with the same content', async () => {
    const links = createInMemoryAthleteSchoolRepository(rows);
    const listByAthlete = jest.spyOn(links, 'listByAthlete');
    const { result, rerender } = await renderAthleteDetails(links);
    await waitFor(() => expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A' } }));
    const reads = listByAthlete.mock.calls.length;

    await rerender({ athletes: [{ ...ana }] });

    expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A' } });
    expect(listByAthlete).toHaveBeenCalledTimes(reads);
  });

  it('keeps the previous details while it reads again for other athletes', async () => {
    const links = createInMemoryAthleteSchoolRepository(rows);
    const { result, rerender } = await renderAthleteDetails(links);
    await waitFor(() => expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A' } }));

    await rerender({ athletes: [ana, ben] });

    expect(result.current.a1).toEqual({ school: 'Dolphins', category: 'Under 12', group: 'Group A' });
    await waitFor(() => expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A' }, a2: { school: 'Dolphins', category: 'Under 12', group: 'Group A' } }));
  });

  it('reads again when the groups of an athlete change', async () => {
    const links = createInMemoryAthleteSchoolRepository(rows);
    const { result, rerender } = await renderAthleteDetails(links);
    await waitFor(() => expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A' } }));

    await rerender({ athletes: [{ ...ana, groupIds: ['g1', 'g2'] }] });

    await waitFor(() => expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A · Group B' } }));
  });

  it('reads again when the category of an athlete changes and the groups stay the same', async () => {
    let categoryId = 'c1';
    const links: AthleteSchoolRepository = { listByAthlete: async () => [{ schoolId: 's1', categoryId }] };
    const withTwoCategories: AthleteStructure = {
      ...structure,
      listCategories: async () => [
        { id: 'c1', name: 'Under 12' },
        { id: 'c2', name: 'Under 14' },
      ],
    };
    const { result, rerender } = await renderHook(
      ({ athletes }: { athletes: SchoolAthlete[] }) => useAthleteDetails(athletes, links, schoolNames, withTwoCategories),
      { initialProps: { athletes: [ana] } },
    );
    await waitFor(() => expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A' } }));

    categoryId = 'c2';
    await rerender({ athletes: [{ ...ana, categoryId: 'c2' }] });

    await waitFor(() => expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 14', group: 'Group A' } }));
  });

  it('does not read again when the groups of an athlete arrive in another order', async () => {
    const links = createInMemoryAthleteSchoolRepository(rows);
    const listByAthlete = jest.spyOn(links, 'listByAthlete');
    const { result, rerender } = await renderHook(
      ({ athletes }: { athletes: SchoolAthlete[] }) => useAthleteDetails(athletes, links, schoolNames, structure),
      { initialProps: { athletes: [{ ...ana, groupIds: ['g1', 'g2'] }] } },
    );
    await waitFor(() => expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A · Group B' } }));
    const reads = listByAthlete.mock.calls.length;

    await rerender({ athletes: [{ ...ana, groupIds: ['g2', 'g1'] }] });

    expect(listByAthlete).toHaveBeenCalledTimes(reads);
  });

  it('does not throw when a read fails, keeps the previous details and logs the failure in development', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('db');
    let failing = false;
    const working = createInMemoryAthleteSchoolRepository(rows);
    const links = {
      listByAthlete: (athleteId: string) => {
        if (failing) throw error;
        return working.listByAthlete(athleteId);
      },
    };
    const { result, rerender } = await renderAthleteDetails(links);
    await waitFor(() => expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A' } }));

    failing = true;
    await rerender({ athletes: [ana, ben] });

    await waitFor(() => expect(warn).toHaveBeenCalledWith('[athletes] Athlete details lookup failed', error));
    expect(result.current).toEqual({ a1: { school: 'Dolphins', category: 'Under 12', group: 'Group A' } });
  });

  it('leaves the school out when its name is unknown or its lookup fails, and keeps the category and group', async () => {
    const links = createInMemoryAthleteSchoolRepository(rows);
    const failing = { listByIds: () => Promise.reject(new Error('offline')) };
    const unknown = { listByIds: async () => [] };

    for (const names of [failing, unknown]) {
      const { result, unmount } = await renderHook(() => useAthleteDetails([ana], links, names, structure));
      await waitFor(() => expect(result.current).toEqual({ a1: { category: 'Under 12', group: 'Group A' } }));
      unmount();
    }
  });
});
