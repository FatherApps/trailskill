import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import {
  cleanPrivateDetails,
  createInMemoryPrivateDetailsRepository,
  createPowerSyncPrivateDetailsRepository,
  isValidBirthDate,
  MIN_BIRTH_DATE,
  todayLocal,
} from '../data/athletePrivateDetails';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync/db', () => ({
  get db() {
    return mockDb;
  },
}));
// The index of core/sync loads an ESM-only package; the writes themselves are the real ones, over the fake database.
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
  writeBatch: (...args: unknown[]) => (jest.requireActual('../../../core/sync/writes') as typeof import('../../../core/sync/writes')).writeBatch(...(args as [never])),
}));

// Synthetic data only. The clock is the phone's LOCAL one: new Date(y, m, d, h, min) is local time, never UTC.
afterEach(() => jest.useRealTimers());

describe('todayLocal', () => {
  it('is the date on the phone, even late in the evening (when UTC is already tomorrow in Colombia)', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 21, 23, 59, 59));
    expect(todayLocal()).toBe('2026-11-21');
    jest.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
    expect(todayLocal()).toBe('2026-01-01');
  });
});

describe('isValidBirthDate', () => {
  const today = '2026-11-21';

  it('accepts both edges: today and 1900-01-01', () => {
    expect(isValidBirthDate(today, today)).toBe(true);
    expect(isValidBirthDate(MIN_BIRTH_DATE, today)).toBe(true);
    expect(MIN_BIRTH_DATE).toBe('1900-01-01');
  });

  it('refuses the day after today and the day before 1900-01-01', () => {
    expect(isValidBirthDate('2026-11-22', today)).toBe(false);
    expect(isValidBirthDate('1899-12-31', today)).toBe(false);
  });

  it('refuses text that is not a real calendar date', () => {
    for (const bad of ['', '2014-5-3', '2014/05/03', '03-05-2014', '2014-02-30', '2014-13-01', '2014-00-10', '2015-02-29', '20140503']) {
      expect(isValidBirthDate(bad, today)).toBe(false);
    }
    expect(isValidBirthDate('2016-02-29', today)).toBe(true);
  });
});

describe('cleanPrivateDetails', () => {
  const today = '2026-11-21';

  it('keeps a valid date and gender, trimming the date, and turns an empty answer into null', () => {
    expect(cleanPrivateDetails({ birthDate: ' 2014-05-03 ', gender: 'F' }, today)).toEqual({ birthDate: '2014-05-03', gender: 'F' });
    expect(cleanPrivateDetails({ birthDate: '', gender: null }, today)).toEqual({ birthDate: null, gender: null });
  });

  it('throws for a future date, a date before 1900 and a gender the server would refuse', () => {
    expect(() => cleanPrivateDetails({ birthDate: '2026-11-22', gender: null }, today)).toThrow('birth date');
    expect(() => cleanPrivateDetails({ birthDate: '1899-12-31', gender: null }, today)).toThrow('birth date');
    expect(() => cleanPrivateDetails({ birthDate: null, gender: 'X' as never }, today)).toThrow('gender');
  });
});

describe('in-memory private details repository', () => {
  it('stores by athlete id, answers null for an athlete with nothing, and refuses a future date', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 21, 12, 0));
    const repository = createInMemoryPrivateDetailsRepository();
    expect(await repository.get('a1')).toBeNull();

    await repository.save('a1', { birthDate: '2014-05-03', gender: 'undisclosed' });
    expect(await repository.get('a1')).toEqual(expect.objectContaining({ birthDate: '2014-05-03', gender: 'undisclosed' }));
    expect(await repository.get('a2')).toBeNull();

    await expect(repository.save('a1', { birthDate: '2026-11-22', gender: 'F' })).rejects.toThrow('birth date');
    expect(await repository.get('a1')).toEqual(expect.objectContaining({ birthDate: '2014-05-03' }));
  });
});

