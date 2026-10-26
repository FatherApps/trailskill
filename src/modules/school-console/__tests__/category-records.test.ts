import { createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository, type HistoryMeasurement } from '../../athletes';
import { createCategoryRecordsRepository, selectCategoryRecords } from '../data/categoryRecords';

// Importing the module indexes loads the PowerSync repositories, which need the sync layer mocked.
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
function measurement(id: string, athleteId: string, over: Partial<HistoryMeasurement> = {}): HistoryMeasurement {
  return {
    id,
    kind: 'race',
    athleteId,
    seriesId: null,
    arrivalPosition: null,
    hundredths: 3000,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'training',
    source: 'screen_button',
    createdBy: 'coach-a',
    deviceId: 'device-a',
    capturedAt: '2026-01-01T15:00:00Z',
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
    origin: 'own',
    ...over,
  } as HistoryMeasurement;
}

const names = new Map([
  ['a1', 'Lucía Ramírez'],
  ['a2', 'Mateo Castro'],
]);

describe('selectCategoryRecords', () => {
  it('takes the lowest valid time of each event, with its athlete and date', () => {
    const records = selectCategoryRecords(
      [
        measurement('m1', 'a1', { hundredths: 3482, capturedAt: '2026-01-10T15:00:00Z' }),
        measurement('m2', 'a2', { hundredths: 3391, capturedAt: '2026-02-12T15:00:00Z' }),
        measurement('m3', 'a1', { hundredths: 3600 }),
      ],
      'SCM',
      names,
    );

    expect(records).toEqual([{ stroke: 'FR', distance: '50m', time: 3391, athlete: 'Mateo Castro', date: '2026-02-12' }]);
  });

  it('gives a tie to the first achievement', () => {
    const records = selectCategoryRecords(
      [
        measurement('m1', 'a2', { hundredths: 3391, capturedAt: '2026-03-01T15:00:00Z' }),
        measurement('m2', 'a1', { hundredths: 3391, capturedAt: '2026-02-01T15:00:00Z' }),
      ],
      'SCM',
      names,
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ time: 3391, athlete: 'Lucía Ramírez', date: '2026-02-01' });
  });

  it('never counts a null time, a completed value, or a kind that is not a mark', () => {
    const records = selectCategoryRecords(
      [
        measurement('m1', 'a1', { hundredths: null }),
        measurement('m2', 'a2', { kind: 'completed', hundredths: null }),
        measurement('m3', 'a2', { kind: 'split', hundredths: 1000 }),
        measurement('m4', 'a1', { hundredths: 3700 }),
      ],
      'SCM',
      names,
    );

    expect(records).toEqual([{ stroke: 'FR', distance: '50m', time: 3700, athlete: 'Lucía Ramírez', date: '2026-01-01' }]);
  });

  it('shows an event without a valid time with no time, athlete or date, never 0', () => {
    const records = selectCategoryRecords([measurement('m1', 'a1', { hundredths: null }), measurement('m2', 'a2', { kind: 'completed', hundredths: null })], 'SCM', names);

    expect(records).toEqual([{ stroke: 'FR', distance: '50m', time: null, athlete: null, date: null }]);
  });

  it('keeps the pools apart and orders the events as the sport catalogs do', () => {
    const measurements = [
      measurement('m1', 'a1', { stroke: 'BK', distance: '50m', hundredths: 4100 }),
      measurement('m2', 'a1', { stroke: 'FR', distance: '100m', hundredths: 7000 }),
      measurement('m3', 'a1', { stroke: 'FR', distance: '50m', hundredths: 3300 }),
      measurement('m4', 'a2', { stroke: 'FR', distance: '50m', hundredths: 3000, pool: 'LCM' }),
    ];

    expect(selectCategoryRecords(measurements, 'SCM', names).map((r) => `${r.stroke}-${r.distance}-${r.time}`)).toEqual([
      'FR-50m-3300',
      'FR-100m-7000',
      'BK-50m-4100',
    ]);
    expect(selectCategoryRecords(measurements, 'LCM', names).map((r) => r.time)).toEqual([3000]);
  });

  it('returns nothing without measurements', () => {
    expect(selectCategoryRecords([], 'SCM', names)).toEqual([]);
  });
});

describe('createCategoryRecordsRepository', () => {
  const athleteRows = {
    athletes: [
      { id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' },
      { id: 'a2', firstName: 'Mateo', lastName: 'Castro' },
      { id: 'a3', firstName: 'Nia', lastName: 'Zeta' },
      { id: 'a4', firstName: 'Otto', lastName: 'Elsewhere' },
    ],
    athleteSchools: [
      { athleteId: 'a1', schoolId: 's1', categoryId: 'c1' },
      { athleteId: 'a2', schoolId: 's1', categoryId: 'c1' },
      { athleteId: 'a3', schoolId: 's1', categoryId: 'c2' },
      // Same category id, another school: never counted for s1.
      { athleteId: 'a4', schoolId: 's2', categoryId: 'c1' },
    ],
    athleteGroups: [
      { athleteId: 'a1', groupId: 'g1' },
      { athleteId: 'a2', groupId: 'g2' },
    ],
  };
  const measurements = [
    measurement('m1', 'a1', { hundredths: 3482 }),
    measurement('m2', 'a2', { hundredths: 3391 }),
    measurement('m3', 'a3', { hundredths: 3000 }),
    measurement('m4', 'a4', { hundredths: 2900 }),
    measurement('m5', 'a1', { hundredths: 3100, pool: 'LCM' }),
  ];
  const repository = () =>
    createCategoryRecordsRepository({
      athletes: createInMemorySchoolAthleteRepository(athleteRows),
      history: createInMemoryHistoryRepository(measurements),
    });

  it('lists the best marks of the category in the pool, counting only the athletes of the school', async () => {
    const records = await repository().list({ schoolId: 's1', categoryId: 'c1', pool: 'SCM' });

    expect(records).toEqual([{ stroke: 'FR', distance: '50m', time: 3391, athlete: 'Mateo Castro', date: '2026-01-01' }]);
  });

  it('changes the rows with the pool', async () => {
    const records = await repository().list({ schoolId: 's1', categoryId: 'c1', pool: 'LCM' });

    expect(records).toEqual([{ stroke: 'FR', distance: '50m', time: 3100, athlete: 'Lucía Ramírez', date: '2026-01-01' }]);
  });

  it('filters by training group independently of the category', async () => {
    const records = await repository().list({ schoolId: 's1', categoryId: 'c1', pool: 'SCM', groupId: 'g1' });

    expect(records[0]).toMatchObject({ time: 3482, athlete: 'Lucía Ramírez' });
  });

  it('returns nothing for a category without athletes of the school', async () => {
    expect(await repository().list({ schoolId: 's2', categoryId: 'c2', pool: 'SCM' })).toEqual([]);
  });

  it('exposes only the event, time, athlete name and date', async () => {
    const [record] = await repository().list({ schoolId: 's1', categoryId: 'c1', pool: 'SCM' });

    expect(Object.keys(record).sort()).toEqual(['athlete', 'date', 'distance', 'stroke', 'time']);
  });
});
