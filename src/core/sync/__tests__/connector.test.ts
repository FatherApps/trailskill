import type { AbstractPowerSyncDatabase, CrudEntry } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isPermanentUploadError, SupabaseConnector } from '../connector';
import { createStore, openDatabase } from '../testing/fakeDatabase';

type Result = { data: { id: string }[] | null; error: { code?: string; message: string } | null };

const ok: Result = { data: [{ id: 'row-1' }], error: null };
const empty: Result = { data: [], error: null };

function entry(op: 'PUT' | 'PATCH' | 'DELETE', id: string, opData?: Record<string, unknown>, table = 'athletes', clientId = 1) {
  return { op, table, id, opData, clientId } as unknown as CrudEntry;
}

type Statements = [string, unknown[]][];

function setup(
  results: { upsert?: Result; update?: Result; delete?: Result; readBack?: Result } = {},
  options: { maxAttempts?: number; sleep?: (ms: number) => Promise<void> } = {},
) {
  // An upsert is awaited directly, or chained with .select('id') when the connector needs the inserted row.
  const upsertResult = results.upsert ?? { data: null, error: null };
  const upsertSelect = jest.fn().mockResolvedValue(upsertResult);
  const upsert = jest.fn().mockImplementation(() => Object.assign(Promise.resolve(upsertResult), { select: upsertSelect }));
  const readBackEq = jest.fn().mockResolvedValue(results.readBack ?? ok);
  const readBack = jest.fn().mockReturnValue({ eq: readBackEq });
  const updateEq = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(results.update ?? ok) });
  const update = jest.fn().mockReturnValue({ eq: updateEq });
  const deleteEq = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(results.delete ?? ok) });
  const del = jest.fn().mockReturnValue({ eq: deleteEq });
  const from = jest.fn().mockReturnValue({ upsert, update, delete: del, select: readBack });
  const client = { from, auth: { getSession: jest.fn(), refreshSession: jest.fn() } };
  const complete = jest.fn().mockResolvedValue(undefined);
  // database.execute must never be used for bookkeeping: it would escape the transaction.
  const execute = jest.fn().mockResolvedValue(undefined);
  // Statements that reached storage: a write transaction commits only if its callback resolves (otherwise it rolls back).
  const committed: Statements = [];
  const writeTransaction = jest.fn().mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    const staged: Statements = [];
    const result = await callback({
      execute: async (sql: string, params: unknown[] = []) => {
        if (failOn && sql.startsWith(failOn)) throw new Error('disk full');
        staged.push([sql, params]);
      },
    });
    committed.push(...staged);
    return result;
  });
  let failOn: string | undefined;
  const database = (crud: CrudEntry[], options: { failOn?: string } = {}) => {
    failOn = options.failOn;
    return {
      getNextCrudTransaction: jest.fn().mockResolvedValue({ crud, complete }),
      execute,
      writeTransaction,
    } as unknown as AbstractPowerSyncDatabase;
  };
  const connector = new SupabaseConnector(client as unknown as SupabaseClient, 'https://sync.example.test', options);
  return {
    client, connector, database, complete, execute, committed, writeTransaction, from,
    upsert, upsertSelect, update, updateEq, del, deleteEq, readBack, readBackEq,
  };
}

