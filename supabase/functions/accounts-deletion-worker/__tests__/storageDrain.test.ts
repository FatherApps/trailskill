import { createFakeClock } from './fakes.ts';
import { ATHLETE, createFakeStorage, createMemoryDrainStore, pathOf } from './storageFakes.ts';
import { createStorageDrain, DEFAULT_GRACE_HOURS, DRAIN_BATCH, graceHoursFrom, MAX_ROUNDS } from '../storageDrain.ts';

const BUCKET = 'athlete-photos';
const queuedRow = (n: number) => ({ id: `row-${n}`, bucket: BUCKET, path: pathOf(n) });

function setup({ queued = [] as ReturnType<typeof queuedRow>[], held = [] as number[], failing = {} as Record<string, string>, orphans = [] as number[], graceHours = undefined as number | undefined } = {}) {
  const memory = createMemoryDrainStore({ queued, orphans: orphans.map((n) => ({ bucket: BUCKET, path: pathOf(n) })) });
  const fake = createFakeStorage({ objects: held.map((n) => `${BUCKET}/${pathOf(n)}`), failing });
  const time = createFakeClock();
  return { ...memory, ...fake, time, drain: createStorageDrain({ store: memory.store, storage: fake.storage, clock: time.clock, graceHours }) };
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
    expect(await s.drain()).toEqual({ deleted: 2, failed: 0, orphansDeleted: 0, orphansFailed: 0 });
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
    expect(await drain()).toEqual({ deleted: 0, failed: 0, orphansDeleted: 0, orphansFailed: 0 });
    expect(fake.held.size).toBe(1);
  });

  it('sweeps the orphans the database lists, with the configured grace period, through the Storage API', async () => {
    const s = setup({ held: [7, 8], orphans: [7, 8], graceHours: 48 });
    expect(await s.drain()).toEqual({ deleted: 0, failed: 0, orphansDeleted: 2, orphansFailed: 0 });
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
