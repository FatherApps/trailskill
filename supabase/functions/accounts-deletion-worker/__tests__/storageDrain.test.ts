import { createFakeClock } from './fakes.ts';
import { createStorageApi, createStorageDrainStore } from '../storageAdapters.ts';
import { ATHLETE, createFakeStorage, createMemoryDrainStore, pathOf } from './storageFakes.ts';
import { createStorageDrain, DEFAULT_GRACE_HOURS, DRAIN_BATCH, graceHoursFrom, MAX_ROUNDS, REPORT_LIMIT, sweepFrom } from '../storageDrain.ts';

const BUCKET = 'athlete-photos';
const queuedRow = (n: number) => ({ id: `row-${n}`, bucket: BUCKET, path: pathOf(n) });

function setup({ queued = [] as ReturnType<typeof queuedRow>[], held = [] as number[], failing = {} as Record<string, string>, orphans = [] as number[], graceHours = undefined as number | undefined, sweep = sweepFrom('delete') } = {}) {
  const memory = createMemoryDrainStore({ queued, orphans: orphans.map((n) => ({ bucket: BUCKET, path: pathOf(n) })) });
  const fake = createFakeStorage({ objects: held.map((n) => `${BUCKET}/${pathOf(n)}`), failing });
  const time = createFakeClock();
  return { ...memory, ...fake, time, drain: createStorageDrain({ store: memory.store, storage: fake.storage, clock: time.clock, graceHours, sweep }) };
}

const logged = (spy: jest.SpyInstance) => spy.mock.calls.map((call) => call.join(' ')).join('\n');

