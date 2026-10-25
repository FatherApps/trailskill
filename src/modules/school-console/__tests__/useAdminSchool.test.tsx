import { renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryStaffSchoolRepository, useAdminSchool, type AdminSchoolResult, type StaffSchoolRepository } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const rows = [
  { schoolId: 'school-b', schoolName: 'Blue Dolphins', userId: 'admin-1', role: 'school_admin' },
  { schoolId: 'school-a', schoolName: 'Aqua Club', userId: 'admin-1', role: 'school_admin' },
  { schoolId: 'school-c', schoolName: 'Coral Swim', userId: 'coach-1', role: 'coach' },
];
const repository = createInMemoryStaffSchoolRepository(rows);

describe('useAdminSchool', () => {
  it('is loading until the lookup answers', async () => {
    const pending: StaffSchoolRepository = { ...repository, listAdminSchools: () => new Promise(() => {}) };
    const { result } = await renderHook(() => useAdminSchool(pending, 'admin-1'));

    expect(result.current).toEqual({ status: 'loading' });
  });

  it('gives the first admin school by name', async () => {
    const { result } = await renderHook(() => useAdminSchool(repository, 'admin-1'));

    await waitFor(() =>
      expect(result.current).toEqual({ status: 'admin', school: { id: 'school-a', name: 'Aqua Club' } }),
    );
  });

  it.each([
    ['a coach', 'coach-1'],
    ['a user without memberships', 'nobody'],
    ['no user', undefined],
  ])('denies %s', async (_label, userId) => {
    const { result } = await renderHook(() => useAdminSchool(repository, userId));

    await waitFor(() => expect(result.current).toEqual({ status: 'denied' }));
  });

  it('denies when the lookup fails', async () => {
    const failing: StaffSchoolRepository = { ...repository, listAdminSchools: () => Promise.reject(new Error('db')) };
    const { result } = await renderHook(() => useAdminSchool(failing, 'admin-1'));

    await waitFor(() => expect(result.current).toEqual({ status: 'denied' }));
  });

  it('looks again when the refresh key changes', async () => {
    let current = rows.slice(2);
    const changing: StaffSchoolRepository = {
      ...repository,
      listAdminSchools: (id) => createInMemoryStaffSchoolRepository(current).listAdminSchools(id),
    };
    const { result, rerender } = await renderHook<AdminSchoolResult, { key: number }>(
      ({ key }) => useAdminSchool(changing, 'admin-1', key),
      { initialProps: { key: 0 } },
    );
    await waitFor(() => expect(result.current.status).toBe('denied'));

    current = rows;
    await rerender({ key: 1 });

    await waitFor(() => expect(result.current.status).toBe('admin'));
  });
});
