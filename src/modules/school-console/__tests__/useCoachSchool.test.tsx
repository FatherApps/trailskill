import { renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryStaffSchoolRepository, useCoachSchool, type StaffSchoolRepository } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const repository = createInMemoryStaffSchoolRepository([
  { schoolId: 'school-b', schoolName: 'Blue Dolphins', userId: 'coach-1', role: 'coach' },
  { schoolId: 'school-a', schoolName: 'Aqua Club', userId: 'coach-1', role: 'coach' },
  { schoolId: 'school-a', schoolName: 'Aqua Club', userId: 'admin-1', role: 'school_admin' },
  { schoolId: 'school-c', schoolName: 'Coral Swim', userId: 'both-1', role: 'school_admin' },
  { schoolId: 'school-c', schoolName: 'Coral Swim', userId: 'both-1', role: 'coach' },
]);

describe('useCoachSchool', () => {
  it('gives the first school by name where the user is a coach', async () => {
    const { result } = await renderHook(() => useCoachSchool(repository, 'coach-1'));

    await waitFor(() => expect(result.current).toEqual({ status: 'coach', school: { id: 'school-a', name: 'Aqua Club' } }));
  });

  it('counts a school admin who is also a coach as a coach', async () => {
    const { result } = await renderHook(() => useCoachSchool(repository, 'both-1'));

    await waitFor(() => expect(result.current).toEqual({ status: 'coach', school: { id: 'school-c', name: 'Coral Swim' } }));
  });

  it.each([
    ['a school admin who is not a coach', 'admin-1'],
    ['a guardian, who has no membership', 'guardian-1'],
    ['no user', undefined],
  ])('denies %s', async (_label, userId) => {
    const { result } = await renderHook(() => useCoachSchool(repository, userId));

    await waitFor(() => expect(result.current).toEqual({ status: 'denied' }));
  });

  it('is loading until the lookup answers', async () => {
    const pending: StaffSchoolRepository = { ...repository, listCoachSchools: () => new Promise(() => {}) };
    const { result } = await renderHook(() => useCoachSchool(pending, 'coach-1'));

    expect(result.current).toEqual({ status: 'loading' });
  });

  it('reports an error, not a denial, when the lookup fails', async () => {
    const failing: StaffSchoolRepository = { ...repository, listCoachSchools: () => Promise.reject(new Error('db')) };
    const { result } = await renderHook(() => useCoachSchool(failing, 'coach-1'));

    await waitFor(() => expect(result.current).toEqual({ status: 'error', retry: expect.any(Function) }));
  });
});
