import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createPowerSyncTournamentCatalogRepository } from '../data/powerSyncTournamentCatalogRepository';
import {
  createInMemoryTournamentCatalogRepository,
  groupTournaments,
  isRealDateKey,
  type TournamentCatalogEntry,
  type TournamentCatalogRepository,
} from '../data/tournamentCatalog';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
}));

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

// Synthetic data only: cities and tournaments that do not exist.
const entry = (over: Partial<TournamentCatalogEntry> & Pick<TournamentCatalogEntry, 'id' | 'dateKey' | 'name' | 'city'>): TournamentCatalogEntry => ({
  organizationId: 'org-platform',
  year: Number(over.dateKey.slice(0, 4)),
  discipline: 'swimming',
  course: null,
  sourceUrl: 'https://example.test/torneo',
  refreshedAt: '2026-11-21T10:00:00Z',
  ...over,
});

const catalog: TournamentCatalogEntry[] = [
  entry({ id: 't1', dateKey: '20260510', name: 'Copa Sintética', city: 'Barranquilla' }),
  entry({ id: 't2', dateKey: '20250301', name: 'Abierto Ficticio', city: 'Barranquilla' }),
  entry({ id: 't3', dateKey: '20260802', name: 'Festival Demo', city: 'Álamos' }),
  entry({ id: 't4', dateKey: '20250915', name: 'Gran Premio de Barranquilla', city: 'Zipaquirá' }),
  entry({ id: 't5', dateKey: '20240120', name: 'Torneo Sin Ciudad Conocida', city: 'Cartagena' }),
];

describe('isRealDateKey', () => {
  it.each([['20260510'], ['20240229'], ['20261231']])('accepts the real day %s', (key) => expect(isRealDateKey(key)).toBe(true));
  it.each([['20260230'], ['20250229'], ['20261301'], ['20260100'], ['2026051'], ['202605100'], ['2026-05-10'], ['abcdefgh'], ['']])(
    'refuses %j',
    (key) => expect(isRealDateKey(key)).toBe(false),
  );
});