describe('PowerSync private details repository (issue 1367)', () => {
  let removeStore: (() => void) | undefined;
  beforeEach(async () => {
    const store = createStore();
    removeStore = store.remove;
    mockDb = openDatabase(store.path);
    // The shared fake only creates the tables the sync tests use; this one is the device-side shape of athlete_private_details.
    await mockDb.writeTransaction((tx) =>
      tx.execute('CREATE TABLE athlete_private_details (id TEXT PRIMARY KEY, athlete_id TEXT, birth_date TEXT, gender TEXT, updated_at TEXT)'),
    );
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(new Date(2026, 10, 21, 23, 30));
  });
  afterEach(() => {
    removeStore?.();
    removeStore = undefined;
  });

  const rows = () => mockDb.getAll<{ id: string; athlete_id: string; birth_date: string | null; gender: string | null }>('SELECT id, athlete_id, birth_date, gender FROM athlete_private_details');

  it('has nothing for an athlete that has no row', async () => {
    expect(await createPowerSyncPrivateDetailsRepository().get('a1')).toBeNull();
  });

  it('saves offline into the device, queues the row for upload and reads it back by athlete id', async () => {
    const repository = createPowerSyncPrivateDetailsRepository();
    const id = await repository.save('a1', { birthDate: '2014-05-03', gender: 'F' });

    expect(rows()).toEqual([{ id, athlete_id: 'a1', birth_date: '2014-05-03', gender: 'F' }]);
    expect(mockDb.getAll('SELECT table_name, record_id FROM pending_writes')).toEqual([{ table_name: 'athlete_private_details', record_id: id }]);
    expect(await repository.get('a1')).toEqual({ id, birthDate: '2014-05-03', gender: 'F' });
  });

  it('writes to the row it finds by athlete_id, whatever its own id is, and never creates a second one', async () => {
    await mockDb.writeTransaction((tx) =>
      tx.execute("INSERT INTO athlete_private_details (id, athlete_id, birth_date, gender) VALUES ('row-9', 'a1', '2014-05-03', 'F')"),
    );
    const repository = createPowerSyncPrivateDetailsRepository();
    // Another athlete's row whose id is this athlete's id stays untouched.
    await mockDb.writeTransaction((tx) =>
      tx.execute("INSERT INTO athlete_private_details (id, athlete_id, birth_date, gender) VALUES ('a1', 'a2', '2012-01-01', 'M')"),
    );

    const id = await repository.save('a1', { birthDate: '2014-06-04', gender: 'M' });

    expect(id).toBe('row-9');
    expect(rows()).toEqual([
      { id: 'row-9', athlete_id: 'a1', birth_date: '2014-06-04', gender: 'M' },
      { id: 'a1', athlete_id: 'a2', birth_date: '2012-01-01', gender: 'M' },
    ]);
    expect(await repository.get('a1')).toEqual({ id: 'row-9', birthDate: '2014-06-04', gender: 'M' });
    expect(await repository.get('a2')).toEqual({ id: 'a1', birthDate: '2012-01-01', gender: 'M' });
  });

  it('accepts today and 1900-01-01 on the phone clock, and refuses the next day and 1899-12-31, writing nothing', async () => {
    const repository = createPowerSyncPrivateDetailsRepository();

    // 23:30 local on 2026-11-21: in UTC-5 that is already 2026-11-22 in UTC, which must not be accepted.
    await expect(repository.save('a1', { birthDate: '2026-11-22', gender: null })).rejects.toThrow('birth date');
    await expect(repository.save('a1', { birthDate: '1899-12-31', gender: null })).rejects.toThrow('birth date');
    expect(rows()).toEqual([]);
    expect(mockDb.getAll('SELECT * FROM pending_writes')).toEqual([]);

    await repository.save('a1', { birthDate: '2026-11-21', gender: null });
    await repository.save('a1', { birthDate: '1900-01-01', gender: null });
    expect(rows()).toEqual([expect.objectContaining({ athlete_id: 'a1', birth_date: '1900-01-01', gender: null })]);
  });

  it('clears a value with null, and refuses a gender the server would refuse', async () => {
    const repository = createPowerSyncPrivateDetailsRepository();
    await repository.save('a1', { birthDate: '2014-05-03', gender: 'F' });
    await repository.save('a1', { birthDate: null, gender: null });
    expect(rows()).toEqual([expect.objectContaining({ birth_date: null, gender: null })]);

    await expect(repository.save('a1', { birthDate: null, gender: 'other' as never })).rejects.toThrow('gender');
  });
});
