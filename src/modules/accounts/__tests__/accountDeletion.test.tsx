import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  createInMemoryAccountDeletionRepository,
  createSupabaseAccountDeletionRepository,
  DELETION_STATUS_TIMEOUT_MS,
  useAccountDeletionStatus,
  type AccountDeletionClient,
} from '../data/accountDeletion';
import { createInMemoryKnownDeletionStatusRepository, createSecureStoreKnownDeletionStatusRepository } from '../data/knownDeletionStatus';
import { useKnownDeletionStatusGuard } from '../data/useKnownDeletionStatusGuard';

// Avoids loading the native PowerSync database.
jest.mock('../../../core/sync', () => ({}));
let mockSession: { user: { id: string } } | null = { user: { id: 'user-1' } };
jest.mock('../../../core/session', () => ({ useSession: () => ({ session: mockSession }) }));
const mockStore = new Map<string, string>();
// A phone that is slow to write: the value lands this many ms after the call.
let mockSetDelayMs = 0;
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    if (mockSetDelayMs) await new Promise((resolve) => setTimeout(resolve, mockSetDelayMs));
    mockStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => void mockStore.delete(key),
}));
beforeEach(() => {
  mockSetDelayMs = 0;
  mockStore.clear();
  mockSession = { user: { id: 'user-1' } };
});

function client(invoke: AccountDeletionClient['functions']['invoke'], rpc?: AccountDeletionClient['rpc']): AccountDeletionClient {
  return { functions: { invoke }, rpc: rpc ?? (async () => ({ data: null, error: null })) };
}

const refusal = (status: number, body: unknown) => ({ name: 'FunctionsHttpError', context: { json: async () => body, status } });

describe('createSupabaseAccountDeletionRepository', () => {
  it('sends each step to the function and returns its value', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { ok: true, value: { status: 'code_sent', emailSent: true } }, error: null });
    const repository = createSupabaseAccountDeletionRepository(client(invoke));

    expect(await repository.request()).toEqual({ ok: true, value: { status: 'code_sent', emailSent: true } });
    await repository.confirm('123456');
    await repository.cancel();

    expect(invoke.mock.calls).toEqual([
      ['accounts-delete-account', { body: { step: 'request' } }],
      ['accounts-delete-account', { body: { step: 'confirm', code: '123456' } }],
      ['accounts-delete-account', { body: { step: 'cancel' } }],
    ]);
  });

  it('turns a school block into the names the screen shows', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: refusal(403, { ok: false, error: { code: 'blocked_by_school', schools: [{ id: 's1', name: 'Escuela Sintética' }] } }) });

    expect(await createSupabaseAccountDeletionRepository(client(invoke)).request()).toEqual({
      ok: false,
      error: { code: 'blocked_by_school', schools: [{ id: 's1', name: 'Escuela Sintética' }] },
    });
  });

  it('keeps the other refusals of the server and treats an unknown one as unavailable', async () => {
    const answers = [refusal(400, { error: { code: 'invalid_code' } }), refusal(403, { error: { code: 'platform_admin', schools: [] } }), refusal(500, { error: { code: 'something_new' } }), refusal(502, 'not json')];
    const invoke = jest.fn();
    for (const error of answers) invoke.mockResolvedValueOnce({ data: null, error });
    const repository = createSupabaseAccountDeletionRepository(client(invoke));

    expect((await repository.confirm('000000')).ok).toBe(false);
    expect(await repository.request()).toEqual({ ok: false, error: { code: 'platform_admin' } });
    expect(await repository.request()).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect(await repository.request()).toEqual({ ok: false, error: { code: 'unavailable' } });
  });

  it('turns a success with no value, or a call that throws, into a failure the screens can show', async () => {
    const invoke = jest.fn().mockResolvedValueOnce({ data: null, error: null }).mockRejectedValueOnce(new Error('boom'));
    const repository = createSupabaseAccountDeletionRepository(client(invoke));

    expect(await repository.request()).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect(await repository.request()).toEqual({ ok: false, error: { code: 'offline' } });
  });

  it('says offline when the request never arrived', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError' } });

    expect(await createSupabaseAccountDeletionRepository(client(invoke)).cancel()).toEqual({ ok: false, error: { code: 'offline' } });
  });

  it('reads the date of a marked account from the status function, and null for an account that is not marked', async () => {
    const rpc = jest.fn().mockResolvedValueOnce({ data: '2026-12-20T15:00:00+00:00', error: null }).mockResolvedValueOnce({ data: null, error: null });
    const repository = createSupabaseAccountDeletionRepository(client(jest.fn(), rpc));

    expect(await repository.status()).toBe('2026-12-20T15:00:00+00:00');
    expect(await repository.status()).toBeNull();
    expect(rpc).toHaveBeenCalledWith('account_deletion_status');
  });

  it('throws when the status could not be asked, never reporting the account as not marked', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: new Error('no signal') });

    await expect(createSupabaseAccountDeletionRepository(client(jest.fn(), rpc)).status()).rejects.toThrow('no signal');
  });
});

