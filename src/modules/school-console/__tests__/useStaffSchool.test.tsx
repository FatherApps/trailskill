import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryStaffSchoolRepository, useStaffSchool, type StaffSchoolRepository, type StaffSchoolResult } from '..';

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

    await waitFor(() => expect(result.current).toMatchObject({ status: 'error' }));
  });

  it('looks again on retry, going back to loading so the old error does not stay, and shows the new answer', async () => {
    const list = jest.fn().mockRejectedValueOnce(new Error('db')).mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve([]), 0)));
    const flaky: StaffSchoolRepository = { ...repository, listStaffSchools: list };
    const { result } = await renderHook(() => useStaffSchool(flaky, 'coach-1'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      if (result.current.status === 'error') result.current.retry();
    });

    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current).toEqual({ status: 'denied' }));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('keeps the same result object while its state does not change, so a caller may use it as a dependency', async () => {
    const failing: StaffSchoolRepository = { ...repository, listStaffSchools: () => Promise.reject(new Error('db')) };
    const { result, rerender } = await renderHook(() => useStaffSchool(failing, 'coach-1'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    const settled = result.current;

    await rerender({});

    expect(result.current).toBe(settled);
  });

  it('keeps the same staff result object while nothing changes, so a caller may use it as a dependency', async () => {
    const { result, rerender } = await renderHook(() => useStaffSchool(repository, 'coach-1'));
    await waitFor(() => expect(result.current.status).toBe('staff'));
    const settled = result.current;

    await rerender({});

    expect(result.current).toBe(settled);
  });

  it('retries after a lookup that a user change cancelled while it was still running', async () => {
    const list = jest
      .fn()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValue([]);
    const flaky: StaffSchoolRepository = { ...repository, listStaffSchools: list };
    const { result, rerender } = await renderHook<StaffSchoolResult, { userId: string }>(({ userId }) => useStaffSchool(flaky, userId), {
      initialProps: { userId: 'coach-1' },
    });
    await rerender({ userId: 'admin-1' });
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      if (result.current.status === 'error') result.current.retry();
    });

    await waitFor(() => expect(result.current).toEqual({ status: 'denied' }));
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('does not start a second lookup when retry is pressed while a lookup from a refresh key change is running', async () => {
    let answer!: (schools: unknown[]) => void;
    const list = jest
      .fn()
      .mockRejectedValueOnce(new Error('db'))
      .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
      .mockResolvedValue([]);
    const flaky: StaffSchoolRepository = { ...repository, listStaffSchools: list };
    const { result, rerender } = await renderHook<StaffSchoolResult, { key: number }>(({ key }) => useStaffSchool(flaky, 'coach-1', key), {
      initialProps: { key: 0 },
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    await rerender({ key: 1 });
    expect(list).toHaveBeenCalledTimes(2);

    await act(async () => {
      if (result.current.status === 'error') result.current.retry();
    });

    expect(list).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('error');
    await act(async () => answer([]));
    await waitFor(() => expect(result.current).toEqual({ status: 'denied' }));
  });

  it('requires a retry on an error', () => {
    const failed: StaffSchoolResult = { status: 'error', retry: () => {} };
    // @ts-expect-error an error without retry would leave "Hoy" with no way to look again
    const silent: StaffSchoolResult = { status: 'error' };

    expect([failed.status, silent.status]).toEqual(['error', 'error']);
  });

  it('gives no retry to an answer that is not an error', async () => {
    const { result } = await renderHook(() => useStaffSchool(repository, 'coach-1'));

    await waitFor(() => expect(result.current.status).toBe('staff'));
    expect(result.current).not.toHaveProperty('retry');
  });
});
