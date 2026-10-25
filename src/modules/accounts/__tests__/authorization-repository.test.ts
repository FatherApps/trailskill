import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  createInMemoryAuthorizationRepository,
  createPowerSyncAuthorizationRepository,
  type AuthorizationRepository,
  type AuthorizationText,
} from '../data/authorizations';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync/db', () => ({
  get db() {
    return mockDb;
  },
}));
jest.mock('../../../core/sync', () => {
  const writes = jest.requireActual('../../../core/sync/writes');
  return {
    get db() {
      return mockDb;
    },
    writeRecord: writes.writeRecord,
    writeBatch: writes.writeBatch,
  };
});

// Synthetic data only.
const texts: AuthorizationText[] = [
  { id: 't-record-1', purpose: 'record_times', version: 1, body: 'Synthetic record text v1' },
  { id: 't-record-2', purpose: 'record_times', version: 2, body: 'Synthetic record text v2' },
  { id: 't-import-1', purpose: 'import_official_results', version: 1, body: 'Synthetic import text v1' },
  { id: 't-share-1', purpose: 'share_results_with_school', version: 1, body: 'Synthetic share text v1' },
];
const recordV2 = texts[1]!;
const now = new Date('2026-10-25T12:00:00.000Z');
const later = new Date('2026-10-25T13:00:00.000Z');

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

function createPowerSync(): AuthorizationRepository {
  const store = createStore();
  removeStore = store.remove;
  const seed = new DatabaseSync(store.path);
  seed.exec(`
    CREATE TABLE authorization_texts (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, purpose TEXT, version INTEGER, language TEXT, body TEXT);
    CREATE TABLE authorizations (
      id TEXT PRIMARY KEY, created_at TEXT, user_id TEXT, athlete_id TEXT, purpose TEXT, text_id TEXT, accepted_at TEXT,
      received_at TEXT, withdrawn_at TEXT, withdrawn_by TEXT, withdrawal_received_at TEXT
    );
    CREATE TABLE authorization_status (id TEXT PRIMARY KEY, athlete_id TEXT, purpose TEXT, is_granted INTEGER, updated_at TEXT);
  `);
  texts.forEach((text) =>
    seed
      .prepare("INSERT INTO authorization_texts (id, purpose, version, language, body) VALUES (?, ?, ?, 'es-CO', ?)")
      .run(text.id, text.purpose, text.version, text.body),
  );
  // Another language must never be offered for es-CO.
  seed.prepare("INSERT INTO authorization_texts (id, purpose, version, language, body) VALUES ('t-en', 'record_times', 3, 'en', 'x')").run();
  seed.close();
  mockDb = openDatabase(store.path);
  return createPowerSyncAuthorizationRepository();
}

const factories: [string, () => AuthorizationRepository][] = [
  ['in-memory', () => createInMemoryAuthorizationRepository(texts)],
  ['PowerSync', createPowerSync],
];