describe('storage drain', () => {
  let error: jest.SpyInstance;
  beforeEach(() => {
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => error.mockRestore());

  it('deletes each queued object through the Storage API and finishes its row', async () => {
    const s = setup({ queued: [queuedRow(1), queuedRow(2)], held: [1, 2] });
    expect(await s.drain()).toEqual({ deleted: 2, failed: 0, orphansDeleted: 0, orphansFailed: 0, orphansReported: 0 });
    expect([...s.held]).toEqual([]);
    expect(s.rows).toEqual([]);
  });

  it('counts an object that no longer exists as deleted, so its row is not stuck', async () => {
    const s = setup({ queued: [queuedRow(1)], held: [] });
    expect((await s.drain()).deleted).toBe(1);
    expect(s.rows).toEqual([]);
  });

  it('keeps a row whose delete failed, records the attempt, and deletes it in the next run when the API answers', async () => {
    const key = `${BUCKET}/${pathOf(1)}`;
    const failing: Record<string, string> = { [key]: 'Storage delete failed (HTTP 503)' };
    const s = setup({ queued: [queuedRow(1), queuedRow(2)], held: [1, 2], failing });
    expect(await s.drain()).toMatchObject({ deleted: 1, failed: 1 });
    expect(s.rows.map((r) => [r.queueId, r.attempts])).toEqual([['row-1', 1]]);
    expect(s.held.has(key)).toBe(true);

    delete failing[key];
    s.time.advance(24 * 60 * 60 * 1000);
    expect(await s.drain()).toMatchObject({ deleted: 1, failed: 0 });
    expect(s.rows).toEqual([]);
    expect([...s.held]).toEqual([]);
  });

  it('never logs a path or an athlete id, only the queue row id and the failure kind', async () => {
    const key = `${BUCKET}/${pathOf(1)}`;
    const s = setup({ queued: [queuedRow(1)], held: [1], failing: { [key]: 'Storage delete failed (HTTP 500)' }, orphans: [7] });
    s.storage.remove = async () => {
      throw new Error(`boom ${pathOf(1)} ${ATHLETE}`);
    };
    await s.drain();
    const output = logged(error);
    expect(output).toContain('queue row row-1');
    expect(output).toContain('unknown');
    expect(output).not.toContain(ATHLETE);
    expect(output).not.toContain(pathOf(1));
    expect(output).not.toContain(pathOf(7));
  });

  it('logs the HTTP status of a Storage failure and nothing of the object', async () => {
    const s = setup({ queued: [queuedRow(1)], held: [1], failing: { [`${BUCKET}/${pathOf(1)}`]: 'Storage delete failed (HTTP 503)' } });
    await s.drain();
    expect(error).toHaveBeenCalledWith('accounts-deletion-worker storage delete failed for queue row row-1: Storage delete failed (HTTP 503)');
    expect(logged(error)).not.toContain(ATHLETE);
  });

  it('keeps going when recording an attempt fails, and logs only the fixed message', async () => {
    const s = setup({ queued: [queuedRow(1), queuedRow(2)], held: [1, 2], failing: { [`${BUCKET}/${pathOf(1)}`]: 'Storage delete failed (network)' } });
    s.store.fail = async () => {
      throw new Error(`Calling fail_storage_deletion failed (57014)`);
    };
    expect(await s.drain()).toMatchObject({ deleted: 1, failed: 1 });
    expect(error).toHaveBeenCalledWith('accounts-deletion-worker recording the attempt for queue row row-1 failed: Calling fail_storage_deletion failed (57014)');
  });

  it('drains a backlog of more than one batch in a single run, and never loops on rows that keep failing', async () => {
    const total = DRAIN_BATCH * 2 + 5;
    const queued = Array.from({ length: total }, (_, i) => queuedRow(i + 1));
    const s = setup({ queued, held: queued.map((_, i) => i + 1) });
    expect((await s.drain()).deleted).toBe(total);

    const failing: Record<string, string> = {};
    for (const q of queued) failing[`${BUCKET}/${q.path}`] = 'Storage delete failed (network)';
    const f = setup({ queued, held: queued.map((_, i) => i + 1), failing });
    const summary = await f.drain();
    expect(summary).toMatchObject({ deleted: 0, failed: total });
    expect(f.rows.every((r) => r.attempts === 1)).toBe(true);
    expect(MAX_ROUNDS).toBeGreaterThan(1);
  });

  it('skips a queued path a photo row still references, whatever the Storage holds', async () => {
    const memory = createMemoryDrainStore({ queued: [queuedRow(1)], referenced: [pathOf(1)] });
    const fake = createFakeStorage({ objects: [`${BUCKET}/${pathOf(1)}`] });
    const drain = createStorageDrain({ store: memory.store, storage: fake.storage, clock: createFakeClock().clock });
    expect(await drain()).toEqual({ deleted: 0, failed: 0, orphansDeleted: 0, orphansFailed: 0, orphansReported: 0 });
    expect(fake.held.size).toBe(1);
  });

  it('sweeps the orphans the database lists, with the configured grace period, through the Storage API', async () => {
    const s = setup({ held: [7, 8], orphans: [7, 8], graceHours: 48 });
    expect(await s.drain()).toEqual({ deleted: 0, failed: 0, orphansDeleted: 2, orphansFailed: 0, orphansReported: 0 });
    expect([...s.held]).toEqual([]);
    expect(s.graceCalls).toEqual([48]);
  });

  it('uses 24 hours by default and counts an orphan that fails without logging its path', async () => {
    const s = setup({ held: [7, 8], orphans: [7, 8], failing: { [`${BUCKET}/${pathOf(7)}`]: 'Storage delete failed (HTTP 502)' } });
    expect(await s.drain()).toMatchObject({ orphansDeleted: 1, orphansFailed: 1 });
    expect(s.graceCalls).toEqual([DEFAULT_GRACE_HOURS]);
    expect(logged(error)).toBe('accounts-deletion-worker orphan sweep delete failed: Storage delete failed (HTTP 502)');
  });

  it('passes the same instant of the clock to every database call', async () => {
    const s = setup({ queued: [queuedRow(1)], held: [1], orphans: [7] });
    const nows: Date[] = [];
    const { claim, listOrphans } = s.store;
    s.store.claim = async (now, limit) => (nows.push(now), claim(now, limit));
    s.store.listOrphans = async (now, g, limit) => (nows.push(now), listOrphans(now, g, limit));
    await s.drain();
    expect(new Set(nows.map((d) => d.getTime())).size).toBe(1);
  });
});

describe('orphan sweep mode', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['report', 'report', false],
    [undefined, 'report', false],
    ['', 'report', false],
    ['delete', 'delete', false],
    ['DELETE', 'report', true],
    ['true', 'report', true],
  ])('reads STORAGE_ORPHAN_SWEEP %p as %p (unrecognized: %p)', (value, mode, unrecognized) => {
    expect(sweepFrom(value as string | undefined)).toEqual({ mode, unrecognized });
  });

  const drainWith = (sweep: ReturnType<typeof sweepFrom> | undefined) => {
    const memory = createMemoryDrainStore({ queued: [queuedRow(1)], orphans: [{ bucket: BUCKET, path: pathOf(7) }, { bucket: BUCKET, path: pathOf(8) }] });
    const fake = createFakeStorage({ objects: [1, 7, 8].map((n) => `${BUCKET}/${pathOf(n)}`) });
    const drain = createStorageDrain({ store: memory.store, storage: fake.storage, clock: createFakeClock().clock, ...(sweep ? { sweep } : {}) });
    return { ...memory, ...fake, drain };
  };

  it('without the variable (report) counts the orphans, deletes none, logs only the total, and still drains the queue', async () => {
    const s = drainWith(undefined);
    expect(await s.drain()).toEqual({ deleted: 1, failed: 0, orphansDeleted: 0, orphansFailed: 0, orphansReported: 2 });
    expect([...s.held].sort()).toEqual([`${BUCKET}/${pathOf(7)}`, `${BUCKET}/${pathOf(8)}`]);
    expect(s.rows).toEqual([]);
    expect(log).toHaveBeenCalledWith(`accounts-deletion-worker orphan sweep (report only, nothing deleted): 2 orphans older than ${DEFAULT_GRACE_HOURS} h`);
    const output = [...log.mock.calls, ...error.mock.calls].map((c) => c.join(' ')).join('\n');
    expect(output).not.toContain(ATHLETE);
    expect(output).not.toContain('.jpg');
    expect(error).not.toHaveBeenCalled();
  });

  it('in report mode with an unrecognized value logs it once per run, without echoing the value, and does not delete', async () => {
    const s = drainWith(sweepFrom('DELETE'));
    expect((await s.drain()).orphansDeleted).toBe(0);
    expect(s.held.size).toBe(2);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('accounts-deletion-worker STORAGE_ORPHAN_SWEEP is not report or delete: using report');
  });

  it('in delete mode deletes the orphans through the Storage API and drains the queue', async () => {
    const s = drainWith(sweepFrom('delete'));
    expect(await s.drain()).toEqual({ deleted: 1, failed: 0, orphansDeleted: 2, orphansFailed: 0, orphansReported: 0 });
    expect([...s.held]).toEqual([]);
    expect(s.rows).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });

  it('counts at most REPORT_LIMIT orphans in report mode and says so', async () => {
    const memory = createMemoryDrainStore({ orphans: Array.from({ length: REPORT_LIMIT + 5 }, (_, i) => ({ bucket: BUCKET, path: pathOf(i + 1) })) });
    const drain = createStorageDrain({ store: memory.store, storage: createFakeStorage().storage, clock: createFakeClock().clock });
    expect((await drain()).orphansReported).toBe(REPORT_LIMIT);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`counted up to ${REPORT_LIMIT}`));
  });
});

