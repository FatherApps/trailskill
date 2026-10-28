import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryConflictReviewRepository } from '../data/conflictReview';
import { PLATFORM_ADMIN_WAIT_MS, usePlatformAdminStatus } from '../data/usePlatformAdminStatus';

// The Supabase adapter imports the sync module, which loads native code.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

describe('usePlatformAdminStatus', () => {
  const repository = createInMemoryConflictReviewRepository({ admins: ['admin-1'] });

  it('says loading until the server answers, then true for a platform admin', async () => {
    let answer: (admin: boolean) => void = () => {};
    const pending = { isPlatformAdmin: () => new Promise<boolean>((resolve) => (answer = resolve)) };
    const { result } = await renderHook(() => usePlatformAdminStatus(pending, 'admin-1'));

    expect(result.current).toBe('loading');
    await act(async () => answer(true));
    expect(result.current).toBe(true);
  });

  it('is true for a platform admin of the repository', async () => {
    const { result } = await renderHook(() => usePlatformAdminStatus(repository, 'admin-1'));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('answers false for anyone else and for no user', async () => {
    const other = await renderHook(() => usePlatformAdminStatus(repository, 'user-1'));
    const none = await renderHook(() => usePlatformAdminStatus(repository, undefined));

    await waitFor(() => expect(other.result.current).toBe(false));
    expect(none.result.current).toBe(false);
  });

  it('fails closed to false when the lookup fails', async () => {
    // Stable identity: the hook looks the answer up again whenever the repository changes.
    const offline = { isPlatformAdmin: () => Promise.reject(new Error('offline')) };
    const { result } = await renderHook(() => usePlatformAdminStatus(offline, 'admin-1'));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('does not give another user the answer of the previous one while its own lookup runs', async () => {
    const { result, rerender } = await renderHook(({ id }: { id: string }) => usePlatformAdminStatus(repository, id), { initialProps: { id: 'admin-1' } });
    await waitFor(() => expect(result.current).toBe(true));

    await rerender({ id: 'user-1' });

    expect(result.current).not.toBe(true);
  });

  describe('with a server that never answers', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const silent = { isPlatformAdmin: () => new Promise<boolean>(() => {}) };

    it('gives up and answers false after the wait, so a guardian with poor signal is not left loading', async () => {
      const { result } = await renderHook(() => usePlatformAdminStatus(silent, 'admin-1'));
      expect(result.current).toBe('loading');

      await act(async () => {
        jest.advanceTimersByTime(PLATFORM_ADMIN_WAIT_MS);
      });

      expect(result.current).toBe(false);
    });
  });
});
