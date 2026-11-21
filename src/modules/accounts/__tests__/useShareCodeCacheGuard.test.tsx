import { renderHook } from '@testing-library/react-native';

import { createInMemoryShareCodeCache } from '../data/athleteShareCodeCache';
import { useShareCodeCacheGuard } from '../data/useShareCodeCacheGuard';

// Synthetic ids and codes only. The guard reads the session, faked.
const mockSession = jest.fn();
jest.mock('../../../core/session', () => ({ useSession: () => mockSession() }));

let session: { user: { id: string } } | null;

beforeEach(() => {
  session = { user: { id: 'u1' } };
  mockSession.mockImplementation(() => ({ session }));
});

const filled = async () => {
  const cache = createInMemoryShareCodeCache();
  await cache.set('u1', 'a1', 'TS-AAAAAA');
  await cache.set('u1', 'a2', 'TS-BBBBBB');
  await cache.set('u2', 'a3', 'TS-CCCCCC');
  return cache;
};

describe('useShareCodeCacheGuard', () => {
  it('deletes the codes of the person who signed out and keeps another user\'s', async () => {
    const cache = await filled();
    const { rerender } = await renderHook(() => useShareCodeCacheGuard(cache));

    session = null;
    await rerender({});

    expect(await cache.get('u1', 'a1')).toBeNull();
    expect(await cache.get('u1', 'a2')).toBeNull();
    expect(await cache.get('u2', 'a3')).toBe('TS-CCCCCC');
  });

  it('clears nothing while the person stays signed in, or on a cold start without a session', async () => {
    const cache = await filled();
    session = null;
    const { rerender } = await renderHook(() => useShareCodeCacheGuard(cache));
    await rerender({});
    session = { user: { id: 'u1' } };
    await rerender({});

    expect(cache.entries.size).toBe(3);
  });
});
