import { createInMemoryImportedResultsRepository, type ImportedResult, type PendingResultChange } from '..';

// The module index reaches the accounts index, which reaches the PowerSync repositories; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, writeBatch: jest.fn(), supabase: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const result = (overrides: Partial<ImportedResult>): ImportedResult => ({
  id: 'r1',
  athleteId: 'a1',
  importId: 'i1',
  provider: 'zz-test',
  sourceResultKey: 'k1',
  revision: 1,
  supersedesId: null,
  stroke: 'FR',
  distance: '50m',
  pool: 'LCM',
  hundredths: 2890,
  swumOn: '2026-03-14',
  competition: 'Synthetic Open',
  createdAt: '2026-10-28T10:00:00Z',
  ...overrides,
});

const change = (overrides: Partial<PendingResultChange> & { status?: 'pending' | 'used_new' | 'kept_current' | 'replaced' }) => ({
  id: 'c1',
  importedResultId: 'r1',
  athleteId: 'a1',
  importId: 'i2',
  stroke: 'FR' as const,
  distance: '50m' as const,
  pool: 'LCM' as const,
  hundredths: 2850,
  swumOn: '2026-03-14',
  competition: 'Synthetic Open',
  createdAt: '2026-10-28T11:00:00Z',
  status: 'pending' as const,
  ...overrides,
});

describe('imported results repository', () => {
  it('leaves out revisions that another row supersedes', async () => {
    const repo = createInMemoryImportedResultsRepository(
      [result({ id: 'old' }), result({ id: 'new', revision: 2, supersedesId: 'old', hundredths: 2850 })],
      [],
    );
    expect((await repo.listByAthlete('a1')).map((r) => r.id)).toEqual(['new']);
  });

  it('leaves out other athletes', async () => {
    const repo = createInMemoryImportedResultsRepository([result({ id: 'mine' }), result({ id: 'other', athleteId: 'a2' })], []);
    expect((await repo.listByAthlete('a1')).map((r) => r.id)).toEqual(['mine']);
  });

  it('lists the newest swim first, by id on a tie', async () => {
    const repo = createInMemoryImportedResultsRepository(
      [
        result({ id: 'b', swumOn: '2026-03-14' }),
        result({ id: 'c', swumOn: '2026-05-01' }),
        result({ id: 'a', swumOn: '2026-03-14' }),
      ],
      [],
    );
    expect((await repo.listByAthlete('a1')).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps a missing time as null', async () => {
    const repo = createInMemoryImportedResultsRepository([result({ hundredths: null })], []);
    expect((await repo.listByAthlete('a1'))[0].hundredths).toBeNull();
  });

  it('returns only pending changes of the athlete, oldest first', async () => {
    const repo = createInMemoryImportedResultsRepository(
      [],
      [
        change({ id: 'late', createdAt: '2026-10-28T12:00:00Z' }),
        change({ id: 'early', createdAt: '2026-10-28T09:00:00Z' }),
        change({ id: 'used', status: 'used_new' }),
        change({ id: 'kept', status: 'kept_current' }),
        change({ id: 'replaced', status: 'replaced' }),
        change({ id: 'other', athleteId: 'a2' }),
      ],
    );
    const pending = await repo.listPendingChanges('a1');
    expect(pending.map((c) => c.id)).toEqual(['early', 'late']);
    expect(pending[0]).not.toHaveProperty('status');
  });
});