const pendingDeletes = (statements: Statements) => statements.filter(([sql]) => sql.startsWith('DELETE FROM pending_writes'));
const failureInserts = (statements: Statements) => statements.filter(([sql]) => sql.startsWith('INSERT INTO upload_failures'));

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
    expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([
      ['athletes', 'a'],
      ['athletes', 'b'],
      ['athletes', 'c'],
    ]);
    expect(failureInserts(t.committed)).toHaveLength(0);
  });

  it('records a permanent 42501 rejection, clears the pending write and advances the queue', async () => {
    const t = setup({ upsert: { data: null, error: { code: '42501', message: 'denied' } } });
    await expect(t.connector.uploadData(t.database([entry('PUT', 'a', { first_name: 'Ana' })]))).resolves.toBeUndefined();

    const inserts = failureInserts(t.committed);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['athletes', 'a', 'PUT', JSON.stringify({ first_name: 'Ana' }), '42501', expect.any(String)]);
    expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['athletes', 'a']]);
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('records no_rows_affected when a PATCH matched no row', async () => {
    const t = setup({ update: empty });
    await expect(t.connector.uploadData(t.database([entry('PATCH', 'b', { first_name: 'Bea' })]))).resolves.toBeUndefined();

    const inserts = failureInserts(t.committed);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['athletes', 'b', 'PATCH', JSON.stringify({ first_name: 'Bea' }), 'no_rows_affected', expect.any(String)]);
    expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['athletes', 'b']]);
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('records no_rows_affected when a DELETE matched no row', async () => {
    const t = setup({ delete: empty });
    await expect(t.connector.uploadData(t.database([entry('DELETE', 'c')]))).resolves.toBeUndefined();

    const inserts = failureInserts(t.committed);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['athletes', 'c', 'DELETE', '{}', 'no_rows_affected', expect.any(String)]);
    expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['athletes', 'c']]);
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('rethrows a network error without touching local state so PowerSync retries', async () => {
    const error = { message: 'Network request failed' };
    const t = setup({ upsert: { data: null, error } });
    await expect(t.connector.uploadData(t.database([entry('PUT', 'a', { first_name: 'Ana' })]))).rejects.toBe(error);

    expect(t.complete).not.toHaveBeenCalled();
    expect(t.execute).not.toHaveBeenCalled();
    expect(t.writeTransaction).not.toHaveBeenCalled();
  });

  describe('retry limit for persistent coded errors', () => {
    const transient = { code: '42P01', message: 'relation does not exist' };
    const put = (clientId = 1) => entry('PUT', 'a', { first_name: 'Ana' }, 'athletes', clientId);

    it('throws with a growing wait for 4 attempts, then records the code and completes on the 5th', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const t = setup({ upsert: { data: null, error: transient } }, { sleep });

      for (let attempt = 1; attempt <= 4; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(transient);
      }
      expect(sleep.mock.calls).toEqual([[1000], [2000], [4000], [8000]]);
      expect(t.complete).not.toHaveBeenCalled();
      expect(t.writeTransaction).not.toHaveBeenCalled();

      await expect(t.connector.uploadData(t.database([put()]))).resolves.toBeUndefined();
      expect(sleep).toHaveBeenCalledTimes(4);
      const inserts = failureInserts(t.committed);
      expect(inserts).toHaveLength(1);
      expect(inserts[0][1]).toEqual(['athletes', 'a', 'PUT', JSON.stringify({ first_name: 'Ana' }), '42P01', expect.any(String)]);
      expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['athletes', 'a']]);
      expect(t.complete).toHaveBeenCalledTimes(1);
    });

    it('caps the wait at 30 seconds', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const t = setup({ upsert: { data: null, error: transient } }, { sleep, maxAttempts: 10 });
      for (let attempt = 1; attempt <= 9; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(transient);
      }
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000]);
    });

    it('gives up one op and still sends the rest of the transaction', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const t = setup({ upsert: { data: null, error: transient } }, { sleep, maxAttempts: 1 });
      await t.connector.uploadData(t.database([put(), entry('PATCH', 'b', { first_name: 'Bea' }, 'athletes', 2)]));

      expect(t.update).toHaveBeenCalledTimes(1);
      expect(failureInserts(t.committed)).toHaveLength(1);
      expect(t.complete).toHaveBeenCalledTimes(1);
    });

    it('keeps a given-up op at the limit, so a multi-op transaction ends in linear rounds', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const code = '42703';
      const t = setup({ upsert: { data: null, error: { code, message: 'no column' } } }, { sleep });
      const ops = [put(1), put(2), put(3)];

      let rounds = 0;
      let done = false;
      while (!done && rounds < 20) {
        rounds++;
        done = await t.connector.uploadData(t.database(ops)).then(() => true, () => false);
      }
      // Each op needs maxAttempts - 1 throwing rounds, then the last op's give-up round completes.
      expect(rounds).toBe(13);
      expect(failureInserts(t.committed).map(([, params]) => params[4])).toEqual([code, code, code]);
      expect(t.complete).toHaveBeenCalledTimes(1);
      // A given-up op never sleeps again: only 4 waits per op.
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000, 1000, 2000, 4000, 8000, 1000, 2000, 4000, 8000]);
    });

    it('never counts or gives up a code-less network error', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const error = { message: 'Network request failed' };
      const t = setup({ upsert: { data: null, error } }, { sleep });

      for (let attempt = 1; attempt <= 8; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(error);
      }
      expect(sleep).not.toHaveBeenCalled();
      expect(t.writeTransaction).not.toHaveBeenCalled();
      expect(t.complete).not.toHaveBeenCalled();
    });

    it('never counts or gives up an expired-session error (PGRST303)', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const error = { code: 'PGRST303', message: 'JWT expired' };
      const t = setup({ upsert: { data: null, error } }, { sleep });

      for (let attempt = 1; attempt <= 8; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(error);
      }
      expect(sleep).not.toHaveBeenCalled();
      expect(t.writeTransaction).not.toHaveBeenCalled();
      expect(t.complete).not.toHaveBeenCalled();
    });

    it('drops the counter of a completed op: another op starts at attempt 1', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const failing = setup({ upsert: { data: null, error: transient } }, { sleep });
      // Reuse one connector across a failing op that gives up and a new op with a different clientId.
      for (let attempt = 1; attempt <= 5; attempt++) {
        await failing.connector.uploadData(failing.database([put(1)])).catch(() => undefined);
      }
      sleep.mockClear();
      await expect(failing.connector.uploadData(failing.database([put(2)]))).rejects.toBe(transient);
      expect(sleep.mock.calls).toEqual([[1000]]);
    });

    it('a successful send resets the counter of that op', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const t = setup({ upsert: { data: null, error: transient } }, { sleep });
      await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(transient);
      t.upsert.mockImplementation(() => Object.assign(Promise.resolve({ data: null, error: null }), { select: jest.fn() }));
      await t.connector.uploadData(t.database([put()]));
      t.upsert.mockImplementation(() => Object.assign(Promise.resolve({ data: null, error: transient }), { select: jest.fn() }));
      sleep.mockClear();
      await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(transient);
      expect(sleep.mock.calls).toEqual([[1000]]);
    });
  });

  describe('append-only tables (case 1)', () => {
    const measurement = (id: string) => entry('PUT', id, { value: 1 }, 'measurements');

    it('retry of an already saved row: the insert returns no row, the read-back finds it, so it succeeds', async () => {
      const t = setup({ upsert: { data: [], error: null }, readBack: ok });
      await t.connector.uploadData(t.database([measurement('m1')]));

      expect(t.upsert).toHaveBeenCalledWith({ id: 'm1', value: 1 }, { onConflict: 'id', ignoreDuplicates: true });
      expect(t.readBack).toHaveBeenCalledWith('id');
      expect(t.readBackEq).toHaveBeenCalledWith('id', 'm1');
      expect(failureInserts(t.committed)).toHaveLength(0);
      expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['measurements', 'm1']]);
      expect(t.complete).toHaveBeenCalledTimes(1);
    });

    it('records no_rows_affected when the insert returned no row and the read-back finds nothing', async () => {
      const t = setup({ upsert: { data: [], error: null }, readBack: empty });
      await t.connector.uploadData(t.database([measurement('m1')]));

      const inserts = failureInserts(t.committed);
      expect(inserts).toHaveLength(1);
      expect(inserts[0][1]).toEqual(['measurements', 'm1', 'PUT', JSON.stringify({ value: 1 }), 'no_rows_affected', expect.any(String)]);
      expect(t.complete).toHaveBeenCalledTimes(1);
    });

    it('does not read back when the insert returned the row', async () => {
      const t = setup({ upsert: ok });
      await t.connector.uploadData(t.database([measurement('m1')]));

      expect(t.readBack).not.toHaveBeenCalled();
      expect(failureInserts(t.committed)).toHaveLength(0);
    });

    it('applies to timing_series too', async () => {
      const t = setup({ upsert: { data: [], error: null }, readBack: ok });
      await t.connector.uploadData(t.database([entry('PUT', 's1', { name: 'x' }, 'timing_series')]));

      expect(t.upsert).toHaveBeenCalledWith({ id: 's1', name: 'x' }, { onConflict: 'id', ignoreDuplicates: true });
      expect(failureInserts(t.committed)).toHaveLength(0);
    });

    it.each(['authorizations', 'school_invitations'])('applies to %s too, so a retry never hits the update policy', async (table) => {
      const t = setup({ upsert: { data: [], error: null }, readBack: ok });
      await t.connector.uploadData(t.database([entry('PUT', 'x1', { name: 'x' }, table)]));

      expect(t.upsert).toHaveBeenCalledWith({ id: 'x1', name: 'x' }, { onConflict: 'id', ignoreDuplicates: true });
      expect(failureInserts(t.committed)).toHaveLength(0);
    });

    it('keeps the plain upsert without options for other tables', async () => {
      const t = setup();
      await t.connector.uploadData(t.database([entry('PUT', 'a', { first_name: 'Ana' })]));

      expect(t.upsert.mock.calls[0]).toEqual([{ id: 'a', first_name: 'Ana' }]);
      expect(t.readBack).not.toHaveBeenCalled();
    });
  });

  describe('DELETE already applied (case 5)', () => {
    it('succeeds when the delete affected no row and the row is gone', async () => {
      const t = setup({ delete: empty, readBack: empty });
      await t.connector.uploadData(t.database([entry('DELETE', 'c')]));

      expect(t.readBackEq).toHaveBeenCalledWith('id', 'c');
      expect(failureInserts(t.committed)).toHaveLength(0);
      expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['athletes', 'c']]);
    });

    it('records no_rows_affected when the delete affected no row but the row is still visible', async () => {
      const t = setup({ delete: empty, readBack: ok });
      await t.connector.uploadData(t.database([entry('DELETE', 'c')]));

      expect(failureInserts(t.committed)[0][1]).toEqual(['athletes', 'c', 'DELETE', '{}', 'no_rows_affected', expect.any(String)]);
    });
  });

  describe('bookkeeping (cases 2, 3 and 4)', () => {
    it('runs all bookkeeping inside one write transaction, never through database.execute', async () => {
      const t = setup({ update: empty });
      await t.connector.uploadData(t.database([entry('PUT', 'a', { first_name: 'Ana' }), entry('PATCH', 'b', { first_name: 'Bea' })]));

      expect(t.writeTransaction).toHaveBeenCalledTimes(1);
      expect(t.execute).not.toHaveBeenCalled();
      expect(pendingDeletes(t.committed)).toHaveLength(2);
      expect(failureInserts(t.committed)).toHaveLength(1);
      expect(t.complete).toHaveBeenCalledTimes(1);
    });

    it.each(['DELETE FROM pending_writes', 'INSERT INTO upload_failures'])(
      'commits nothing and does not complete when a bookkeeping statement (%s) throws',
      async (failOn) => {
        const t = setup({ update: empty });
        const crud = [entry('PUT', 'a', { first_name: 'Ana' }), entry('PATCH', 'b', { first_name: 'Bea' })];
        await expect(t.connector.uploadData(t.database(crud, { failOn }))).rejects.toThrow('disk full');

        expect(t.committed).toEqual([]);
        expect(t.complete).not.toHaveBeenCalled();
      },
    );

    describe('against a real SQLite store', () => {
      const pendingCount = (db: ReturnType<typeof openDatabase>, id: string) =>
        db.getAll("SELECT id FROM pending_writes WHERE table_name = 'athletes' AND record_id = ?", [id]).length;
      const failures = (db: ReturnType<typeof openDatabase>, id: string) =>
        db.getAll<{ error_code: string }>("SELECT error_code FROM upload_failures WHERE table_name = 'athletes' AND record_id = ?", [id]);

      function withStore(run: (db: ReturnType<typeof openDatabase>, uploaded: (t: ReturnType<typeof setup>, crud: CrudEntry[]) => Promise<void>) => Promise<void>) {
        return async () => {
          const store = createStore();
          try {
            const db = openDatabase(store.path);
            const uploaded = (t: ReturnType<typeof setup>, crud: CrudEntry[]) => {
              const base = t.database(crud) as unknown as Record<string, unknown>;
              return t.connector.uploadData({ ...base, writeTransaction: db.writeTransaction.bind(db) } as unknown as AbstractPowerSyncDatabase);
            };
            await run(db, uploaded);
          } finally {
            store.remove();
          }
        };
      }

      it(
        'deletes exactly one pending mark per uploaded op, so a newer queued write stays pending',
        withStore(async (db, uploaded) => {
          await db.writeTransaction(async (tx) => {
            await tx.execute("INSERT INTO pending_writes (id, table_name, record_id) VALUES ('w1', 'athletes', 'a'), ('w2', 'athletes', 'a')");
          });
          await uploaded(setup(), [entry('PUT', 'a', { first_name: 'Ana' })]);

          expect(pendingCount(db, 'a')).toBe(1);
        }),
      );

      it(
        'clears the previous failures of a record when its op succeeds',
        withStore(async (db, uploaded) => {
          await db.writeTransaction(async (tx) => {
            await tx.execute("INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES ('f1', 'athletes', 'a', 'PUT', '{}', '42501', 'x')");
            await tx.execute("INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES ('f2', 'athletes', 'z', 'PUT', '{}', '42501', 'x')");
          });
          await uploaded(setup(), [entry('PUT', 'a', { first_name: 'Ana' })]);

          expect(failures(db, 'a')).toEqual([]);
          expect(failures(db, 'z')).toHaveLength(1);
        }),
      );

      it(
        'keeps a failure recorded by the same transaction, whatever the order of the ops of that record',
        withStore(async (db, uploaded) => {
          // Rule: successes clear old failures first, then this transaction's failures are inserted; a failure never disappears here.
          const t = setup({ update: empty });
          await uploaded(t, [entry('PUT', 'a', { first_name: 'Ana' }), entry('PATCH', 'a', { first_name: 'Bea' })]);
          expect(failures(db, 'a')).toEqual([{ error_code: 'no_rows_affected' }]);

          const t2 = setup({ update: empty });
          await uploaded(t2, [entry('PATCH', 'b', { first_name: 'Bea' }), entry('PUT', 'b', { first_name: 'Ana' })]);
          expect(failures(db, 'b')).toEqual([{ error_code: 'no_rows_affected' }]);
        }),
      );
    });
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

  it('refreshes a session that expires within the margin (clock skew)', async () => {
    const t = setup();
    t.client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'old', expires_at: nowSeconds() + 30 } }, error: null });
    t.client.auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null });

    await expect(t.connector.fetchCredentials()).resolves.toEqual({ endpoint: 'https://sync.example.test', token: 'fresh' });
    expect(t.client.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not refresh a session that expires in 10 minutes', async () => {
    const t = setup();
    t.client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'current', expires_at: nowSeconds() + 600 } }, error: null });

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
