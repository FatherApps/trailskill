import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createInMemoryKnownPlatformAdminRepository, createSecureStoreKnownPlatformAdminRepository } from '../data/knownPlatformAdmin';
import { useKnownPlatformAdminGuard } from '../data/useKnownPlatformAdminGuard';
import { usePlatformAdminRouteCorrection } from '../data/usePlatformAdminRouteCorrection';
import { PLATFORM_ADMIN_WAIT_MS, usePlatformAdminStatus } from '../data/usePlatformAdminStatus';

// The Supabase adapter imports the sync module, which loads native code.
jest.mock('../../../core/sync', () => ({ supabase: {} }));
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockStore.set(key, value),
  deleteItemAsync: async (key: string) => void mockStore.delete(key),
}));
let mockSession: { user: { id: string } } | null = { user: { id: 'user-1' } };
jest.mock('../../../core/session', () => ({ useSession: () => ({ session: mockSession }) }));

beforeEach(() => {
  mockStore.clear();
  mockSession = { user: { id: 'user-1' } };
});

// A server that never answers until a test answers it; `asked` counts the questions that went out.
function pendingServer() {
  const server = { asked: 0, answer: (_admin: boolean) => {}, isPlatformAdmin: () => new Promise<boolean>((resolve) => ((server.asked += 1), (server.answer = resolve))) };
  return server;
}

describe('usePlatformAdminStatus with the last known answer on the phone', () => {
  it.each([true, false])('answers %s at once from the phone while the server never answers, and does not ask it here', async (admin) => {
    const known = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin });
    const server = pendingServer();
    const { result } = await renderHook(() => usePlatformAdminStatus(server, 'user-1', known));

    await waitFor(() => expect(result.current).toBe(admin));
    expect(server.asked).toBe(0);
  });

  it('with nothing known waits for the server as before, then answers and remembers it for the next start', async () => {
    const known = createInMemoryKnownPlatformAdminRepository();
    const server = pendingServer();
    const { result } = await renderHook(() => usePlatformAdminStatus(server, 'user-1', known));
    await waitFor(() => expect(server.asked).toBe(1));
    expect(result.current).toBe('loading');

    await act(async () => server.answer(true));

    expect(result.current).toBe(true);
    expect(await known.read('user-1')).toBe(true);
  });

  it('with nothing known and no answer in time, unknown means not admin and nothing is remembered', async () => {
    jest.useFakeTimers();
    try {
      const known = createInMemoryKnownPlatformAdminRepository();
      const server = pendingServer();
      const { result } = await renderHook(() => usePlatformAdminStatus(server, 'user-1', known));
      await act(async () => {
        jest.advanceTimersByTime(PLATFORM_ADMIN_WAIT_MS);
      });

      expect(result.current).toBe(false);
      expect(await known.read('user-1')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('never remembers a failed lookup as an answer', async () => {
    const known = createInMemoryKnownPlatformAdminRepository();
    const offline = { isPlatformAdmin: () => Promise.reject(new Error('offline')) };
    const { result } = await renderHook(() => usePlatformAdminStatus(offline, 'user-1', known));

    await waitFor(() => expect(result.current).toBe(false));
    expect(await known.read('user-1')).toBeNull();
  });

  it('never uses what the phone remembers for another person', async () => {
    const known = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin: true });
    const server = pendingServer();
    const { result } = await renderHook(() => usePlatformAdminStatus(server, 'user-2', known));

    await waitFor(() => expect(server.asked).toBe(1));
    expect(result.current).toBe('loading');
  });
});

