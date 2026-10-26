import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryConflictReviewRepository } from '../data/conflictReview';
import { usePlatformAdmin } from '../data/usePlatformAdmin';

// The Supabase adapter imports the sync module, which loads native code.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

describe('usePlatformAdmin', () => {
  const repository = createInMemoryConflictReviewRepository({ admins: ['admin-1'] });

  it('is true for a platform admin', async () => {
    const { result } = await renderHook(() => usePlatformAdmin(repository, 'admin-1'));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays false for anyone else, for no user and for a failed lookup', async () => {
    const other = await renderHook(() => usePlatformAdmin(repository, 'user-1'));
    const none = await renderHook(() => usePlatformAdmin(repository, undefined));
    // Stable identity: the hook looks the answer up again whenever the repository changes.
    const offline = { isPlatformAdmin: () => Promise.reject(new Error('offline')) };
    const failing = await renderHook(() => usePlatformAdmin(offline, 'admin-1'));
    await act(async () => {});

    expect(other.result.current).toBe(false);
    expect(none.result.current).toBe(false);
    expect(failing.result.current).toBe(false);
  });
});
