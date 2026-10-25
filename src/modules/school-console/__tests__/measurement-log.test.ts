import { createInMemorySchoolAthleteRepository } from '../../athletes';
import { createInMemoryMeasurementRepository, type Measurement } from '../../timing';
import { toEntry } from '../screens/MeasurementsSection';
import {
  createMeasurementLogRepository,
  filterMeasurements,
  measurementFilterOptions,
  type LogMeasurement,
} from '../data/measurementLog';

// Importing the module indexes loads the PowerSync repositories, which need the sync layer mocked.
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
function measurement(id: string, athleteId: string | null, over: Partial<Measurement> = {}): Measurement {
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
    createdBy: 'aaaaaaaa-coach-a',
    schoolId: 's1',
    deviceId: 'bbbbbbbb-device-a',
    capturedAt: '2026-10-24T13:30:00.000Z',
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
    ...over,
  } as Measurement;
}

const athleteRows = {
  athletes: [
    { id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' },
    { id: 'a2', firstName: 'Mateo', lastName: 'Castro' },
    { id: 'a3', firstName: 'Otto', lastName: 'Elsewhere' },
  ],
  athleteSchools: [
    { athleteId: 'a1', schoolId: 's1', categoryId: 'c1' },
    { athleteId: 'a2', schoolId: 's1', categoryId: 'c2' },
    { athleteId: 'a3', schoolId: 's2', categoryId: 'c1' },
  ],
  athleteGroups: [],
};

async function repositoryWith(measurements: Measurement[]) {
  const store = createInMemoryMeasurementRepository();
  for (const m of measurements) await store.add(m);
  return { store, repository: createMeasurementLogRepository({ athletes: createInMemorySchoolAthleteRepository(athleteRows), measurements: store }) };
}

describe('createMeasurementLogRepository', () => {
  it('lists the measurements of the school newest first, without those of another school or of an unassigned arrival', async () => {
    const { repository } = await repositoryWith([
      measurement('m1', 'a1', { capturedAt: '2026-10-24T13:30:00.000Z' }),
      measurement('m2', 'a2', { capturedAt: '2026-10-24T14:00:00.000Z' }),
      // Another school: the athlete and the measurement both belong to s2.
      measurement('m3', 'a3', { schoolId: 's2', capturedAt: '2026-10-25T10:00:00.000Z' }),
      // An athlete of s1 measured for another school stays out too.
      measurement('m4', 'a1', { schoolId: 's2', capturedAt: '2026-10-25T11:00:00.000Z' }),
      measurement('m5', null, { seriesId: 'series-1', capturedAt: '2026-10-25T12:00:00.000Z' }),
    ]);

    expect((await repository.list('s1')).map((m) => m.id)).toEqual(['m2', 'm1']);
  });

  it('breaks a tie by id and leaves out a discarded measurement', async () => {
    const { store, repository } = await repositoryWith([measurement('m2', 'a1'), measurement('m1', 'a1'), measurement('m3', 'a1')]);
    await store.discard('m3', 'coach-a');

    expect((await repository.list('s1')).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('carries the athlete, the category, the author and the device, and keeps a missing time as null, never 0', async () => {
    const { repository } = await repositoryWith([
      measurement('m1', 'a1', { hundredths: null }),
      measurement('m2', 'a2', { kind: 'completed', hundredths: null, capturedAt: '2026-10-23T13:30:00.000Z' }),
    ]);

    expect(await repository.list('s1')).toMatchObject([
      { id: 'm1', athlete: 'Lucía Ramírez', initials: 'LR', categoryId: 'c1', authorId: 'aaaaaaaa-coach-a', deviceId: 'bbbbbbbb-device-a', time: null, kind: 'race' },
      { id: 'm2', athlete: 'Mateo Castro', categoryId: 'c2', time: null, kind: 'completed' },
    ]);
  });
});

const log = (id: string, over: Partial<LogMeasurement> = {}): LogMeasurement => ({
  id,
  athleteId: 'a1',
  athlete: 'Lucía Ramírez',
  initials: 'LR',
  color: 'athlete-1',
  categoryId: 'c1',
  stroke: 'FR',
  distance: '50m',
  kind: 'race',
  time: 3482,
  authorId: 'aaaaaaaa-coach-a',
  deviceId: 'bbbbbbbb-device-a',
  capturedAt: '2026-10-24T13:30:00.000Z',
  ...over,
});

describe('filterMeasurements', () => {
  const now = new Date(2026, 9, 25, 12, 0);
  const at = (day: number) => new Date(2026, 9, day, 9, 0).toISOString();
  const list = [
    log('m1', { athlete: 'Lucía Ramírez', capturedAt: at(25) }),
    log('m2', { athleteId: 'a2', athlete: 'Mateo Castro', categoryId: 'c2', stroke: 'BK', authorId: 'cccccccc-coach-b', capturedAt: at(22) }),
    log('m3', { athleteId: 'a2', athlete: 'Mateo Castro', categoryId: 'c2', distance: '100m', capturedAt: at(1) }),
  ];
  const ids = (query: string, filters: Parameters<typeof filterMeasurements>[2]) => filterMeasurements(list, query, filters, now).map((m) => m.id);

  it('keeps everything without a query or a filter', () => {
    expect(ids('', {})).toEqual(['m1', 'm2', 'm3']);
  });

  it('searches the athlete by name, ignoring case and accents', () => {
    expect(ids('  lucia ', {})).toEqual(['m1']);
    expect(ids('castro', {})).toEqual(['m2', 'm3']);
  });

  it.each([
    ['category', 'c2', ['m2', 'm3']],
    ['event', 'FR-50m', ['m1']],
    ['event', 'FR-100m', ['m3']],
    ['coach', 'cccccccc-coach-b', ['m2']],
    ['range', 'today', ['m1']],
    ['range', '7d', ['m1', 'm2']],
    ['range', '30d', ['m1', 'm2', 'm3']],
  ] as const)('filters by %s = %s', (id, value, expected) => {
    expect(ids('', { [id]: value })).toEqual(expected);
  });

  it('combines the query and the filters with AND', () => {
    expect(ids('mateo', { range: '7d' })).toEqual(['m2']);
    expect(ids('mateo', { category: 'c2', event: 'BK-50m', coach: 'cccccccc-coach-b' })).toEqual(['m2']);
    expect(ids('lucia', { category: 'c2' })).toEqual([]);
  });
});

describe('measurementFilterOptions', () => {
  it('offers only the values present, with the ranges always available', () => {
    const options = measurementFilterOptions([log('m1'), log('m2', { stroke: 'BK', categoryId: 'c2', authorId: 'cccccccc-coach-b' })], new Map([['c1', 'Categoría A']]));

    expect(options.event.map((o) => o.id)).toEqual(['FR-50m', 'BK-50m']);
    expect(options.coach.map((o) => o.label)).toEqual(['aaaaaaaa', 'cccccccc']);
    expect(options.category).toEqual([{ id: 'c1', label: 'Categoría A' }]);
    expect(options.range.map((o) => o.id)).toEqual(['today', '7d', '30d']);
  });
});

describe('toEntry', () => {
  it('shows a missing time as null and the author and device as short ids, with the sync state', () => {
    const entry = toEntry(log('m1', { time: null, capturedAt: new Date(2026, 9, 24, 8, 30).toISOString() }), 'needs_review');

    expect(entry).toMatchObject({
      id: 'm1',
      event: 'Libre 50',
      kind: 'Carrera',
      sync: 'needs_review',
      versions: [{ time: null, author: 'aaaaaaaa', device: 'bbbbbbbb', at: '2026-10-24T08:30' }],
    });
  });
});
