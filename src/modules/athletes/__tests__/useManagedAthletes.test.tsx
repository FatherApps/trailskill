import { renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryManagedAthleteRepository } from '../../accounts';
import { createInMemorySchoolAthleteRepository, useManagedAthletes } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const athletes = createInMemorySchoolAthleteRepository({
  athletes: [
    { id: 'a1', firstName: 'Ana', lastName: 'Marin' },
    { id: 'a2', firstName: 'Ben', lastName: 'Arce' },
    { id: 'a3', firstName: 'Cleo', lastName: 'Other' },
  ],
  athleteSchools: [],
  athleteGroups: [],
});
const managed = createInMemoryManagedAthleteRepository([
  { userId: 'guardian-1', athleteId: 'a1' },
  { userId: 'guardian-1', athleteId: 'a2' },
  { userId: 'guardian-2', athleteId: 'a3' },
]);

describe('useManagedAthletes', () => {
  it('is loading until the lookup answers', async () => {
    const pending = { listManagedAthleteIds: () => new Promise<string[]>(() => {}) };
    const { result } = await renderHook(() => useManagedAthletes(pending, athletes, 'guardian-1'));

    expect(result.current).toEqual({ status: 'loading' });
  });

  it('gives only the athletes the user manages', async () => {
    const { result } = await renderHook(() => useManagedAthletes(managed, athletes, 'guardian-1'));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.status === 'ready' && result.current.athletes.map((a) => a.id)).toEqual(['a2', 'a1']);
  });

  it.each([
    ['a user who manages nobody', 'coach-1'],
    ['no user', undefined],
  ])('gives nobody to %s', async (_label, userId) => {
    const { result } = await renderHook(() => useManagedAthletes(managed, athletes, userId));

    await waitFor(() => expect(result.current).toEqual({ status: 'ready', athletes: [] }));
  });

  it('gives nobody when the lookup fails, and logs the failure in development', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('db');
    const failing = { listManagedAthleteIds: () => Promise.reject(error) };
    const { result } = await renderHook(() => useManagedAthletes(failing, athletes, 'guardian-1'));

    await waitFor(() => expect(result.current).toEqual({ status: 'ready', athletes: [] }));
    expect(warn).toHaveBeenCalledWith(expect.any(String), error);
    warn.mockRestore();
  });
});