describe('storage drain after an athlete is deleted', () => {
  it('leaves no object of that athlete in Storage after a run, and the other athletes keep theirs', async () => {
    const OTHER = '12330000-0000-4000-8000-0000000000d2';
    const mine = [pathOf(1), pathOf(2)]; // the cascade queued every photo path of the athlete (pgTAP covers the queueing)
    const kept = `${OTHER}/12330000-0000-4000-8000-000000000099.jpg`;
    const memory = createMemoryDrainStore({ queued: mine.map((path, i) => ({ id: `row-${i}`, bucket: BUCKET, path })) });
    const fake = createFakeStorage({ objects: [...mine, kept].map((p) => `${BUCKET}/${p}`) });
    const summary = await createStorageDrain({ store: memory.store, storage: fake.storage, clock: createFakeClock().clock })();
    expect(summary.deleted).toBe(2);
    expect([...fake.held].filter((key) => key.includes(ATHLETE))).toEqual([]);
    expect([...fake.held]).toEqual([`${BUCKET}/${kept}`]);
    expect(memory.rows).toEqual([]);
  });
});

describe('storage drain logs', () => {
  const ALL = ['error', 'warn', 'log', 'info', 'debug'] as const;

  it('never writes a storage path or an athlete id on any failure path, with the real adapters', async () => {
    const spies = ALL.map((level) => jest.spyOn(console, level).mockImplementation(() => undefined));
    const leaky = (what: string) => `${what} ${pathOf(1)} ${pathOf(7)} ${ATHLETE}`;
    const calls: string[] = [];
    const rpc = async (fn: string) => {
      calls.push(fn);
      if (fn === 'claim_storage_deletions') return { data: [{ queue_id: 'row-1', bucket: BUCKET, path: pathOf(1) }], error: null };
      if (fn === 'fail_storage_deletion') return { data: null, error: { code: '57014', message: leaky('fail') } };
      if (fn === 'list_orphan_photo_objects') return { data: [{ bucket: BUCKET, path: pathOf(7) }], error: null };
      return { data: { status: 'ok' }, error: null };
    };
    const statuses = [503, undefined, 404];
    const storage = createStorageApi(async (_bucket, paths) => {
      const status = statuses.shift();
      if (status === undefined && statuses.length === 1) throw new Error(leaky('network'));
      return { error: status === 404 ? null : { status, message: leaky('storage') + paths.join() } };
    });
    const drain = createStorageDrain({ store: createStorageDrainStore(rpc), storage, clock: createFakeClock().clock, sweep: sweepFrom('delete') });
    const summary = await drain();
    expect(summary.failed + summary.orphansFailed + summary.deleted + summary.orphansDeleted).toBeGreaterThan(0);
    expect(calls).toContain('fail_storage_deletion');

    // A claim that fails on its own is the error the service logs: only the function name and the Postgres code.
    const broken = createStorageDrain({ store: createStorageDrainStore(async () => ({ data: null, error: { code: '57014', message: leaky('claim') } })), storage, clock: createFakeClock().clock });
    await expect(broken()).rejects.toThrow(new Error('Calling claim_storage_deletions failed (57014)'));

    const output = spies.map((spy) => spy.mock.calls.map((call) => call.join(' ')).join('\n')).join('\n');
    expect(output).not.toContain(ATHLETE);
    expect(output).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(output).not.toContain('.jpg');
    expect(output).toContain('queue row row-1');
    spies.forEach((spy) => spy.mockRestore());
  });
});

describe('graceHoursFrom', () => {
  it.each([
    ['48', 48],
    ['1', 1],
    [undefined, 24],
    ['', 24],
    ['0', 24],
    ['-5', 24],
    ['1.5', 24],
    ['abc', 24],
  ])('reads %p as %p', (value, expected) => {
    expect(graceHoursFrom(value)).toBe(expected);
  });
});
