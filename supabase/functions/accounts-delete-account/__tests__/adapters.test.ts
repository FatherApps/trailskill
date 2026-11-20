import { createAccountDeletionStore, type Rpc } from '../adapters.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const SCHOOLS = [{ id: 's1', name: 'Escuela de prueba' }];

function fakeRpc(data: unknown, error: { code?: string; message?: string } | null = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    return { data, error };
  };
  return { rpc, calls };
}

const reason = (promise: Promise<unknown>) => promise.then(() => '', (e: Error) => e.message);

describe('createAccountDeletionStore', () => {
  describe('request', () => {
    it('calls request_account_deletion with the user only and maps code_issued', async () => {
      const { rpc, calls } = fakeRpc({ status: 'code_issued', code: '123456', email: 'user@example.test' });
      expect(await createAccountDeletionStore(rpc).request(USER)).toEqual({ status: 'code_issued', code: '123456', email: 'user@example.test' });
      expect(calls).toEqual([{ fn: 'request_account_deletion', args: { p_user_id: USER } }]);
    });

    it.each(['school', 'platform_admin'] as const)('maps a block for %s with its schools', async (why) => {
      const { rpc } = fakeRpc({ status: 'blocked', reason: why, schools: SCHOOLS });
      expect(await createAccountDeletionStore(rpc).request(USER)).toEqual({ status: 'blocked', reason: why, schools: SCHOOLS });
    });

    it('maps rate_limited and already_marked', async () => {
      expect(await createAccountDeletionStore(fakeRpc({ status: 'rate_limited' }).rpc).request(USER)).toEqual({ status: 'rate_limited' });
      expect(await createAccountDeletionStore(fakeRpc({ status: 'already_marked', delete_after: '2026-12-20T15:00:00Z' }).rpc).request(USER)).toEqual({ status: 'already_marked', deleteAfter: '2026-12-20T15:00:00Z' });
    });

    it.each([
      ['an unknown status', { status: 'surprise' }],
      ['code_issued without a code', { status: 'code_issued', email: 'user@example.test' }],
      ['code_issued without an email', { status: 'code_issued', code: '123456' }],
      ['a block with an unknown reason', { status: 'blocked', reason: 'other', schools: [] }],
      ['a block without schools', { status: 'blocked', reason: 'school' }],
      ['a block with a malformed school', { status: 'blocked', reason: 'school', schools: [{ id: 's1' }] }],
      ['already_marked without a date', { status: 'already_marked' }],
      ['null', null],
      ['a string', 'code_issued'],
      ['an array', []],
    ])('throws on %s', async (_name, data) => {
      expect(await reason(createAccountDeletionStore(fakeRpc(data).rpc).request(USER))).toBe('Calling request_account_deletion failed (malformed)');
    });
  });

  describe('confirm', () => {
    it('calls confirm_account_deletion with the user and the code and maps marked', async () => {
      const { rpc, calls } = fakeRpc({ status: 'marked', delete_after: '2026-12-20T15:00:00Z', email: 'user@example.test' });
      expect(await createAccountDeletionStore(rpc).confirm(USER, '123456')).toEqual({ status: 'marked', deleteAfter: '2026-12-20T15:00:00Z', email: 'user@example.test' });
      expect(calls).toEqual([{ fn: 'confirm_account_deletion', args: { p_user_id: USER, p_code: '123456' } }]);
    });

    it.each(['invalid_code', 'code_expired', 'too_many_attempts'] as const)('maps %s', async (status) => {
      expect(await createAccountDeletionStore(fakeRpc({ status }).rpc).confirm(USER, '123456')).toEqual({ status });
    });

    it('maps a block and already_marked', async () => {
      expect(await createAccountDeletionStore(fakeRpc({ status: 'blocked', reason: 'school', schools: SCHOOLS }).rpc).confirm(USER, '123456')).toEqual({ status: 'blocked', reason: 'school', schools: SCHOOLS });
      expect(await createAccountDeletionStore(fakeRpc({ status: 'already_marked', delete_after: '2026-12-20T15:00:00Z' }).rpc).confirm(USER, '123456')).toEqual({ status: 'already_marked', deleteAfter: '2026-12-20T15:00:00Z' });
    });

    it.each([
      ['an unknown status', { status: 'cancelled' }],
      ['marked without an email', { status: 'marked', delete_after: '2026-12-20T15:00:00Z' }],
      ['marked without a date', { status: 'marked', email: 'user@example.test' }],
    ])('throws on %s', async (_name, data) => {
      expect(await reason(createAccountDeletionStore(fakeRpc(data).rpc).confirm(USER, '123456'))).toBe('Calling confirm_account_deletion failed (malformed)');
    });
  });

  describe('cancel', () => {
    it.each(['cancelled', 'not_marked'] as const)('calls cancel_account_deletion and maps %s', async (status) => {
      const { rpc, calls } = fakeRpc({ status });
      expect(await createAccountDeletionStore(rpc).cancel(USER)).toEqual({ status });
      expect(calls).toEqual([{ fn: 'cancel_account_deletion', args: { p_user_id: USER } }]);
    });

    it('throws on an unknown status', async () => {
      expect(await reason(createAccountDeletionStore(fakeRpc({ status: 'marked' }).rpc).cancel(USER))).toBe('Calling cancel_account_deletion failed (malformed)');
    });
  });

  it('throws with the Postgres code only, never the database message', async () => {
    const message = await reason(createAccountDeletionStore(fakeRpc(null, { code: '42501', message: 'secret-internal-detail user@example.test' }).rpc).request(USER));
    expect(message).toBe('Calling request_account_deletion failed (42501)');
  });

  it('throws "unknown" when the error carries no code', async () => {
    expect(await reason(createAccountDeletionStore(fakeRpc(null, {}).rpc).cancel(USER))).toBe('Calling cancel_account_deletion failed (unknown)');
  });
});
