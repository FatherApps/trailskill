import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryImportedResultsRepository,
  createPowerSyncImportedResultsRepository,
  createSupabasePendingChangeResolver,
  type ImportedResultsRepository,
} from '..';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync/db', () => ({
  get db() {
    return mockDb;
  },
}));
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
  supabase: { rpc: jest.fn() },
}));

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

// Synthetic data only. Two revisions of k1, one result of another athlete, one of another key.
const results = [
  { id: 'r1', athleteId: 'a1', key: 'k1', revision: 1, supersedes: null, hundredths: 2890, swumOn: '2026-03-14' },
  { id: 'r2', athleteId: 'a1', key: 'k1', revision: 2, supersedes: 'r1', hundredths: 2850, swumOn: '2026-03-14' },
  { id: 'r3', athleteId: 'a1', key: 'k2', revision: 1, supersedes: null, hundredths: null, swumOn: '2026-05-02' },
  { id: 'r4', athleteId: 'a2', key: 'k3', revision: 1, supersedes: null, hundredths: 3000, swumOn: '2026-01-01' },
];
const changes = [
  { id: 'c1', resultId: 'r3', athleteId: 'a1', status: 'pending', createdAt: '2026-10-28T11:00:00Z' },
  { id: 'c2', resultId: 'r2', athleteId: 'a1', status: 'used_new', createdAt: '2026-10-28T09:00:00Z' },
  { id: 'c3', resultId: 'r4', athleteId: 'a2', status: 'pending', createdAt: '2026-10-28T10:00:00Z' },
];
const imports = [
  { id: 'i1', athleteId: 'a1', requestedAt: '2026-10-20T10:00:00Z' },
  { id: 'i2', athleteId: 'a1', requestedAt: '2026-10-28T10:00:00Z' },
  { id: 'i3', athleteId: 'a2', requestedAt: '2026-10-29T10:00:00Z' },
];

const full = (r: (typeof results)[number]) => ({
  id: r.id,
  athleteId: r.athleteId,
  importId: 'i1',
  provider: 'zz-test',
  sourceResultKey: r.key,
  revision: r.revision,
  supersedesId: r.supersedes,
  stroke: 'FR' as const,
  distance: '50m' as const,
  pool: 'LCM' as const,
  hundredths: r.hundredths,
  swumOn: r.swumOn,
  competition: 'Synthetic Open',
  createdAt: '2026-10-28T10:00:00Z',
});
const fullChange = (c: (typeof changes)[number]) => ({
  id: c.id,
  importedResultId: c.resultId,
  athleteId: c.athleteId,
  importId: 'i2',
  stroke: 'FR' as const,
  distance: '50m' as const,
  pool: 'LCM' as const,
  hundredths: 2800,
  swumOn: '2026-05-02',
  competition: 'Synthetic Open',
  createdAt: c.createdAt,
  status: c.status as 'pending' | 'used_new',
});

function createPowerSync(): ImportedResultsRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec(`
    CREATE TABLE imported_results (id TEXT PRIMARY KEY, created_at TEXT, import_id TEXT, athlete_id TEXT, provider TEXT, source_result_key TEXT,
      revision INTEGER, supersedes_id TEXT, stroke TEXT, distance TEXT, pool TEXT, hundredths INTEGER, swum_on TEXT, competition TEXT);
    CREATE TABLE imported_result_changes (id TEXT PRIMARY KEY, created_at TEXT, imported_result_id TEXT, athlete_id TEXT, import_id TEXT,
      stroke TEXT, distance TEXT, pool TEXT, hundredths INTEGER, swum_on TEXT, competition TEXT, status TEXT, resolved_by TEXT, resolved_at TEXT);
    CREATE TABLE results_imports (id TEXT PRIMARY KEY, created_at TEXT, athlete_id TEXT, organization_id TEXT, provider TEXT, requested_by TEXT, requested_at TEXT);
  `);
  for (const r of results) {
    const f = full(r);
    seed
      .prepare('INSERT INTO imported_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(f.id, f.createdAt, f.importId, f.athleteId, f.provider, f.sourceResultKey, f.revision, f.supersedesId, f.stroke, f.distance, f.pool, f.hundredths, f.swumOn, f.competition);
  }
  for (const c of changes.map(fullChange)) {
    seed
      .prepare('INSERT INTO imported_result_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
      .run(c.id, c.createdAt, c.importedResultId, c.athleteId, c.importId, c.stroke, c.distance, c.pool, c.hundredths, c.swumOn, c.competition, c.status);
  }
  for (const i of imports) {
    seed.prepare('INSERT INTO results_imports VALUES (?, ?, ?, ?, ?, ?, ?)').run(i.id, i.requestedAt, i.athleteId, 'o1', 'zz-test', 'u1', i.requestedAt);
  }
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncImportedResultsRepository();
}

const factories: [string, () => ImportedResultsRepository][] = [
  ['in-memory', () => createInMemoryImportedResultsRepository(results.map(full), changes.map(fullChange), imports)],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s imported results repository', (_name, create) => {
  it('lists the current revision of each result, newest swim first', async () => {
    expect((await create().listByAthlete('a1')).map((r) => r.id)).toEqual(['r3', 'r2']);
  });

  it('keeps a missing time as null, never 0', async () => {
    const missing = (await create().listByAthlete('a1')).find((r) => r.id === 'r3');
    expect(missing?.hundredths).toBeNull();
  });

  it('lists only pending changes of the athlete', async () => {
    expect((await create().listPendingChanges('a1')).map((c) => c.id)).toEqual(['c1']);
  });

  it('does not expose the status column on a change', async () => {
    expect(Object.keys((await create().listPendingChanges('a1'))[0]!)).not.toContain('status');
  });

  it('tells when the athlete was last imported, or null before any import', async () => {
    const repository = create();
    expect(await repository.lastImportedAt('a1')).toBe('2026-10-28T10:00:00Z');
    expect(await repository.lastImportedAt('nobody')).toBeNull();
  });
});

describe('Supabase pending change resolver', () => {
  it.each([
    ['use_new', 'use_new'],
    ['keep_current', 'keep_current'],
  ] as const)('sends the %s choice to the server', async (choice, sent) => {
    const rpc = jest.fn().mockResolvedValue({ data: 'r9', error: null });
    expect(await createSupabasePendingChangeResolver({ rpc }).resolve('c1', choice)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('resolve_imported_result_change', { change: 'c1', choice: sent });
  });

  it('answers false when the server refuses, so the screen keeps the value shown before', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: new Error('not allowed') });
    expect(await createSupabasePendingChangeResolver({ rpc }).resolve('c1', 'use_new')).toBe(false);
  });

  it('answers false when the request throws, as when offline', async () => {
    const rpc = jest.fn().mockRejectedValue(new Error('network'));
    expect(await createSupabasePendingChangeResolver({ rpc }).resolve('c1', 'keep_current')).toBe(false);
  });
});