describe('groupTournaments', () => {
  const cities = (groups: ReturnType<typeof groupTournaments>) => groups.map((g) => g.city);

  it('keeps the tournaments of the city and the ones that name it in the title, whatever the case', () => {
    for (const text of ['barranquilla', 'Barranquilla', 'BARRANQUILLA']) {
      const groups = groupTournaments(catalog, { text });
      expect(groups.flatMap((g) => g.tournaments.map((t) => t.id)).sort()).toEqual(['t1', 't2', 't4']);
    }
  });

  it('ignores accents in the text and in the data', () => {
    expect(groupTournaments(catalog, { text: 'alamos' }).flatMap((g) => g.tournaments.map((t) => t.id))).toEqual(['t3']);
    expect(groupTournaments(catalog, { text: 'zipaquira' }).flatMap((g) => g.tournaments.map((t) => t.id))).toEqual(['t4']);
    expect(groupTournaments(catalog, { text: 'FESTIVAL' }).flatMap((g) => g.tournaments.map((t) => t.id))).toEqual(['t3']);
  });

  it('keeps only the year asked, and everything without one', () => {
    expect(groupTournaments(catalog, { year: 2025 }).flatMap((g) => g.tournaments.map((t) => t.id)).sort()).toEqual(['t2', 't4']);
    expect(groupTournaments(catalog, { year: null }).flatMap((g) => g.tournaments)).toHaveLength(5);
    expect(groupTournaments(catalog, {}).flatMap((g) => g.tournaments)).toHaveLength(5);
  });

  it('combines the text and the year', () => {
    expect(groupTournaments(catalog, { text: 'barranquilla', year: 2025 }).flatMap((g) => g.tournaments.map((t) => t.id)).sort()).toEqual(['t2', 't4']);
  });

  it('groups by city from A to Z (accents do not move a city) and each group from the most recent to the oldest', () => {
    const groups = groupTournaments(catalog, {});
    expect(cities(groups)).toEqual(['Álamos', 'Barranquilla', 'Cartagena', 'Zipaquirá']);
    expect(groups[1].tournaments.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('puts two spellings of one city in the same group', () => {
    const groups = groupTournaments([...catalog, entry({ id: 't6', dateKey: '20261001', name: 'Otro', city: 'BARRANQUILLA' })], {});
    expect(groups.find((g) => g.city === 'Barranquilla')?.tournaments.map((t) => t.id)).toEqual(['t6', 't1', 't2']);
  });

  it('is empty when nothing matches', () => {
    expect(groupTournaments(catalog, { text: 'nada' })).toEqual([]);
  });
});

describe('createInMemoryTournamentCatalogRepository', () => {
  it('lists what it was given', async () => {
    const repository: TournamentCatalogRepository = createInMemoryTournamentCatalogRepository(catalog);
    expect(await repository.list()).toEqual(catalog);
  });

  it('never offers a tournament whose date key is not a real day, and shows a source address only when it is https', async () => {
    const repository = createInMemoryTournamentCatalogRepository([
      entry({ id: 'bad-day', dateKey: '20260230', name: 'Imposible', city: 'Ciudad' }),
      entry({ id: 'http', dateKey: '20260101', name: 'Sin cifrar', city: 'Ciudad', sourceUrl: 'http://example.test/torneo' }),
      entry({ id: 'script', dateKey: '20260102', name: 'Script', city: 'Ciudad', sourceUrl: 'javascript:alert(1)' }),
      entry({ id: 'ok', dateKey: '20260103', name: 'Bien', city: 'Ciudad', sourceUrl: 'https://example.test/torneo' }),
    ]);
    const listed = await repository.list();
    expect(listed.map((t) => t.id)).toEqual(['http', 'script', 'ok']);
    expect(listed.map((t) => t.sourceUrl)).toEqual([null, null, 'https://example.test/torneo']);
  });
});

describe('createPowerSyncTournamentCatalogRepository', () => {
  function createPowerSync(rows: Record<string, string | number | null>[]): TournamentCatalogRepository {
    const store = createStore();
    removeStore = store.remove;
    const seed = new DatabaseSync(store.path);
    seed.exec(`CREATE TABLE results_import_tournaments (id TEXT PRIMARY KEY, organization_id TEXT, year INTEGER, date_key TEXT, name TEXT, city TEXT,
      discipline TEXT, course TEXT, source_url TEXT, refreshed_at TEXT);`);
    for (const r of rows) {
      seed
        .prepare('INSERT INTO results_import_tournaments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(r.id, r.organization_id, r.year, r.date_key, r.name, r.city, r.discipline, r.course, r.source_url, r.refreshed_at);
    }
    seed.close();
    mockDb = openDatabase(store.path);
    return createPowerSyncTournamentCatalogRepository();
  }

  const row = (t: TournamentCatalogEntry) => ({
    id: t.id,
    organization_id: t.organizationId,
    year: t.year,
    date_key: t.dateKey,
    name: t.name,
    city: t.city,
    discipline: t.discipline,
    course: t.course,
    source_url: t.sourceUrl,
    refreshed_at: t.refreshedAt,
  });

  it('reads the rows of the results_import_tournaments stream and answers the same entries as the fake', async () => {
    const powerSync = createPowerSync(catalog.map(row));
    const fake = createInMemoryTournamentCatalogRepository(catalog);
    const byId = (a: TournamentCatalogEntry, b: TournamentCatalogEntry) => a.id.localeCompare(b.id);
    expect((await powerSync.list()).sort(byId)).toEqual((await fake.list()).sort(byId));
  });

  it('applies the same rules as the fake: no impossible day, no source address that is not https', async () => {
    const powerSync = createPowerSync([
      row(entry({ id: 'bad-day', dateKey: '20260230', name: 'Imposible', city: 'Ciudad' })),
      row(entry({ id: 'http', dateKey: '20260101', name: 'Sin cifrar', city: 'Ciudad', sourceUrl: 'http://example.test/torneo' })),
    ]);
    const listed = await powerSync.list();
    expect(listed.map((t) => [t.id, t.sourceUrl])).toEqual([['http', null]]);
  });

  it('lists nothing before the first sync', async () => {
    expect(await createPowerSync([]).list()).toEqual([]);
  });
});
