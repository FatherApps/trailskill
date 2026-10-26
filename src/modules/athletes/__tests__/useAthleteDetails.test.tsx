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
const rows = [
  { athleteId: 'a1', schoolId: 's1', categoryId: 'c1' },
  { athleteId: 'a2', schoolId: 's1', categoryId: 'c1' },
];

const renderAthleteDetails = (links: AthleteSchoolRepository) =>
  renderHook(({ athletes }: { athletes: SchoolAthlete[] }) => useAthleteDetails(athletes, links, structure), {
    initialProps: { athletes: [ana] },
  });

describe('useAthleteDetails', () => {
  it('keeps the details and does not read again when the athletes arrive as a new array with the same content', async () => {
    const links = createInMemoryAthleteSchoolRepository(rows);
    const listByAthlete = jest.spyOn(links, 'listByAthlete');
    const { result, rerender } = await renderAthleteDetails(links);
    await waitFor(() => expect(result.current).toEqual({ a1: 'Under 12 · Group A' }));
    const reads = listByAthlete.mock.calls.length;

    await rerender({ athletes: [{ ...ana }] });

    expect(result.current).toEqual({ a1: 'Under 12 · Group A' });
    expect(listByAthlete).toHaveBeenCalledTimes(reads);
  });

  it('keeps the previous details while it reads again for other athletes', async () => {
    const links = createInMemoryAthleteSchoolRepository(rows);
    const { result, rerender } = await renderAthleteDetails(links);
    await waitFor(() => expect(result.current).toEqual({ a1: 'Under 12 · Group A' }));

    await rerender({ athletes: [ana, ben] });

    expect(result.current.a1).toBe('Under 12 · Group A');
    await waitFor(() => expect(result.current).toEqual({ a1: 'Under 12 · Group A', a2: 'Under 12 · Group A' }));
  });

  it('reads again when the groups of an athlete change', async () => {
    const links = createInMemoryAthleteSchoolRepository(rows);
    const { result, rerender } = await renderAthleteDetails(links);
    await waitFor(() => expect(result.current).toEqual({ a1: 'Under 12 · Group A' }));

    await rerender({ athletes: [{ ...ana, groupIds: ['g1', 'g2'] }] });

    await waitFor(() => expect(result.current).toEqual({ a1: 'Under 12 · Group A · Group B' }));
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
    await waitFor(() => expect(result.current).toEqual({ a1: 'Under 12 · Group A' }));

    failing = true;
    await rerender({ athletes: [ana, ben] });

    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.any(String), error));
    expect(result.current).toEqual({ a1: 'Under 12 · Group A' });
    warn.mockRestore();
  });
});
