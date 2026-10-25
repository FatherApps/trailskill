import type { AbstractPowerSyncDatabase, CrudEntry } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isPermanentUploadError, SupabaseConnector } from '../connector';
import { createStore, openDatabase } from '../testing/fakeDatabase';

type Result = { data: { id: string }[] | null; error: { code?: string; message: string } | null; status?: number };

const ok: Result = { data: [{ id: 'row-1' }], error: null };
const empty: Result = { data: [], error: null };

function entry(op: 'PUT' | 'PATCH' | 'DELETE', id: string, opData?: Record<string, unknown>, table = 'athletes', clientId = 1) {
  return { op, table, id, opData, clientId } as unknown as CrudEntry;
}

type Statements = [string, unknown[]][];

function setup(
  // readBack may be a list: the Nth read-back query gets the Nth result, the last one repeats.
  results: { upsert?: Result; update?: Result; delete?: Result; readBack?: Result | Result[] } = {},
  options: { maxAttempts?: number; sleep?: (ms: number, signal: AbortSignal) => Promise<void> } = {},
) {
  // An upsert is awaited directly, or chained with .select('id') when the connector needs the inserted row.
  const upsertResult = results.upsert ?? { data: null, error: null };
  const upsertSelect = jest.fn().mockResolvedValue(upsertResult);
  const upsert = jest.fn().mockImplementation(() => Object.assign(Promise.resolve(upsertResult), { select: upsertSelect }));
  const readResults = Array.isArray(results.readBack) ? results.readBack : [results.readBack ?? ok];
  // The filters of each read-back query, in call order.
  const readQueries: [string, unknown][][] = [];
  const readBackEq = jest.fn();
  const readBack = jest.fn().mockImplementation(() => {
    const filters: [string, unknown][] = [];
    readQueries.push(filters);
    const result = readResults[Math.min(readQueries.length - 1, readResults.length - 1)];
    const query = {
      eq: (column: string, value: unknown) => {
        readBackEq(column, value);
        filters.push([column, value]);
        return query;
      },
      // Recorded as 'is.null' / 'not.is.null', the PostgREST spelling of a null-ness filter.
      is: (column: string, value: unknown) => {
        filters.push([column, `is.${value}`]);
        return query;
      },
      not: (column: string, operator: string, value: unknown) => {
        filters.push([column, `not.${operator}.${value}`]);
        return query;
      },
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    };
    return query;
  });
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
      getOptional: async () => null,
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
    upsert, upsertSelect, update, updateEq, del, deleteEq, readBack, readBackEq, readQueries,
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
    expect(inserts[0][1]).toEqual(['athletes', 'a', 'PUT', JSON.stringify({ first_name: 'Ana' }), '42501', expect.any(String), 1]);
    expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['athletes', 'a']]);
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('records the op clientId with the failure, so retry can order failures by queue order', async () => {
    const t = setup({ upsert: { data: null, error: { code: '42501', message: 'denied' } } });
    await t.connector.uploadData(t.database([entry('PUT', 'a', { first_name: 'Ana' }, 'athletes', 7)]));

    expect(failureInserts(t.committed)[0][1].at(-1)).toBe(7);
  });

  it('records no_rows_affected when a PATCH matched no row', async () => {
    const t = setup({ update: empty });
    await expect(t.connector.uploadData(t.database([entry('PATCH', 'b', { first_name: 'Bea' })]))).resolves.toBeUndefined();

    const inserts = failureInserts(t.committed);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['athletes', 'b', 'PATCH', JSON.stringify({ first_name: 'Bea' }), 'no_rows_affected', expect.any(String), 1]);
    expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['athletes', 'b']]);
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('records no_rows_affected when a DELETE matched no row', async () => {
    const t = setup({ delete: empty });
    await expect(t.connector.uploadData(t.database([entry('DELETE', 'c')]))).resolves.toBeUndefined();

    const inserts = failureInserts(t.committed);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['athletes', 'c', 'DELETE', '{}', 'no_rows_affected', expect.any(String), 1]);
    expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['athletes', 'c']]);
    expect(t.complete).toHaveBeenCalledTimes(1);
  });

  it('rethrows a network error without touching local state so PowerSync retries', async () => {
    const error = { message: 'Network request failed' };
    const t = setup({ upsert: { data: null, error } }, { sleep: jest.fn().mockResolvedValue(undefined) });
    await expect(t.connector.uploadData(t.database([entry('PUT', 'a', { first_name: 'Ana' })]))).rejects.toBe(error);

    expect(t.complete).not.toHaveBeenCalled();
    expect(t.execute).not.toHaveBeenCalled();
    expect(t.writeTransaction).not.toHaveBeenCalled();
  });

  describe('JSON text columns that are arrays on the server', () => {
    const blocks = 'training_plan_blocks';

    it('uploads a PUT equipment JSON text as a real array', async () => {
      const t = setup();
      await t.connector.uploadData(t.database([entry('PUT', 'a', { name: 'Fins', equipment: '["fins","paddles"]' }, blocks)]));

      expect(t.upsert).toHaveBeenCalledWith({ id: 'a', name: 'Fins', equipment: ['fins', 'paddles'] });
    });

    it('uploads a PATCH equipment JSON text as a real array', async () => {
      const t = setup();
      await t.connector.uploadData(t.database([entry('PATCH', 'a', { equipment: '["fins"]' }, blocks)]));

      expect(t.update).toHaveBeenCalledWith({ equipment: ['fins'] });
    });

    it('keeps a null equipment as null', async () => {
      const t = setup();
      await t.connector.uploadData(t.database([entry('PUT', 'a', { equipment: null }, blocks)]));

      expect(t.upsert).toHaveBeenCalledWith({ id: 'a', equipment: null });
    });

    it('leaves the same column name on another table as the same string', async () => {
      const t = setup();
      await t.connector.uploadData(t.database([entry('PUT', 'a', { equipment: '["fins"]' }, 'athletes')]));

      expect(t.upsert).toHaveBeenCalledWith({ id: 'a', equipment: '["fins"]' });
    });

    it.each(['{fins', '"fins"'])('sends invalid text %s unchanged and records the server rejection', async (text) => {
      const t = setup({ upsert: { data: null, error: { code: '22P02', message: 'malformed array literal' } } });
      await t.connector.uploadData(t.database([entry('PUT', 'a', { equipment: text }, blocks)]));

      expect(t.upsert).toHaveBeenCalledWith({ id: 'a', equipment: text });
      const inserts = failureInserts(t.committed);
      expect(inserts).toHaveLength(1);
      expect(inserts[0][1]).toEqual([blocks, 'a', 'PUT', JSON.stringify({ equipment: text }), '22P02', expect.any(String), 1]);
    });
  });

  describe('retry limit for persistent coded errors', () => {
    const persistent = { code: '42P01', message: 'relation does not exist' };
    const put = (clientId = 1) => entry('PUT', 'a', { first_name: 'Ana' }, 'athletes', clientId);

    it('throws with a growing wait for 4 attempts, then records the code and completes on the 5th', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const t = setup({ upsert: { data: null, error: persistent } }, { sleep });

      for (let attempt = 1; attempt <= 4; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(persistent);
      }
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000]);
      expect(t.complete).not.toHaveBeenCalled();
      expect(t.writeTransaction).not.toHaveBeenCalled();

      await expect(t.connector.uploadData(t.database([put()]))).resolves.toBeUndefined();
      expect(sleep).toHaveBeenCalledTimes(4);
      const inserts = failureInserts(t.committed);
      expect(inserts).toHaveLength(1);
      expect(inserts[0][1]).toEqual(['athletes', 'a', 'PUT', JSON.stringify({ first_name: 'Ana' }), '42P01', expect.any(String), 1]);
      expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['athletes', 'a']]);
      expect(t.complete).toHaveBeenCalledTimes(1);
    });

    it('caps the wait at 30 seconds', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const t = setup({ upsert: { data: null, error: persistent } }, { sleep, maxAttempts: 10 });
      for (let attempt = 1; attempt <= 9; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(persistent);
      }
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000]);
    });

    it('gives up one op and still sends the rest of the transaction', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const t = setup({ upsert: { data: null, error: persistent } }, { sleep, maxAttempts: 1 });
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

    const growingWaits = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];

    it('gives up a 500 that carries a deterministic code (P0004) after maxAttempts and records it', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const error = { code: 'P0004', message: 'assert failed' };
      const t = setup({ upsert: { data: null, error, status: 500 } }, { sleep });

      for (let attempt = 1; attempt < 5; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(error);
      }
      await t.connector.uploadData(t.database([put()]));
      expect(failureInserts(t.committed)).toHaveLength(1);
      expect(failureInserts(t.committed)[0][1]).toContain('P0004');
      expect(t.complete).toHaveBeenCalledTimes(1);
    });

    it('gives up a 500 with 40002 (a deferred constraint failing at COMMIT) after maxAttempts and records it', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const error = { code: '40002', message: 'deferred constraint failed' };
      const t = setup({ upsert: { data: null, error, status: 500 } }, { sleep });

      for (let attempt = 1; attempt < 5; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(error);
      }
      await t.connector.uploadData(t.database([put()]));
      expect(failureInserts(t.committed)).toHaveLength(1);
      expect(failureInserts(t.committed)[0][1]).toContain('40002');
      expect(t.complete).toHaveBeenCalledTimes(1);
    });

    it('never gives up a 500 without a code', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const error = { message: 'internal error' };
      const t = setup({ upsert: { data: null, error, status: 500 } }, { sleep });

      for (let attempt = 1; attempt <= 8; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(error);
      }
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(growingWaits);
      expect(failureInserts(t.committed)).toHaveLength(0);
      expect(t.complete).not.toHaveBeenCalled();
    });

    it('never counts or gives up a code-less network error, and waits with a growing delay', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const error = { message: 'Network request failed' };
      const t = setup({ upsert: { data: null, error } }, { sleep });

      for (let attempt = 1; attempt <= 8; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(error);
      }
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(growingWaits);
      expect(t.writeTransaction).not.toHaveBeenCalled();
      expect(t.complete).not.toHaveBeenCalled();
    });

    it('never counts or gives up an expired-session error (PGRST303), and waits with a growing delay', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const error = { code: 'PGRST303', message: 'JWT expired' };
      const t = setup({ upsert: { data: null, error } }, { sleep });

      for (let attempt = 1; attempt <= 8; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(error);
      }
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(growingWaits);
      expect(t.writeTransaction).not.toHaveBeenCalled();
      expect(t.complete).not.toHaveBeenCalled();
    });

    it.each(['57014', '40001', '40P01', '40003', '55P03', '57P01', '57P03'])('never gives up the transient server error %s, and waits with a growing delay', async (code) => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const error = { code, message: 'transient' };
      const t = setup({ upsert: { data: null, error } }, { sleep });

      for (let attempt = 1; attempt <= 8; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(error);
      }
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(growingWaits);
      expect(t.writeTransaction).not.toHaveBeenCalled();
      expect(failureInserts(t.committed)).toHaveLength(0);
      expect(t.complete).not.toHaveBeenCalled();
    });

    it('never gives up a response with HTTP status 503, even with a code that would otherwise give up', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const error = { code: '42P01', message: 'service unavailable' };
      const t = setup({ upsert: { data: null, error, status: 503 } }, { sleep });

      for (let attempt = 1; attempt <= 8; attempt++) {
        await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(error);
      }
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(growingWaits);
      expect(t.writeTransaction).not.toHaveBeenCalled();
      expect(failureInserts(t.committed)).toHaveLength(0);
      expect(t.complete).not.toHaveBeenCalled();
    });

    it('does not mix network retries into the give-up count of coded errors', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const t = setup({ upsert: { data: null, error: { message: 'Network request failed' } } }, { sleep });
      for (let attempt = 1; attempt <= 6; attempt++) await t.connector.uploadData(t.database([put()])).catch(() => undefined);

      t.upsert.mockImplementation(() => Object.assign(Promise.resolve({ data: null, error: persistent }), { select: jest.fn() }));
      await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(persistent);
      expect(failureInserts(t.committed)).toHaveLength(0);
    });

    it('drops the counter of a completed op: another op starts at attempt 1', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const failing = setup({ upsert: { data: null, error: persistent } }, { sleep });
      // Reuse one connector across a failing op that gives up and a new op with a different clientId.
      for (let attempt = 1; attempt <= 5; attempt++) {
        await failing.connector.uploadData(failing.database([put(1)])).catch(() => undefined);
      }
      sleep.mockClear();
      await expect(failing.connector.uploadData(failing.database([put(2)]))).rejects.toBe(persistent);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000]);
    });

    it('a successful send resets the counter of that op', async () => {
      const sleep = jest.fn().mockResolvedValue(undefined);
      const t = setup({ upsert: { data: null, error: persistent } }, { sleep });
      await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(persistent);
      t.upsert.mockImplementation(() => Object.assign(Promise.resolve({ data: null, error: null }), { select: jest.fn() }));
      await t.connector.uploadData(t.database([put()]));
      t.upsert.mockImplementation(() => Object.assign(Promise.resolve({ data: null, error: persistent }), { select: jest.fn() }));
      sleep.mockClear();
      await expect(t.connector.uploadData(t.database([put()]))).rejects.toBe(persistent);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000]);
    });
  });

  describe('cancelWaits', () => {
    const networkError = { message: 'Network request failed' };
    const put = () => entry('PUT', 'a', { first_name: 'Ana' });

    // A sleep that only ends when its signal aborts; `waiting` resolves once a wait has started.
    function hangingSleep() {
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => (started = resolve));
      const sleep = jest.fn().mockImplementation(
        (_ms: number, signal: AbortSignal) =>
          new Promise<void>((_resolve, reject) => {
            started();
            signal.addEventListener('abort', () => reject(new Error('wait canceled')));
          }),
      );
      return { sleep, waiting };
    }

    it('ends a wait in progress: the upload rejects at once, writes nothing and does not complete', async () => {
      const { sleep, waiting } = hangingSleep();
      const t = setup({ upsert: { data: null, error: networkError } }, { sleep });

      const upload = t.connector.uploadData(t.database([put()]));
      const rejection = expect(upload).rejects.toThrow('wait canceled');
      await waiting;
      t.connector.cancelWaits();
      await rejection;

      expect(t.complete).not.toHaveBeenCalled();
      expect(t.writeTransaction).not.toHaveBeenCalled();
      expect(t.execute).not.toHaveBeenCalled();
    });

    it('does not affect later uploads', async () => {
      const { sleep, waiting } = hangingSleep();
      const t = setup({ upsert: { data: null, error: networkError } }, { sleep });
      const upload = t.connector.uploadData(t.database([put()]));
      const rejection = expect(upload).rejects.toThrow('wait canceled');
      await waiting;
      t.connector.cancelWaits();
      await rejection;

      t.upsert.mockImplementation(() => Object.assign(Promise.resolve({ data: null, error: null }), { select: jest.fn() }));
      await expect(t.connector.uploadData(t.database([put()]))).resolves.toBeUndefined();
      expect(t.complete).toHaveBeenCalledTimes(1);
    });

    it('a cancel while the request is in flight is not lost: the wait that follows starts already aborted', async () => {
      let answer!: () => void;
      const inFlight = new Promise<Result>((resolve) => (answer = () => resolve({ data: null, error: networkError })));
      const aborted: boolean[] = [];
      const sleep = jest.fn().mockImplementation(async (_ms: number, signal: AbortSignal) => {
        aborted.push(signal.aborted);
        if (signal.aborted) throw new Error('wait canceled');
      });
      const t = setup({}, { sleep });
      t.upsert.mockImplementation(() => Object.assign(inFlight, { select: jest.fn() }));

      const rejection = expect(t.connector.uploadData(t.database([put()]))).rejects.toThrow('wait canceled');
      while (!t.upsert.mock.calls.length) await Promise.resolve();
      t.connector.cancelWaits();
      answer();
      await rejection;

      expect(aborted).toEqual([true]);
      expect(t.complete).not.toHaveBeenCalled();
      expect(t.writeTransaction).not.toHaveBeenCalled();
    });

    it('a cancel while a batch is in flight records nothing and sends no further op', async () => {
      // After the session ends the request goes out without the user's token: RLS hides the row, so a PATCH matches none.
      let answer!: () => void;
      const inFlight = new Promise<Result>((resolve) => (answer = () => resolve(empty)));
      const t = setup();
      t.updateEq.mockReturnValue({ select: jest.fn().mockReturnValue(inFlight) });

      const rejection = expect(
        t.connector.uploadData(t.database([entry('PATCH', 'a', { first_name: 'Ana' }), entry('PUT', 'b', {}, 'athletes', 2)])),
      ).rejects.toThrow('Upload canceled');
      while (!t.update.mock.calls.length) await Promise.resolve();
      t.connector.cancelWaits();
      answer();
      await rejection;

      expect(t.upsert).not.toHaveBeenCalled();
      expect(t.writeTransaction).not.toHaveBeenCalled();
      expect(t.complete).not.toHaveBeenCalled();
    });

    it('a cancel while the last op is in flight records nothing', async () => {
      let answer!: () => void;
      const inFlight = new Promise<Result>((resolve) => (answer = () => resolve(empty)));
      const t = setup();
      t.updateEq.mockReturnValue({ select: jest.fn().mockReturnValue(inFlight) });

      const rejection = expect(t.connector.uploadData(t.database([entry('PATCH', 'a', { first_name: 'Ana' })]))).rejects.toThrow(
        'Upload canceled',
      );
      while (!t.update.mock.calls.length) await Promise.resolve();
      t.connector.cancelWaits();
      answer();
      await rejection;

      expect(t.writeTransaction).not.toHaveBeenCalled();
      expect(t.complete).not.toHaveBeenCalled();
    });

    it('the default sleep clears its timer when canceled', async () => {
      jest.useFakeTimers();
      try {
        const t = setup({ upsert: { data: null, error: networkError } });
        const rejection = expect(t.connector.uploadData(t.database([put()]))).rejects.toThrow();
        await jest.advanceTimersByTimeAsync(0);
        expect(jest.getTimerCount()).toBe(1);

        t.connector.cancelWaits();
        await rejection;
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
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
      expect(inserts[0][1]).toEqual(['measurements', 'm1', 'PUT', JSON.stringify({ value: 1 }), 'no_rows_affected', expect.any(String), 1]);
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

    it('sends a revocation of an invitation as an update by id, not as an upsert', async () => {
      const t = setup();
      await t.connector.uploadData(t.database([entry('PATCH', 'i1', { revoked_at: '2026-10-25T10:00:00.000Z' }, 'school_invitations')]));

      expect(t.update).toHaveBeenCalledWith({ revoked_at: '2026-10-25T10:00:00.000Z' });
      expect(t.updateEq).toHaveBeenCalledWith('id', 'i1');
      expect(t.upsert).not.toHaveBeenCalled();
      expect(failureInserts(t.committed)).toHaveLength(0);
    });

    it('keeps the plain upsert without options for other tables', async () => {
      const t = setup();
      await t.connector.uploadData(t.database([entry('PUT', 'a', { first_name: 'Ana' })]));

      expect(t.upsert.mock.calls[0]).toEqual([{ id: 'a', first_name: 'Ana' }]);
      expect(t.readBack).not.toHaveBeenCalled();
    });

    describe('a PUT that does not insert (issue 158)', () => {
      const denied: Result = { data: null, error: { code: '42501', message: 'denied' } };
      const conflict: Result = { data: [], error: null };
      const withdrawal = { user_id: 'u1', athlete_id: 'at1', accepted_at: '2026-10-01T10:00:00.000Z', withdrawn_at: '2026-10-02T10:00:00.000Z', note: null };
      const authorization = () => entry('PUT', 'au1', withdrawal, 'authorizations');
      const changed = (op: CrudEntry, code: string) => [op.table, op.id, 'PUT', JSON.stringify(op.opData), code, expect.any(String), 1];

      it('conflict and the stored row has every non-null column: success, filtered by id and each non-null column', async () => {
        const t = setup({ upsert: conflict, readBack: ok });
        await t.connector.uploadData(t.database([authorization()]));

        expect(t.readQueries).toEqual([
          [['id', 'au1'], ['user_id', 'u1'], ['athlete_id', 'at1'], ['withdrawn_at', 'not.is.null']],
        ]);
        expect(failureInserts(t.committed)).toHaveLength(0);
        expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['authorizations', 'au1']]);
        expect(t.complete).toHaveBeenCalledTimes(1);
      });

      it('conflict and the row exists with other values: insert_only_changed (a withdrawal sent as PUT is not ignored)', async () => {
        const t = setup({ upsert: conflict, readBack: [empty, ok] });
        await t.connector.uploadData(t.database([authorization()]));

        expect(t.readQueries[1]).toEqual([['id', 'au1']]);
        expect(failureInserts(t.committed).map(([, params]) => params)).toEqual([changed(authorization(), 'insert_only_changed')]);
        expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['authorizations', 'au1']]);
        expect(t.complete).toHaveBeenCalledTimes(1);
      });

      it('conflict and no row is visible: no_rows_affected', async () => {
        const t = setup({ upsert: conflict, readBack: empty });
        await t.connector.uploadData(t.database([authorization()]));

        expect(failureInserts(t.committed).map(([, params]) => params)).toEqual([changed(authorization(), 'no_rows_affected')]);
      });

      it('a permanent 42501 on a row that is already saved is a success, so a retry after losing the insert permission does not fail', async () => {
        const t = setup({ upsert: denied, readBack: ok });
        await t.connector.uploadData(t.database([authorization()]));

        expect(failureInserts(t.committed)).toHaveLength(0);
        expect(pendingDeletes(t.committed).map(([, params]) => params)).toEqual([['authorizations', 'au1']]);
        expect(t.complete).toHaveBeenCalledTimes(1);
      });

      it('a permanent 42501 and the row exists with other values: insert_only_changed', async () => {
        const t = setup({ upsert: denied, readBack: [empty, ok] });
        await t.connector.uploadData(t.database([authorization()]));

        expect(failureInserts(t.committed).map(([, params]) => params)).toEqual([changed(authorization(), 'insert_only_changed')]);
      });

      it('a permanent 42501 and the row is absent: the 42501 is recorded', async () => {
        const t = setup({ upsert: denied, readBack: empty });
        await t.connector.uploadData(t.database([authorization()]));

        expect(failureInserts(t.committed).map(([, params]) => params)).toEqual([changed(authorization(), '42501')]);
      });

      it('a permanent 42501 and the row cannot be read: the 42501 of the insert is recorded', async () => {
        const t = setup({ upsert: denied, readBack: { data: null, error: { code: '42501', message: 'no select' } } });
        await t.connector.uploadData(t.database([authorization()]));

        expect(failureInserts(t.committed).map(([, params]) => params)).toEqual([changed(authorization(), '42501')]);
      });

      it('a retry of an invitation with the token and expiry the server replaced counts as sent', async () => {
        const invitation = entry('PUT', 'i1', { school_id: 's1', token: 'client-token', expires_at: '2026-11-01T10:00:00.000Z', revoked_at: null, created_at: '2026-10-25T10:00:00.000Z' }, 'school_invitations');
        const t = setup({ upsert: conflict, readBack: ok });
        await t.connector.uploadData(t.database([invitation]));

        expect(t.readQueries).toEqual([[['id', 'i1'], ['school_id', 's1']]]);
        expect(failureInserts(t.committed)).toHaveLength(0);
      });

      it('a retry of an authorization whose accepted_at the server clamped counts as sent', async () => {
        const accepted = entry('PUT', 'au2', { user_id: 'u1', athlete_id: 'at1', accepted_at: '2026-10-25T10:00:01.000Z', received_at: '2026-10-25T10:00:00.000Z' }, 'authorizations');
        const t = setup({ upsert: conflict, readBack: ok });
        await t.connector.uploadData(t.database([accepted]));

        expect(t.readQueries).toEqual([[['id', 'au2'], ['user_id', 'u1'], ['athlete_id', 'at1'], ['withdrawn_at', 'is.null']]]);
        expect(failureInserts(t.committed)).toHaveLength(0);
      });

      it('an authorization sent as PUT with withdrawn_at over a row without a withdrawal: insert_only_changed', async () => {
        const op = entry('PUT', 'au3', { user_id: 'u1', athlete_id: 'at1', withdrawn_at: '2026-10-26T10:00:00.000Z' }, 'authorizations');
        const t = setup({ upsert: conflict, readBack: [empty, ok] });
        await t.connector.uploadData(t.database([op]));

        expect(t.readQueries).toEqual([[['id', 'au3'], ['user_id', 'u1'], ['athlete_id', 'at1'], ['withdrawn_at', 'not.is.null']], [['id', 'au3']]]);
        expect(failureInserts(t.committed).map(([, params]) => params)).toEqual([changed(op, 'insert_only_changed')]);
      });

      it('a transient error while reading back is retried, not recorded', async () => {
        const error = { message: 'Network request failed' };
        const t = setup({ upsert: conflict, readBack: { data: null, error } }, { sleep: jest.fn().mockResolvedValue(undefined) });
        await expect(t.connector.uploadData(t.database([authorization()]))).rejects.toBe(error);

        expect(t.writeTransaction).not.toHaveBeenCalled();
        expect(t.complete).not.toHaveBeenCalled();
      });
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

      expect(failureInserts(t.committed)[0][1]).toEqual(['athletes', 'c', 'DELETE', '{}', 'no_rows_affected', expect.any(String), 1]);
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
      const addMark = (db: ReturnType<typeof openDatabase>, id: string) =>
        db.writeTransaction(async (tx) => {
          await tx.execute("INSERT INTO pending_writes (id, table_name, record_id) VALUES (uuid(), 'athletes', ?)", [id]);
        });
      const uploadedOps = (db: ReturnType<typeof openDatabase>) =>
        db.getAll<{ client_id: number }>('SELECT client_id FROM uploaded_ops ORDER BY client_id').map((row) => row.client_id);

      function withStore(run: (db: ReturnType<typeof openDatabase>, uploaded: (t: ReturnType<typeof setup>, crud: CrudEntry[]) => Promise<void>) => Promise<void>) {
        return async () => {
          const store = createStore();
          try {
            const db = openDatabase(store.path);
            // The shared fake store does not know this table yet.
            await db.writeTransaction(async (tx) => {
              await tx.execute('CREATE TABLE uploaded_ops (id TEXT PRIMARY KEY, client_id INTEGER)');
              await tx.execute('ALTER TABLE upload_failures ADD COLUMN client_id INTEGER');
            });
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
          // Distinct clientIds, as in PowerSync: a second batch reusing one would be taken for a re-sent transaction.
          await uploaded(t, [entry('PUT', 'a', { first_name: 'Ana' }, 'athletes', 1), entry('PATCH', 'a', { first_name: 'Bea' }, 'athletes', 2)]);
          expect(failures(db, 'a')).toEqual([{ error_code: 'no_rows_affected' }]);

          const t2 = setup({ update: empty });
          await uploaded(t2, [entry('PATCH', 'b', { first_name: 'Bea' }, 'athletes', 3), entry('PUT', 'b', { first_name: 'Ana' }, 'athletes', 4)]);
          expect(failures(db, 'b')).toEqual([{ error_code: 'no_rows_affected' }]);
        }),
      );

      describe('crash between bookkeeping and complete()', () => {
        it(
          'does not delete the mark of a newer write when the same transaction is sent again',
          withStore(async (db, uploaded) => {
            await addMark(db, 'a');
            const t = setup();
            t.complete.mockRejectedValueOnce(new Error('crash'));
            const crud = [entry('PUT', 'a', { first_name: 'Ana' }, 'athletes', 7)];

            await expect(uploaded(t, crud)).rejects.toThrow('crash');
            expect(pendingCount(db, 'a')).toBe(0);

            await addMark(db, 'a');
            await uploaded(t, crud);
            expect(pendingCount(db, 'a')).toBe(1);
            expect(t.complete).toHaveBeenCalledTimes(2);
          }),
        );

        it(
          'does not record the same failure twice when the transaction is sent again',
          withStore(async (db, uploaded) => {
            await addMark(db, 'a');
            const t = setup({ update: empty });
            t.complete.mockRejectedValueOnce(new Error('crash'));
            const crud = [entry('PATCH', 'a', { first_name: 'Bea' }, 'athletes', 7)];

            await expect(uploaded(t, crud)).rejects.toThrow('crash');
            await uploaded(t, crud);
            expect(failures(db, 'a')).toEqual([{ error_code: 'no_rows_affected' }]);
          }),
        );

        it(
          'a re-send that succeeds still clears the old failure recorded by the first pass, and leaves the marks alone',
          withStore(async (db, uploaded) => {
            await addMark(db, 'a');
            const t = setup({ update: empty });
            t.complete.mockRejectedValueOnce(new Error('crash'));
            const crud = [entry('PATCH', 'a', { first_name: 'Bea' }, 'athletes', 7)];

            await expect(uploaded(t, crud)).rejects.toThrow('crash');
            expect(failures(db, 'a')).toEqual([{ error_code: 'no_rows_affected' }]);

            await addMark(db, 'a');
            await uploaded(setup(), crud);
            expect(failures(db, 'a')).toEqual([]);
            expect(pendingCount(db, 'a')).toBe(1);
          }),
        );

        it(
          'prunes the ops of completed transactions: ids below the first op of this transaction',
          withStore(async (db, uploaded) => {
            await db.writeTransaction(async (tx) => {
              await tx.execute('INSERT INTO uploaded_ops (id, client_id) VALUES (uuid(), 3), (uuid(), 9)');
            });
            await uploaded(setup(), [entry('PUT', 'a', { first_name: 'Ana' }, 'athletes', 5)]);

            expect(uploadedOps(db)).toEqual([5, 9]);
          }),
        );
      });
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
