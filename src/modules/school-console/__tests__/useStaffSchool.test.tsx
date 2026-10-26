import { renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryStaffSchoolRepository, useStaffSchool, type StaffSchoolRepository } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const repository = createInMemoryStaffSchoolRepository([
  { schoolId: 'school-b', schoolName: 'Blue Dolphins', userId: 'coach-1', role: 'coach' },
  { schoolId: 'school-a', schoolName: 'Aqua Club', userId: 'coach-1', role: 'coach' },
  { schoolId: 'school-a', schoolName: 'Aqua Club', userId: 'admin-1', role: 'school_admin' },
]);

describe('useStaffSchool', () => {
  it('is loading until the lookup answers', async () => {
    const pending: StaffSchoolRepository = { ...repository, listStaffSchools: () => new Promise(() => {}) };
    const { result } = await renderHook(() => useStaffSchool(pending, 'coach-1'));

    expect(result.current).toEqual({ status: 'loading' });
  });

  it.each([
    ['a coach', 'coach-1', [{ id: 'school-a', name: 'Aqua Club' }, { id: 'school-b', name: 'Blue Dolphins' }]],
    ['a school admin', 'admin-1', [{ id: 'school-a', name: 'Aqua Club' }]],
  ])('gives the first school by name, and every school, to %s', async (_label, userId, schools) => {
    const { result } = await renderHook(() => useStaffSchool(repository, userId));

    await waitFor(() => expect(result.current).toEqual({ status: 'staff', school: { id: 'school-a', name: 'Aqua Club' }, schools }));
  });

  it.each([
    ['a user without memberships', 'guardian-1'],
    ['no user', undefined],
  ])('denies %s', async (_label, userId) => {
    const { result } = await renderHook(() => useStaffSchool(repository, userId));

    await waitFor(() => expect(result.current).toEqual({ status: 'denied' }));
  });

  it('reports an error of its own, not a denial, when the lookup fails', async () => {
    const failing: StaffSchoolRepository = { ...repository, listStaffSchools: () => Promise.reject(new Error('db')) };
    const { result } = await renderHook(() => useStaffSchool(failing, 'coach-1'));

    await waitFor(() => expect(result.current).toEqual({ status: 'error' }));
  });
});