describe.each(factories)('%s authorization repository', (_name, create) => {
  it('offers the latest version of each purpose text', async () => {
    const current = await create().listCurrentTexts('es-CO');
    expect(current.map((text) => text.id)).toEqual(['t-record-2', 't-import-1', 't-share-1']);
  });

  it('accepting one purpose stores exactly one row, with all its evidence', async () => {
    const repository = create();
    await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: recordV2 }, now);

    const rows = await repository.listAuthorizations('guardian-1', ['a1']);
    expect(rows).toEqual([
      {
        id: expect.any(String),
        userId: 'guardian-1',
        athleteId: 'a1',
        purpose: 'record_times',
        textId: 't-record-2',
        textVersion: 2,
        textBody: 'Synthetic record text v2',
        acceptedAt: now.toISOString(),
        withdrawnAt: null,
      },
    ]);
    expect(await repository.isInForce('a1', 'record_times')).toBe(true);
    expect(await repository.isInForce('a1', 'import_official_results')).toBe(false);
    expect(await repository.isInForce('a2', 'record_times')).toBe(false);
  });

  it('withdrawing records the withdrawal, keeps the evidence, and the authorization is no longer in force', async () => {
    const repository = create();
    const id = await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: recordV2 }, now);
    const [before] = await repository.listAuthorizations('guardian-1', ['a1']);

    await repository.withdraw(id, later);

    const [after] = await repository.listAuthorizations('guardian-1', ['a1']);
    expect(after).toEqual({ ...before, withdrawnAt: later.toISOString() });
    expect(await repository.isInForce('a1', 'record_times')).toBe(false);
  });

  it('a second withdrawal keeps the first one', async () => {
    const repository = create();
    const id = await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: recordV2 }, now);
    await repository.withdraw(id, now);
    await repository.withdraw(id, later);
    const [row] = await repository.listAuthorizations('guardian-1', ['a1']);
    expect(row?.withdrawnAt).toBe(now.toISOString());
  });

  it('rejects withdrawing an authorization that is not on the device', async () => {
    await expect(create().withdraw('missing', now)).rejects.toThrow();
  });

  it('an acceptance after a withdrawal is in force again', async () => {
    const repository = create();
    const first = await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: recordV2 }, now);
    await repository.withdraw(first, now);
    await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: recordV2 }, later);
    expect(await repository.isInForce('a1', 'record_times')).toBe(true);
  });

  it('lists only the adult’s own authorizations for the given athletes', async () => {
    const repository = create();
    await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: recordV2 }, now);
    await repository.accept({ userId: 'guardian-2', athleteId: 'a1', text: recordV2 }, now);
    await repository.accept({ userId: 'guardian-1', athleteId: 'a2', text: recordV2 }, now);
    const rows = await repository.listAuthorizations('guardian-1', ['a1']);
    expect(rows.map((row) => [row.userId, row.athleteId])).toEqual([['guardian-1', 'a1']]);
  });
});

describe('PowerSync authorization whose text is not on the phone yet', () => {
  it('is still listed, without its text, and is still in force', async () => {
    const repository = createPowerSync();
    mockDb.getAll(
      "INSERT INTO authorizations (id, user_id, athlete_id, purpose, text_id, accepted_at) VALUES ('x1', 'guardian-1', 'a1', 'record_times', 't-not-synced', ?)",
      [now.toISOString()],
    );

    expect(await repository.listAuthorizations('guardian-1', ['a1'])).toEqual([
      {
        id: 'x1',
        userId: 'guardian-1',
        athleteId: 'a1',
        purpose: 'record_times',
        textId: 't-not-synced',
        textVersion: null,
        textBody: null,
        acceptedAt: now.toISOString(),
        withdrawnAt: null,
      },
    ]);
    expect(await repository.isInForce('a1', 'record_times')).toBe(true);
  });
});

describe('PowerSync authorization in force', () => {
  function seedStatus(isGranted: boolean, updatedAt: string) {
    mockDb.getAll(
      "INSERT INTO authorization_status (id, athlete_id, purpose, is_granted, updated_at) VALUES ('s1', 'a1', 'record_times', ?, ?)",
      [isGranted ? 1 : 0, updatedAt],
    );
  }

  it('follows the synced status when this adult has no later event', async () => {
    const repository = createPowerSync();
    // A synced timestamp uses a space between date and time.
    seedStatus(true, '2026-10-25 11:00:00.000000Z');
    expect(await repository.isInForce('a1', 'record_times')).toBe(true);
  });

  it('a withdrawal made on this phone wins over an older granted status', async () => {
    const repository = createPowerSync();
    const id = await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: recordV2 }, now);
    seedStatus(true, '2026-10-25 12:30:00.000000Z');
    await repository.withdraw(id, later);
    expect(await repository.isInForce('a1', 'record_times')).toBe(false);
  });

  it('a later withdrawal by another adult, synced as status, wins over this adult’s acceptance', async () => {
    const repository = createPowerSync();
    await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: recordV2 }, now);
    seedStatus(false, '2026-10-25 12:30:00.000000Z');
    expect(await repository.isInForce('a1', 'record_times')).toBe(false);
  });

  it('queues the acceptance and the withdrawal for upload', async () => {
    const repository = createPowerSync();
    const id = await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: recordV2 }, now);
    await repository.withdraw(id, later);
    const pending = mockDb.getAll<{ record_id: string }>("SELECT record_id FROM pending_writes WHERE table_name = 'authorizations'");
    expect(pending).toEqual([{ record_id: id }, { record_id: id }]);
  });
});