describe('useAccountDeletionStatus', () => {
  it('waits, then reports a marked account with its date', async () => {
    const repository = createInMemoryAccountDeletionRepository({ deleteAfter: '2026-12-20T15:00:00.000Z' });
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1'));

    await waitFor(() => expect(result.current).toMatchObject({ state: 'marked', deleteAfter: '2026-12-20T15:00:00.000Z' }));
  });

  it('reports an account that is not marked as active', async () => {
    const repository = createInMemoryAccountDeletionRepository();
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1'));

    await waitFor(() => expect(result.current.state).toBe('active'));
  });

  it('opens the app as usual (unknown) when the server could not be asked', async () => {
    const repository = createInMemoryAccountDeletionRepository({ offline: true });
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1'));

    await waitFor(() => expect(result.current.state).toBe('unknown'));
  });

  it('gives up waiting after the time limit', async () => {
    jest.useFakeTimers();
    try {
      const never = { ...createInMemoryAccountDeletionRepository(), status: () => new Promise<string | null>(() => {}) };
      const { result } = await renderHook(() => useAccountDeletionStatus(never, 'user-1'));

      expect(result.current.state).toBe('loading');
      await act(async () => {
        jest.advanceTimersByTime(DELETION_STATUS_TIMEOUT_MS);
      });
      expect(result.current.state).toBe('unknown');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a real answer: the time limit never takes back a marked account once the server said so', async () => {
    jest.useFakeTimers();
    try {
      const repository = createInMemoryAccountDeletionRepository({ deleteAfter: '2026-12-20T15:00:00.000Z' });
      const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1'));
      await waitFor(() => expect(result.current.state).toBe('marked'));

      await act(async () => {
        jest.advanceTimersByTime(DELETION_STATUS_TIMEOUT_MS * 2);
      });

      expect(result.current).toMatchObject({ state: 'marked', deleteAfter: '2026-12-20T15:00:00.000Z' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not wait for anyone when nobody is signed in', async () => {
    const repository = createInMemoryAccountDeletionRepository();
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, undefined));

    expect(result.current.state).toBe('unknown');
    expect(repository.calls).toEqual([]);
  });

  it('asks again after a cancellation', async () => {
    const repository = createInMemoryAccountDeletionRepository({ deleteAfter: '2026-12-20T15:00:00.000Z' });
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1'));
    await waitFor(() => expect(result.current.state).toBe('marked'));

    await repository.cancel();
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.state).toBe('active'));
  });
});

