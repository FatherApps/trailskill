import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  createInMemoryStaffSchoolRepository,
  useAdminSchool,
  type AdminSchoolResult,
  type StaffSchool,
  type StaffSchoolRepository,
} from '..';

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

  it('never shows the previous user as admin while the next user is being looked up', async () => {
    let release: (schools: StaffSchool[]) => void = () => {};
    const switching: StaffSchoolRepository = {
      ...repository,
      listAdminSchools: (id) =>
        id === 'admin-1' ? repository.listAdminSchools(id) : new Promise<StaffSchool[]>((resolve) => (release = resolve)),
    };
    const seen: string[] = [];
    const { result, rerender } = await renderHook<AdminSchoolResult, { userId: string }>(
      ({ userId }) => {
        const value = useAdminSchool(switching, userId);
        seen.push(value.status);
        return value;
      },
      { initialProps: { userId: 'admin-1' } },
    );
    await waitFor(() => expect(result.current.status).toBe('admin'));

    seen.length = 0;
    await rerender({ userId: 'coach-1' });
    expect(result.current).toEqual({ status: 'loading' });

    await act(async () => release([]));
    await waitFor(() => expect(result.current).toEqual({ status: 'denied' }));
    expect(seen).not.toContain('admin');
  });

  it.each([
    ['an admin', 'admin-1'],
    ['a denied user', 'coach-1'],
  ])('keeps the same result object for %s while nothing changes, so a caller may use it as a dependency', async (_label, userId) => {
    const { result, rerender } = await renderHook(() => useAdminSchool(repository, userId));
    await waitFor(() => expect(result.current.status).not.toBe('loading'));
    const settled = result.current;

    await rerender({});

    expect(result.current).toBe(settled);
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
