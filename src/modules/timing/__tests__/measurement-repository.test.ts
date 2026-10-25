import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  CompletedMeasurementTimeError,
  createInMemoryMeasurementRepository,
  createPowerSyncMeasurementRepository,
  InvalidMeasurementTimeError,
  type Measurement,
  type MeasurementRepository,
} from '..';

// @powersync/react-native ships ESM only and Jest cannot load it, so the real database is replaced by
// the SQLite-backed fake. The core/sync barrel is mocked for the same reason (it pulls in the connector
// and Supabase client); `writeRecord` and `editRecord` stay the real ones, running over the fake database.
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
  writeRecord: jest.requireActual('../../../core/sync/writes').writeRecord,
  editRecord: jest.requireActual('../../../core/sync/writes').editRecord,
}));

function arrival(id: string, seriesId: string, position: number, athleteId: string | null): Measurement {
  return {
    id,
    kind: 'repetition',
    athleteId,
    seriesId,
    arrivalPosition: position,
    hundredths: 3000 + position,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'training',
    source: 'screen_button',
    createdBy: 'coach-a',
    deviceId: 'device-a',
    capturedAt: '2026-10-24T08:00:00Z',
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
  };
}

const MEASUREMENTS_TABLE = `CREATE TABLE measurements (
  id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, device_id TEXT, kind TEXT, athlete_id TEXT,
  series_id TEXT, arrival_position INTEGER, hundredths INTEGER, stroke TEXT, distance TEXT, pool TEXT,
  session_type TEXT, source TEXT, captured_at TEXT, parent_id TEXT, version INTEGER, base_version INTEGER,
  edited_by TEXT, edited_at TEXT, edited_device_id TEXT, edit_reason TEXT
)`;

let removeStore: (() => void) | undefined;
afterEach(() => {
  removeStore?.();
  removeStore = undefined;
});

const factories: [string, () => MeasurementRepository][] = [
  ['in-memory', createInMemoryMeasurementRepository],
  [
    'PowerSync',
    () => {
      const store = createStore();
      removeStore = store.remove;
      const seed = new DatabaseSync(store.path);
      seed.exec(MEASUREMENTS_TABLE);
      seed.close();
      mockDb = openDatabase(store.path);
      return createPowerSyncMeasurementRepository();
    },
  ],
];