// Issue 1311: the app paints from what the phone knows and asks the server in the background.
describe('useAccountDeletionStatus with the last known state on the phone', () => {
  const never = () => ({ ...createInMemoryAccountDeletionRepository(), status: () => new Promise<string | null>(() => {}) });
  const MARKED = '2026-12-20T15:00:00.000Z';

  it('paints an account known to be active at once, even when the server never answers', async () => {
    const known = createInMemoryKnownDeletionStatusRepository({ userId: 'user-1', status: { state: 'active' } });
    const repository = never();
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));

    await waitFor(() => expect(result.current.state).toBe('active'));
  });

  it('never reports loading while it only reads the phone, so no spinner can flash before a known state', async () => {
    const known = createInMemoryKnownDeletionStatusRepository({ userId: 'user-1', status: { state: 'active' } });
    const repository = never();
    const states: string[] = [];
    await renderHook(() => {
      const status = useAccountDeletionStatus(repository, 'user-1', known);
      states.push(status.state);
      return status;
    });

    await waitFor(() => expect(states).toContain('active'));
    expect(states).not.toContain('loading');
  });

  it('reports loading, the spinner, only once the phone has said it knows nothing and the server is awaited', async () => {
    const repository = never();
    const known = createInMemoryKnownDeletionStatusRepository();
    const states: string[] = [];
    await renderHook(() => {
      const status = useAccountDeletionStatus(repository, 'user-1', known);
      states.push(status.state);
      return status;
    });

    await waitFor(() => expect(states).toContain('loading'));
    expect(states[0]).toBe('reading');
  });

  it('opens an account known to be marked on its grace screen with no connection', async () => {
    const known = createInMemoryKnownDeletionStatusRepository({ userId: 'user-1', status: { state: 'marked', deleteAfter: MARKED } });
    const repository = createInMemoryAccountDeletionRepository({ offline: true });
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));

    await waitFor(() => expect(result.current).toMatchObject({ state: 'marked', deleteAfter: MARKED }));
  });

  it('blocks an account known to be active as soon as the server says it is marked, and remembers it', async () => {
    const known = createInMemoryKnownDeletionStatusRepository({ userId: 'user-1', status: { state: 'active' } });
    let answer: (value: string | null) => void = () => {};
    const repository = { ...createInMemoryAccountDeletionRepository(), status: () => new Promise<string | null>((resolve) => (answer = resolve)) };
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));
    await waitFor(() => expect(result.current.state).toBe('active'));

    await act(async () => answer(MARKED));

    await waitFor(() => expect(result.current).toMatchObject({ state: 'marked', deleteAfter: MARKED }));
    expect(await known.read('user-1')).toEqual({ state: 'marked', deleteAfter: MARKED });
  });

  it('lets an account known to be marked out once the server says it is not, and remembers it', async () => {
    const known = createInMemoryKnownDeletionStatusRepository({ userId: 'user-1', status: { state: 'marked', deleteAfter: MARKED } });
    const repository = createInMemoryAccountDeletionRepository();
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));

    await waitFor(() => expect(result.current.state).toBe('active'));
    expect(await known.read('user-1')).toEqual({ state: 'active' });
  });

  it('remembers the first answer of an account the phone knew nothing about', async () => {
    const known = createInMemoryKnownDeletionStatusRepository();
    const repository = createInMemoryAccountDeletionRepository({ deleteAfter: MARKED });
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));

    await waitFor(() => expect(result.current.state).toBe('marked'));
    expect(await known.read('user-1')).toEqual({ state: 'marked', deleteAfter: MARKED });
  });

  it('keeps the known state when the server could not be asked', async () => {
    const known = createInMemoryKnownDeletionStatusRepository({ userId: 'user-1', status: { state: 'active' } });
    const repository = createInMemoryAccountDeletionRepository({ offline: true });
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));

    await waitFor(() => expect(result.current.state).toBe('active'));
    expect(await known.read('user-1')).toEqual({ state: 'active' });
  });

  it('with nothing known waits for the server up to the time limit, as before', async () => {
    jest.useFakeTimers();
    try {
      const repository = never();
      const known = createInMemoryKnownDeletionStatusRepository();
      const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));
      expect(result.current.state).toBe('loading');

      await act(async () => {
        jest.advanceTimersByTime(DELETION_STATUS_TIMEOUT_MS);
      });

      expect(result.current.state).toBe('unknown');
    } finally {
      jest.useRealTimers();
    }
  });

  it('blocks a marked account whose answer arrives after the time limit', async () => {
    jest.useFakeTimers();
    try {
      let answer: (value: string | null) => void = () => {};
      const repository = { ...createInMemoryAccountDeletionRepository(), status: () => new Promise<string | null>((resolve) => (answer = resolve)) };
      const known = createInMemoryKnownDeletionStatusRepository();
      const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));
      await act(async () => {
        jest.advanceTimersByTime(DELETION_STATUS_TIMEOUT_MS);
      });
      expect(result.current.state).toBe('unknown');

      await act(async () => answer(MARKED));

      expect(result.current).toMatchObject({ state: 'marked', deleteAfter: MARKED });
    } finally {
      jest.useRealTimers();
    }
  });

  it('never uses the state remembered for another person', async () => {
    const known = createInMemoryKnownDeletionStatusRepository({ userId: 'user-1', status: { state: 'marked', deleteAfter: MARKED } });
    jest.useFakeTimers();
    try {
      const repository = never();
      const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-2', known));
      await act(async () => {
        jest.advanceTimersByTime(DELETION_STATUS_TIMEOUT_MS);
      });

      expect(result.current.state).toBe('unknown');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not paint the old marked state again while it asks after a cancellation', async () => {
    const known = createInMemoryKnownDeletionStatusRepository({ userId: 'user-1', status: { state: 'marked', deleteAfter: MARKED } });
    const repository = createInMemoryAccountDeletionRepository({ deleteAfter: MARKED });
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));
    await waitFor(() => expect(result.current.state).toBe('marked'));

    await repository.cancel();
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.state).toBe('active'));
  });
});

