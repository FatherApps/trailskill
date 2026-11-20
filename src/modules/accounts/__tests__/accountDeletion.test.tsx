import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  createInMemoryAccountDeletionRepository,
  createSupabaseAccountDeletionRepository,
  DELETION_STATUS_TIMEOUT_MS,
  useAccountDeletionStatus,
  type AccountDeletionClient,
} from '../data/accountDeletion';

// Avoids loading the native PowerSync database.
jest.mock('../../../core/sync', () => ({}));

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

  it('asks again after a cancellation', async () => {
    const repository = createInMemoryAccountDeletionRepository({ deleteAfter: '2026-12-20T15:00:00.000Z' });
    const { result } = await renderHook(() => useAccountDeletionStatus(repository, 'user-1'));
    await waitFor(() => expect(result.current.state).toBe('marked'));

    await repository.cancel();
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.state).toBe('active'));
  });
});
