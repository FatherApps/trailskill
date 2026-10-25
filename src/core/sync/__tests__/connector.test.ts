import type { AbstractPowerSyncDatabase, CrudEntry } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isPermanentUploadError, SupabaseConnector } from '../connector';

type Result = { data: { id: string }[] | null; error: { code?: string; message: string } | null };

const ok: Result = { data: [{ id: 'row-1' }], error: null };
const empty: Result = { data: [], error: null };

function entry(op: 'PUT' | 'PATCH' | 'DELETE', id: string, opData?: Record<string, unknown>) {
  return { op, table: 'athletes', id, opData } as unknown as CrudEntry;
}

function setup(results: { upsert?: Result; update?: Result; delete?: Result } = {}) {
  const upsert = jest.fn().mockResolvedValue(results.upsert ?? { data: null, error: null });
  const updateEq = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(results.update ?? ok) });
  const update = jest.fn().mockReturnValue({ eq: updateEq });
  const deleteEq = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(results.delete ?? ok) });
  const del = jest.fn().mockReturnValue({ eq: deleteEq });
  const from = jest.fn().mockReturnValue({ upsert, update, delete: del });
  const client = { from, auth: { getSession: jest.fn(), refreshSession: jest.fn() } };
  const complete = jest.fn().mockResolvedValue(undefined);
  const execute = jest.fn().mockResolvedValue(undefined);
  const database = (crud: CrudEntry[]) =>
    ({ getNextCrudTransaction: jest.fn().mockResolvedValue({ crud, complete }), execute }) as unknown as AbstractPowerSyncDatabase;
  const connector = new SupabaseConnector(client as unknown as SupabaseClient, 'https://sync.example.test');
  return { client, connector, database, complete, execute, from, upsert, update, updateEq, del, deleteEq };
}

const pendingDeletes = (execute: jest.Mock) =>
  execute.mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM pending_writes'));
const failureInserts = (execute: jest.Mock) =>
  execute.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO upload_failures'));

describe('SupabaseConnector.uploadData', () => {
  it('sends PUT, PATCH and DELETE, completes once and clears each pending write', async () => {
    const t = setup();
    const crud = [entry('PUT', 'a', { first_name: 'Ana' }), entry('PATCH', 'b', { first_name: 'Bea' }), entry('DELETE', 'c')];
    await t.connector.uploadData(t.database(crud));

    expect(t.upsert).toHaveBeenCalledWith({ id: 'a', first_name: 'Ana' });
    expect(t.update).toHaveBeenCalledWith({ first_name: 'Bea' });
    expect(t.updateEq).toHaveBeenCalledWith('id', 'b');
    expect(t.del).toHaveBeenCalledWith();
    expect(t.deleteEq).toHaveBeenCalledWith('id', 'c');
    expect(t.complete).toHaveBeenCalledTimes(1);
    expect(pendingDeletes(t.execute).map(([, params]) => params)).toEqual([
      ['athletes', 'a'],
      ['athletes', 'b'],
      ['athletes', 'c'],
    ]);
    expect(failureInserts(t.execute)).toHaveLength(0);
  });

  it('records a permanent 42501 rejection, clears the pending write and advances the queue', async () => {
    const t = setup({ upsert: { data: null, error: { code: '42501', message: 'denied' } } });
    await expect(t.connector.uploadData(t.database([entry('PUT', 'a', { first_name: 'Ana' })]))).resolves.toBeUndefined();

    const inserts = failureInserts(t.execute);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['athletes', 'a', 'PUT', JSON.stringify({ first_name: 'Ana' }), '42501', expect.any(String)]);
    expect(pendingDeletes(t.execute).map(([, params]) => params)).toEqual([['athletes', 'a']]);
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('records no_rows_affected when a PATCH matched no row', async () => {
    const t = setup({ update: empty });
    await expect(t.connector.uploadData(t.database([entry('PATCH', 'b', { first_name: 'Bea' })]))).resolves.toBeUndefined();

    const inserts = failureInserts(t.execute);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['athletes', 'b', 'PATCH', JSON.stringify({ first_name: 'Bea' }), 'no_rows_affected', expect.any(String)]);
    expect(pendingDeletes(t.execute).map(([, params]) => params)).toEqual([['athletes', 'b']]);
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('records no_rows_affected when a DELETE matched no row', async () => {
    const t = setup({ delete: empty });
    await expect(t.connector.uploadData(t.database([entry('DELETE', 'c')]))).resolves.toBeUndefined();

    const inserts = failureInserts(t.execute);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['athletes', 'c', 'DELETE', '{}', 'no_rows_affected', expect.any(String)]);
    expect(pendingDeletes(t.execute).map(([, params]) => params)).toEqual([['athletes', 'c']]);
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('rethrows a network error without touching local state so PowerSync retries', async () => {
    const error = { message: 'Network request failed' };
    const t = setup({ upsert: { data: null, error } });
    await expect(t.connector.uploadData(t.database([entry('PUT', 'a', { first_name: 'Ana' })]))).rejects.toBe(error);

    expect(t.complete).not.toHaveBeenCalled();
    expect(t.execute).not.toHaveBeenCalled();
  });
});

describe('SupabaseConnector.fetchCredentials', () => {
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it('refreshes an expired session and returns the new token', async () => {
    const t = setup();
    t.client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'old', expires_at: nowSeconds() - 60 } }, error: null });
    t.client.auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null });

    await expect(t.connector.fetchCredentials()).resolves.toEqual({ endpoint: 'https://sync.example.test', token: 'fresh' });
    expect(t.client.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('returns the current token when the session is still valid', async () => {
    const t = setup();
    t.client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'current', expires_at: nowSeconds() + 3600 } }, error: null });

    await expect(t.connector.fetchCredentials()).resolves.toEqual({ endpoint: 'https://sync.example.test', token: 'current' });
    expect(t.client.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('returns null without a session', async () => {
    const t = setup();
    t.client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(t.connector.fetchCredentials()).resolves.toBeNull();
  });
});

describe('isPermanentUploadError', () => {
  it.each(['22001', '22P02', '23505', '23503', '42501'])('is true for %s', (code) => {
    expect(isPermanentUploadError({ code })).toBe(true);
  });

  it.each(['42P01', '40001', '08006', 'PGRST301', ''])('is false for %p', (code) => {
    expect(isPermanentUploadError({ code })).toBe(false);
  });

  it('is false without a code', () => {
    expect(isPermanentUploadError({})).toBe(false);
  });
});
