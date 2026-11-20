import type { Rpc } from '../../accounts-delete-account/adapters.ts';
import { createWorkerStore } from '../adapters.ts';

const NOW = new Date('2026-12-01T12:00:00.000Z');
const ID = '11111111-1111-4111-8111-111111111111';
const ROW = { request_id: ID, kind: 'deleted', email: 'user@example.test', delete_after: '2026-12-20T15:00:00Z', former_athlete_keys: ['K1'] };

function fakeRpc(data: unknown, error: { code?: string; message?: string } | null = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    return { data, error };
  };
  return { rpc, calls };
}

const reason = (promise: Promise<unknown>) => promise.then(() => '', (e: Error) => e.message);

describe('createWorkerStore', () => {
  it('lists the due requests with the instant and the limit', async () => {
    const { rpc, calls } = fakeRpc([ID]);
    expect(await createWorkerStore(rpc).listDue(NOW, 50)).toEqual([ID]);
    expect(calls).toEqual([{ fn: 'list_due_account_deletions', args: { p_now: '2026-12-01T12:00:00.000Z', p_limit: 50 } }]);
  });

  it.each([['not an array', { 0: ID }], ['an id that is not a string', [1]], ['an empty id', ['']]])('throws when listing answers %s', async (_name, data) => {
    expect(await reason(createWorkerStore(fakeRpc(data).rpc).listDue(NOW, 50))).toBe('Calling list_due_account_deletions failed (malformed)');
  });

  it.each(['deleted', 'stopped', 'skipped'] as const)('erases a request and maps %s', async (status) => {
    const { rpc, calls } = fakeRpc({ status });
    expect(await createWorkerStore(rpc).erase(ID, NOW)).toBe(status);
    expect(calls).toEqual([{ fn: 'erase_account', args: { p_request_id: ID, p_now: '2026-12-01T12:00:00.000Z' } }]);
  });

  it.each([['an unknown status', { status: 'surprise' }], ['no status', {}], ['null', null]])('throws when erasing answers %s', async (_name, data) => {
    expect(await reason(createWorkerStore(fakeRpc(data).rpc).erase(ID, NOW))).toBe('Calling erase_account failed (malformed)');
  });

  it('claims the due emails and maps them', async () => {
    const { rpc, calls } = fakeRpc([ROW]);
    expect(await createWorkerStore(rpc).claimMail(NOW, 50)).toEqual([{ requestId: ID, kind: 'deleted', email: 'user@example.test', deleteAfter: '2026-12-20T15:00:00Z', formerAthleteKeys: ['K1'] }]);
    expect(calls).toEqual([{ fn: 'claim_account_deletion_mail', args: { p_now: '2026-12-01T12:00:00.000Z', p_limit: 50 } }]);
  });

  it.each([
    ['not an array', {}],
    ['an unknown kind', [{ ...ROW, kind: 'other' }]],
    ['no email', [{ ...ROW, email: undefined }]],
    ['no date', [{ ...ROW, delete_after: undefined }]],
    ['no request id', [{ ...ROW, request_id: undefined }]],
    ['keys that are not an array', [{ ...ROW, former_athlete_keys: 'K1' }]],
    ['a key that is not a string', [{ ...ROW, former_athlete_keys: [1] }]],
    ['a row that is not an object', ['x']],
  ])('throws when claiming answers %s', async (_name, data) => {
    expect(await reason(createWorkerStore(fakeRpc(data).rpc).claimMail(NOW, 50))).toBe('Calling claim_account_deletion_mail failed (malformed)');
  });

  it('finishes an email', async () => {
    const { rpc, calls } = fakeRpc({ status: 'ok' });
    await createWorkerStore(rpc).finishMail(ID, 'reminder');
    expect(calls).toEqual([{ fn: 'finish_account_deletion_mail', args: { p_request_id: ID, p_kind: 'reminder' } }]);
  });

  it('throws when finishing does not answer ok', async () => {
    expect(await reason(createWorkerStore(fakeRpc({ status: 'nope' }).rpc).finishMail(ID, 'reminder'))).toBe('Calling finish_account_deletion_mail failed (malformed)');
  });

  it('throws with the Postgres code only, never the database message', async () => {
    const message = await reason(createWorkerStore(fakeRpc(null, { code: '42501', message: 'secret-internal-detail user@example.test' }).rpc).erase(ID, NOW));
    expect(message).toBe('Calling erase_account failed (42501)');
  });
});