describe.each(factories)('%s measurement repository', (_name, create) => {
  it('lists every arrival of a series by position, unassigned ones included', async () => {
    const repository = create();
    await repository.add(arrival('m3', 'S', 3, 'athlete-2'));
    await repository.add(arrival('m2', 'S', 2, null));
    await repository.add(arrival('m1', 'S', 1, 'athlete-1'));
    await repository.add(arrival('other', 'T', 1, 'athlete-1'));

    const listed = await repository.listBySeries('S');

    expect(listed.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(listed[1]?.athleteId).toBeNull();
  });

  it('reads a missing time back as null, never 0', async () => {
    const repository = create();
    await repository.add({ ...arrival('m1', 'S', 1, 'athlete-1'), hundredths: null });

    const [listed] = await repository.listBySeries('S');

    expect(listed?.hundredths).toBeNull();
  });

  describe('listByAthleteEvent', () => {
    const event = { stroke: 'FR', distance: '50m', pool: 'SCM' } as const;
    const one = (id: string, over: Partial<Measurement> = {}) =>
      ({ ...arrival(id, 'S', 1, 'athlete-1'), ...over }) as Measurement;

    it('lists only that athlete in that stroke, distance and pool', async () => {
      const repository = create();
      await repository.add(one('mine'));
      await repository.add(one('other-athlete', { athleteId: 'athlete-2' }));
      await repository.add(one('other-stroke', { stroke: 'BK' }));
      await repository.add(one('other-distance', { distance: '100m' }));
      await repository.add(one('other-pool', { pool: 'LCM' }));

      const listed = await repository.listByAthleteEvent('athlete-1', event);

      expect(listed.map((m) => m.id)).toEqual(['mine']);
    });

    it('returns every kind, splits, series totals and completed ones included', async () => {
      const repository = create();
      await repository.add(one('race', { kind: 'race' }));
      await repository.add(one('split', { kind: 'split' }));
      await repository.add(one('total', { kind: 'series_total' }));
      await repository.add(one('done', { kind: 'completed', hundredths: null }));

      const listed = await repository.listByAthleteEvent('athlete-1', event);

      expect(listed.map((m) => m.kind).sort()).toEqual(['completed', 'race', 'series_total', 'split']);
    });

    it('orders newest first, by id when captured at the same time', async () => {
      const repository = create();
      await repository.add(one('old', { capturedAt: '2026-01-01T08:00:00Z' }));
      await repository.add(one('b', { capturedAt: '2026-03-01T08:00:00Z' }));
      await repository.add(one('a', { capturedAt: '2026-03-01T08:00:00Z' }));
      await repository.add(one('mid', { capturedAt: '2026-02-01T08:00:00Z' }));

      const listed = await repository.listByAthleteEvent('athlete-1', event);

      expect(listed.map((m) => m.id)).toEqual(['a', 'b', 'mid', 'old']);
    });

    it('reads a missing time back as null', async () => {
      const repository = create();
      await repository.add(one('m1', { hundredths: null }));

      const [listed] = await repository.listByAthleteEvent('athlete-1', event);

      expect(listed?.hundredths).toBeNull();
    });
  });

  describe('edit', () => {
    const meta = { deviceId: 'device-b' };

    it('changes only the time and leaves the rest of the measurement as it was', async () => {
      const repository = create();
      const original = arrival('m1', 'S', 1, 'athlete-1');
      await repository.add(original);

      await repository.edit('m1', { hundredths: 2950 }, meta);

      await expect(repository.listBySeries('S')).resolves.toEqual([{ ...original, hundredths: 2950 }]);
    });

    it('changes only the athlete, so an arrival can be given a name', async () => {
      const repository = create();
      const original = arrival('m1', 'S', 1, null);
      await repository.add(original);

      await repository.edit('m1', { athleteId: 'athlete-2' }, meta);

      await expect(repository.listBySeries('S')).resolves.toEqual([{ ...original, athleteId: 'athlete-2' }]);
    });

    it('clears a time to null, never 0', async () => {
      const repository = create();
      await repository.add(arrival('m1', 'S', 1, 'athlete-1'));

      await repository.edit('m1', { hundredths: null }, meta);

      expect((await repository.listBySeries('S'))[0]?.hundredths).toBeNull();
    });

    it('keeps the version until the server bumps it, and shows the reason of the edit', async () => {
      const repository = create();
      await repository.add(arrival('m1', 'S', 1, 'athlete-1'));

      await repository.edit('m1', { hundredths: 2950 }, { deviceId: 'device-b', editReason: 'typo' });

      expect((await repository.listBySeries('S'))[0]).toMatchObject({ version: 1, editReason: 'typo' });
    });

    describe('a completed measurement has no time', () => {
      const completed = () => ({ ...arrival('c1', 'S', 1, 'athlete-1'), kind: 'completed', hundredths: null }) as Measurement;

      it('rejects a time and leaves the measurement as it was', async () => {
        const repository = create();
        await repository.add(completed());

        await expect(repository.edit('c1', { hundredths: 2950 }, meta)).rejects.toBeInstanceOf(CompletedMeasurementTimeError);

        await expect(repository.listBySeries('S')).resolves.toEqual([completed()]);
      });

      it('still lets the athlete change', async () => {
        const repository = create();
        await repository.add(completed());

        await repository.edit('c1', { athleteId: 'athlete-2' }, meta);

        expect((await repository.listBySeries('S'))[0]).toMatchObject({ athleteId: 'athlete-2', hundredths: null });
      });

      it('accepts clearing the time, which it already lacks', async () => {
        const repository = create();
        await repository.add(completed());

        await expect(repository.edit('c1', { hundredths: null }, meta)).resolves.toBeUndefined();
      });
    });

    it.each([0, -5])('rejects a time of %s: a missing time is null, never 0', async (hundredths) => {
      const repository = create();
      const original = arrival('m1', 'S', 1, 'athlete-1');
      await repository.add(original);

      await expect(repository.edit('m1', { hundredths }, meta)).rejects.toBeInstanceOf(InvalidMeasurementTimeError);

      await expect(repository.listBySeries('S')).resolves.toEqual([original]);
    });

    it('rejects a measurement that is not stored', async () => {
      const repository = create();

      await expect(repository.edit('missing', { hundredths: 2950 }, meta)).rejects.toThrow('missing');
    });
  });

  it('reads back exactly what was added', async () => {
    const repository = create();
    const measurement = arrival('m1', 'S', 1, 'athlete-1');
    await repository.add(measurement);

    await expect(repository.listBySeries('S')).resolves.toEqual([measurement]);
  });
});

describe('PowerSync measurement repository', () => {
  it('queues the added measurement for upload', async () => {
    const repository = factories[1]![1]();
    await repository.add(arrival('m1', 'S', 1, null));

    expect(mockDb.getAll('SELECT table_name, record_id FROM pending_writes')).toEqual([
      { table_name: 'measurements', record_id: 'm1' },
    ]);
  });
});

describe('PowerSync measurement repository edits', () => {
  const rowOf = (id: string) =>
    mockDb.getAll<Record<string, unknown>>('SELECT * FROM measurements WHERE id = ?', [id])[0];
  const pendingCount = () => mockDb.getAll('SELECT 1 FROM pending_writes').length;

  async function stored(version: number) {
    const repository = factories[1]![1]();
    await repository.add(arrival('m1', 'S', 1, 'athlete-1'));
    // As if the server row, at this version, had synced down.
    await mockDb.writeTransaction((tx) => tx.execute('UPDATE measurements SET version = ? WHERE id = ?', [version, 'm1']));
    return repository;
  }

  it('writes the version it was based on and the device, and queues the edit for upload', async () => {
    const repository = await stored(4);
    const pendingBefore = pendingCount();

    await repository.edit('m1', { hundredths: 2950 }, { deviceId: 'device-b', editReason: 'typo' });

    expect(rowOf('m1')).toMatchObject({ hundredths: 2950, version: 4, base_version: 4, edited_device_id: 'device-b', edit_reason: 'typo' });
    // A synced row has nothing to reset: one op.
    expect(pendingCount()).toBe(pendingBefore + 1);
  });

  it('edits a measurement that has not synced yet as based on version 1', async () => {
    const repository = factories[1]![1]();
    await repository.add(arrival('m1', 'S', 1, 'athlete-1'));

    await repository.edit('m1', { hundredths: 2950 }, { deviceId: 'device-b' });

    expect(rowOf('m1')).toMatchObject({ version: null, base_version: 1 });
  });

  it('sends no reason as null, so a stale reason is never carried over', async () => {
    const repository = await stored(1);
    await repository.edit('m1', { hundredths: 2950 }, { deviceId: 'device-b', editReason: 'typo' });

    await repository.edit('m1', { hundredths: 2900 }, { deviceId: 'device-b' });

    expect(rowOf('m1')).toMatchObject({ edit_reason: null, edited_device_id: 'device-b' });
  });

  it('queues nothing when an edit is rejected', async () => {
    const repository = factories[1]![1]();
    await repository.add({ ...arrival('c1', 'S', 1, 'athlete-1'), kind: 'completed', hundredths: null } as Measurement);
    await repository.add(arrival('m1', 'S', 2, 'athlete-1'));
    const pendingBefore = pendingCount();

    await expect(repository.edit('c1', { hundredths: 2950 }, { deviceId: 'device-b' })).rejects.toBeInstanceOf(CompletedMeasurementTimeError);
    await expect(repository.edit('m1', { hundredths: 0 }, { deviceId: 'device-b' })).rejects.toBeInstanceOf(InvalidMeasurementTimeError);

    expect(pendingCount()).toBe(pendingBefore);
  });

  it('never writes the columns the server owns', async () => {
    const repository = await stored(2);

    await repository.edit('m1', { athleteId: 'athlete-2' }, { deviceId: 'device-b' });

    expect(rowOf('m1')).toMatchObject({ athlete_id: 'athlete-2', hundredths: 3001, edited_by: null, edited_at: null, version: 2 });
  });
});