it('never remembers the late answer of a question that was asked again', async () => {
  const known = createInMemoryKnownDeletionStatusRepository({ userId: 'user-1', status: { state: 'marked', deleteAfter: '2026-12-20T15:00:00.000Z' } });
  const answers: ((value: string | null) => void)[] = [];
  const repository = { ...createInMemoryAccountDeletionRepository(), status: () => new Promise<string | null>((resolve) => answers.push(resolve)) };
  const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1', known));
  await act(async () => result.current.refresh());

  await act(async () => answers[1]?.(null));
  await act(async () => answers[0]?.('2026-12-20T15:00:00.000Z'));

  expect(result.current.state).toBe('active');
  expect(await known.read('user-1')).toEqual({ state: 'active' });
});

describe('createSecureStoreKnownDeletionStatusRepository', () => {
  it('keeps only the state and the date of the account that is signed in, and nothing for another one', async () => {
    const known = createSecureStoreKnownDeletionStatusRepository();
    await known.write('user-1', { state: 'marked', deleteAfter: '2026-12-20T15:00:00.000Z' });

    expect(await known.read('user-1')).toEqual({ state: 'marked', deleteAfter: '2026-12-20T15:00:00.000Z' });
    expect(await known.read('user-2')).toBeNull();
  });

  it('never leaves a value behind when a slow write is followed by the clear of a sign-out', async () => {
    mockSetDelayMs = 30;
    const writer = createSecureStoreKnownDeletionStatusRepository();
    const guard = createSecureStoreKnownDeletionStatusRepository();

    const write = writer.write('user-1', { state: 'marked', deleteAfter: '2026-12-20T15:00:00.000Z' });
    const clear = guard.clear();
    await Promise.all([write, clear]);

    expect(mockStore.has('trailskill-deletion-status')).toBe(false);
    expect(await writer.read('user-1')).toBeNull();
  });

  it('reads a damaged value as nothing known', async () => {
    mockStore.set('trailskill-deletion-status', '{"userId":"user-1","state":"marked"}');

    expect(await createSecureStoreKnownDeletionStatusRepository().read('user-1')).toBeNull();
  });
});

describe('useKnownDeletionStatusGuard', () => {
  it('forgets the remembered status when the session ends, and not before', async () => {
    const known = createSecureStoreKnownDeletionStatusRepository();
    await known.write('user-1', { state: 'marked', deleteAfter: '2026-12-20T15:00:00.000Z' });
    const { rerender } = await renderHook(() => useKnownDeletionStatusGuard(known));
    expect(await known.read('user-1')).not.toBeNull();

    mockSession = null;
    await rerender({});

    await waitFor(async () => expect(await known.read('user-1')).toBeNull());
    expect(mockStore.has('trailskill-deletion-status')).toBe(false);
  });
});