it('with a phone read that never ends, unknown means not admin once the wait is over', async () => {
  jest.useFakeTimers();
  try {
    const stuck = { ...createInMemoryKnownPlatformAdminRepository(), read: () => new Promise<boolean | null>(() => {}) };
    const server = pendingServer();
    const { result } = await renderHook(() => usePlatformAdminStatus(server, 'user-1', stuck));
    expect(result.current).toBe('loading');

    await act(async () => {
      jest.advanceTimersByTime(PLATFORM_ADMIN_WAIT_MS);
    });

    expect(result.current).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

describe('usePlatformAdminRouteCorrection', () => {
  const run = async (props: { server: { isPlatformAdmin: () => Promise<boolean> }; known: ReturnType<typeof createInMemoryKnownPlatformAdminRepository>; segments?: string[]; userId?: string }) => {
    const router = { replace: jest.fn() };
    const hook = await renderHook(() =>
      usePlatformAdminRouteCorrection({ repository: props.server, known: props.known, userId: props.userId ?? 'user-1', router, segments: props.segments ?? ['(app)', 'athletes'] }),
    );
    return { router, hook };
  };

  it('opens "/" again, and remembers the new answer, when a platform admin turns out not to be one', async () => {
    const known = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin: true });
    const { router } = await run({ server: { isPlatformAdmin: async () => false }, known });

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(await known.read('user-1')).toBe(false);
  });

  it('opens "/" again, and remembers the new answer, when someone turns out to be a platform admin', async () => {
    const known = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin: false });
    const { router } = await run({ server: { isPlatformAdmin: async () => true }, known, segments: ['(app)'] });

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(await known.read('user-1')).toBe(true);
  });

  it('opens "/" again only after the new answer is stored, so the landing never reads the old one', async () => {
    const memory = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin: true });
    let finish: () => void = () => {};
    const slow = { ...memory, write: (userId: string, admin: boolean) => new Promise<void>((resolve) => (finish = () => void memory.write(userId, admin).then(resolve))) };
    const { router } = await run({ server: { isPlatformAdmin: async () => false }, known: slow });

    await act(async () => {});
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => finish());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(await memory.read('user-1')).toBe(false);
  });

  it.each([true, false])('leaves the route alone when the answer is still %s', async (admin) => {
    const known = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin });
    const server = { isPlatformAdmin: jest.fn(async () => admin) };
    const { router } = await run({ server, known });

    await waitFor(() => expect(server.isPlatformAdmin).toHaveBeenCalled());
    await act(async () => {});
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('does not move a person who already opened a screen of their own, but remembers the answer', async () => {
    const known = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin: true });
    const { router } = await run({ server: { isPlatformAdmin: async () => false }, known, segments: ['(app)', 'settings'] });

    await waitFor(async () => expect(await known.read('user-1')).toBe(false));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('asks nothing when the phone knows nothing yet: the landing asks and remembers', async () => {
    const server = { isPlatformAdmin: jest.fn(async () => true) };
    const { router } = await run({ server, known: createInMemoryKnownPlatformAdminRepository() });

    await act(async () => {});
    expect(server.isPlatformAdmin).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('keeps the known answer and the route when the server could not be asked', async () => {
    const known = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin: true });
    const server = { isPlatformAdmin: jest.fn(() => Promise.reject(new Error('offline'))) };
    const { router } = await run({ server, known });

    await waitFor(() => expect(server.isPlatformAdmin).toHaveBeenCalled());
    await act(async () => {});
    expect(router.replace).not.toHaveBeenCalled();
    expect(await known.read('user-1')).toBe(true);
  });

  it('forgets a late answer once the screen is gone', async () => {
    const known = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin: true });
    const server = pendingServer();
    const { router, hook } = await run({ server, known });
    await waitFor(() => expect(server.asked).toBe(1));

    await hook.unmount();
    await act(async () => server.answer(false));

    expect(router.replace).not.toHaveBeenCalled();
    expect(await known.read('user-1')).toBe(true);
  });
});

describe('useKnownPlatformAdminGuard', () => {
  it('forgets the answer when the session ends, and not before', async () => {
    const known = createInMemoryKnownPlatformAdminRepository({ userId: 'user-1', admin: true });
    const { rerender } = await renderHook(() => useKnownPlatformAdminGuard(known));
    expect(known.calls).not.toContain('clear');

    mockSession = null;
    await rerender({});

    expect(known.calls).toContain('clear');
    expect(await known.read('user-1')).toBeNull();
  });
});

describe('createSecureStoreKnownPlatformAdminRepository', () => {
  it('keeps the own user id and a boolean, never for another person, and clears', async () => {
    const known = createSecureStoreKnownPlatformAdminRepository();
    await known.write('user-1', true);

    expect(JSON.parse(mockStore.get('trailskill-platform-admin') ?? '{}')).toEqual({ userId: 'user-1', admin: true });
    expect(await known.read('user-1')).toBe(true);
    expect(await known.read('user-2')).toBeNull();
    await known.clear();
    expect(await known.read('user-1')).toBeNull();
  });

  it('reads a damaged value as nothing known', async () => {
    mockStore.set('trailskill-platform-admin', '{"userId":"user-1","admin":"yes"}');

    expect(await createSecureStoreKnownPlatformAdminRepository().read('user-1')).toBeNull();
  });
});
