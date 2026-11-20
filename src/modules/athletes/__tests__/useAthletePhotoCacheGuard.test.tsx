import { renderHook } from '@testing-library/react-native';

import { createInMemoryPhotoCache, useAthletePhotoCacheGuard } from '..';

// Synthetic data only. The guard reads the session and the local photo rows, both faked.
const mockSession = jest.fn();
const mockQuery = jest.fn();
jest.mock('../../../core/session', () => ({ useSession: () => mockSession() }));
jest.mock('../../../core/sync', () => ({ useQuery: (...args: unknown[]) => mockQuery(...args), supabase: {} }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '' } }));

const PATH_A = 'a1/11111111-1111-4111-8111-111111111111.jpg';
const PATH_B = 'a2/22222222-2222-4222-8222-222222222222.jpg';
const USER = { user: { id: 'guardian-1' } };

let state: { session: typeof USER | null; rows: { athlete_id: string; storage_path: string }[]; loading: boolean };

beforeEach(() => {
  state = { session: USER, rows: [{ athlete_id: 'a1', storage_path: PATH_A }], loading: false };
  mockSession.mockImplementation(() => ({ session: state.session }));
  mockQuery.mockImplementation(() => ({ data: state.rows, isLoading: state.loading, isFetching: state.loading }));
});

const filled = async () => {
  const cache = createInMemoryPhotoCache();
  await cache.put({ athleteId: 'a1', storagePath: PATH_A }, 'u1');
  await cache.put({ athleteId: 'a2', storagePath: PATH_B }, 'u2');
  return cache;
};

describe('useAthletePhotoCacheGuard', () => {
  it('empties the whole cache when the session goes from a person to nobody', async () => {
    const cache = await filled();
    const { rerender } = await renderHook(() => useAthletePhotoCacheGuard(cache));

    state.session = null;
    state.rows = [];
    await rerender({});

    expect(cache.files()).toEqual([]);
  });

  it('clears nothing on a cold start that begins without a session', async () => {
    const cache = await filled();
    state.session = null;
    const { rerender } = await renderHook(() => useAthletePhotoCacheGuard(cache));
    expect(cache.files()).toHaveLength(2);

    state.session = USER;
    await rerender({});

    expect(cache.files()).toContain('a1/11111111-1111-4111-8111-111111111111.jpg');
  });

  it('prunes what no local row justifies (killed before the sign-out, or another person signed in)', async () => {
    const cache = await filled();
    await renderHook(() => useAthletePhotoCacheGuard(cache));

    expect(cache.files()).toEqual(['a1/11111111-1111-4111-8111-111111111111.jpg']);
  });

  it('prunes everything when the local database was cleared', async () => {
    const cache = await filled();
    state.rows = [];
    await renderHook(() => useAthletePhotoCacheGuard(cache));

    expect(cache.files()).toEqual([]);
  });

  it('keeps the cache while the local rows are still loading', async () => {
    const cache = await filled();
    state.rows = [];
    state.loading = true;
    await renderHook(() => useAthletePhotoCacheGuard(cache));

    expect(cache.files()).toHaveLength(2);
  });

  it('prunes nothing without a session on screen', async () => {
    const cache = await filled();
    state.session = null;
    state.rows = [];
    await renderHook(() => useAthletePhotoCacheGuard(cache));

    expect(cache.files()).toHaveLength(2);
  });
});
