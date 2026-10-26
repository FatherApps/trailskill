import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { createInMemorySchoolAthleteRepository, createInMemoryHistoryRepository, type HistoryMeasurement } from '../../athletes';
import { CONSOLE_BEST_EVENT, createConsoleAthletesRepository, type ConsoleAthletesRepository } from '../data/consoleAthletes';
import { createInMemorySchoolStructureRepository } from '../data/schoolStructure';

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
    capturedAt: '2026-01-01T08:00:00Z',
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
    origin: 'own',
    ...over,
  } as HistoryMeasurement;
}

const measurements: HistoryMeasurement[] = [
  measurement('m1', 'a1', { hundredths: 3482 }),
  measurement('m2', 'a1', { hundredths: 3391, capturedAt: '2026-02-01T08:00:00Z' }),
  // Faster, but another pool or distance: not the console event.
  measurement('m3', 'a1', { hundredths: 3000, pool: 'LCM' }),
  measurement('m4', 'a1', { hundredths: 5900, distance: '100m' }),
  measurement('m5', 'a1', { hundredths: 6000, stroke: 'BK', distance: '100m', pool: 'LCM' }),
  measurement('m6', 'a1', { hundredths: 4100, stroke: 'BK', distance: '50m' }),
  measurement('m7', 'a2', { hundredths: 3700, pool: 'LCM' }),
  measurement('m8', 'a3', { hundredths: null }),
];

const setup = () => {
  const countCapturedSince = jest.fn().mockResolvedValue(7);
  const repository: ConsoleAthletesRepository = createConsoleAthletesRepository({
    athletes: createInMemorySchoolAthleteRepository({
      athletes: [
        { id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' },
        { id: 'a2', firstName: 'Mateo', lastName: 'Castro' },
        { id: 'a3', firstName: 'sara', lastName: 'peña' },
        { id: 'a4', firstName: 'Otto', lastName: 'Elsewhere' },
        { id: 'a5', firstName: 'Nia', lastName: 'Zeta' },
      ],
      athleteSchools: [
        { athleteId: 'a1', schoolId: 'school-a', categoryId: 'c1' },
        { athleteId: 'a2', schoolId: 'school-a', categoryId: 'c9' },
        { athleteId: 'a3', schoolId: 'school-a', categoryId: null },
        { athleteId: 'a5', schoolId: 'school-a', categoryId: 'c1' },
        { athleteId: 'a4', schoolId: 'school-b', categoryId: 'c9' },
      ],
      athleteGroups: [
        { athleteId: 'a1', groupId: 'g2' },
        { athleteId: 'a1', groupId: 'g1' },
        { athleteId: 'a1', groupId: 'g9' },
        { athleteId: 'a2', groupId: 'g2' },
        { athleteId: 'a4', groupId: 'g1' },
      ],
    }),
    authorizations: createInMemoryAuthorizationStatusRepository([
      { athleteId: 'a1', purpose: 'record_times', isGranted: true },
      { athleteId: 'a2', purpose: 'record_times', isGranted: false },
      { athleteId: 'a3', purpose: 'import_official_results', isGranted: true },
    ]),
    history: createInMemoryHistoryRepository(measurements),
    measurements: { countCapturedSince },
    structure: createInMemorySchoolStructureRepository({
      categories: [
        { id: 'c1', schoolId: 'school-a', name: 'Infantil B', sortOrder: 2 },
        { id: 'c9', schoolId: 'school-b', name: 'Other school category', sortOrder: 1 },
      ],
      groups: [
        { id: 'g1', schoolId: 'school-a', name: 'Group B' },
        { id: 'g2', schoolId: 'school-a', name: 'Group A' },
        { id: 'g9', schoolId: 'school-b', name: 'Other school group' },
      ],
      groupAssignments: [
        { coachId: 'k2', groupId: 'g1' },
        { coachId: 'k1', groupId: 'g2' },
        { coachId: 'k9', groupId: 'g9' },
      ],
      athleteAssignments: [
        { coachId: 'k1', athleteId: 'a1', schoolId: 'school-a' },
        { coachId: 'k3', athleteId: 'a1', schoolId: 'school-a' },
        { coachId: 'k4', athleteId: 'a3', schoolId: 'school-a' },
        { coachId: 'k5', athleteId: 'a3', schoolId: 'school-a' }, // no membership in school-a
      ],
      coachMemberships: [
        { coachId: 'k3', schoolId: 'school-a' },
        { coachId: 'k4', schoolId: 'school-a' },
      ],
    }),
  });
  return { repository, countCapturedSince };
};

const byId = async (id: string) => (await setup().repository.listAthletes('school-a')).find((a) => a.id === id)!;

describe('console athletes repository', () => {
  it('lists every athlete of the school in the athletes order and none of another school', async () => {
    const listed = await setup().repository.listAthletes('school-a');

    expect(listed.map((a) => a.id)).toEqual(['a2', 'a3', 'a1', 'a5']);
  });

  it('names the athlete with first and last name and two initials', async () => {
    const a1 = await byId('a1');
    const a3 = await byId('a3');

    expect(a1).toMatchObject({ name: 'Lucía Ramírez', initials: 'LR' });
    expect(a3).toMatchObject({ name: 'sara peña', initials: 'SP' });
  });

  it('gives each athlete one of the four athlete colors, always the same one', async () => {
    const first = await setup().repository.listAthletes('school-a');
    const second = await setup().repository.listAthletes('school-a');

    expect(first.map((a) => a.color)).toEqual(second.map((a) => a.color));
    for (const a of first) expect(['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4']).toContain(a.color);
  });

  it('takes the category from the school only', async () => {
    expect(await byId('a1')).toMatchObject({ categoryId: 'c1', category: 'Infantil B', categorySortOrder: 2 });
    expect(await byId('a2')).toMatchObject({ categoryId: null, category: null, categorySortOrder: null });
    expect(await byId('a3')).toMatchObject({ categoryId: null, category: null, categorySortOrder: null });
  });

  it('takes the groups of the school only, sorted by name, with the names in the same order', async () => {
    const a1 = await byId('a1');

    expect(a1.groupIds).toEqual(['g2', 'g1']);
    expect(a1.groups).toEqual(['Group A', 'Group B']);
    expect(await byId('a5')).toMatchObject({ groupIds: [], groups: [] });
  });

  it('collects the coaches of its groups and the direct ones, sorted and without duplicates', async () => {
    expect((await byId('a1')).coachIds).toEqual(['k1', 'k2', 'k3']);
    expect((await byId('a2')).coachIds).toEqual(['k1']);
    expect((await byId('a3')).coachIds).toEqual(['k4']);
    expect((await byId('a5')).coachIds).toEqual([]);
  });

  it('marks the authorization valid only when record_times is granted', async () => {
    expect((await byId('a1')).authorization).toBe('valid');
    expect((await byId('a2')).authorization).toBe('pending'); // is_granted = 0
    expect((await byId('a3')).authorization).toBe('pending'); // only another purpose granted
    expect((await byId('a5')).authorization).toBe('pending'); // no row
  });

  it('takes the best time from the console event only, null when there is none and never 0', async () => {
    expect(CONSOLE_BEST_EVENT).toEqual({ stroke: 'FR', distance: '50m', pool: 'SCM' });
    expect((await byId('a1')).bestTime).toBe(3391);
    expect((await byId('a2')).bestTime).toBeNull(); // only a faster LCM time
    expect((await byId('a3')).bestTime).toBeNull(); // a missing time
    expect((await byId('a5')).bestTime).toBeNull();
  });

  it('exposes no guardian, coach name or private field', async () => {
    expect(Object.keys(await byId('a1')).sort()).toEqual(
      ['authorization', 'bestTime', 'categoryId', 'category', 'categorySortOrder', 'coachIds', 'color', 'groupIds', 'groups', 'id', 'initials', 'name'].sort(),
    );
  });

  it('counts the measurements by delegating to the measurement repository', async () => {
    const { repository, countCapturedSince } = setup();

    await expect(repository.countMeasurementsSince(['a1', 'a2'], '2026-10-19T05:00:00.000Z')).resolves.toBe(7);
    expect(countCapturedSince).toHaveBeenCalledWith(['a1', 'a2'], '2026-10-19T05:00:00.000Z');
  });

  it('lists one best per event with a time, in catalog order, with the event and pool in the label', async () => {
    const bests = await setup().repository.listBests('a1');

    expect(bests).toEqual([
      { id: 'FR-50m-SCM', event: 'Libre 50 · 25 m', time: 3391 },
      { id: 'FR-50m-LCM', event: 'Libre 50 · 50 m', time: 3000 },
      { id: 'FR-100m-SCM', event: 'Libre 100 · 25 m', time: 5900 },
      { id: 'BK-50m-SCM', event: 'Espalda 50 · 25 m', time: 4100 },
      { id: 'BK-100m-LCM', event: 'Espalda 100 · 50 m', time: 6000 },
    ]);
  });

  it('lists no best for an athlete without eligible times', async () => {
    await expect(setup().repository.listBests('a3')).resolves.toEqual([]);
  });

  it('makes the same number of repository calls for 1 athlete as for 300 (no query per athlete)', async () => {
    const calls: string[] = [];
    // Counts every method call of a dependency, whatever it is called.
    const counted = <T extends object>(name: string, target: T): T =>
      Object.fromEntries(
        Object.entries(target).map(([method, fn]) => [
          method,
          (...args: unknown[]) => {
            calls.push(`${name}.${method}`);
            return (fn as (...a: unknown[]) => unknown)(...args);
          },
        ]),
      ) as T;

    const callsFor = async (count: number) => {
      calls.length = 0;
      const ids = Array.from({ length: count }, (_, i) => `n${i}`);
      const repository = createConsoleAthletesRepository({
        athletes: counted(
          'athletes',
          createInMemorySchoolAthleteRepository({
            athletes: ids.map((id) => ({ id, firstName: 'Sample', lastName: id })),
            athleteSchools: ids.map((athleteId) => ({ athleteId, schoolId: 'school-a', categoryId: null })),
            athleteGroups: [],
          }),
        ),
        authorizations: counted('authorizations', createInMemoryAuthorizationStatusRepository([])),
        history: counted('history', createInMemoryHistoryRepository(ids.map((id) => measurement(`m-${id}`, id)))),
        measurements: counted('measurements', { countCapturedSince: jest.fn() }),
        structure: counted(
          'structure',
          createInMemorySchoolStructureRepository({
            categories: [],
            groups: [],
            groupAssignments: [],
            athleteAssignments: [],
            coachMemberships: [],
          }),
        ),
      });
      const listed = await repository.listAthletes('school-a');
      expect(listed).toHaveLength(count);
      expect(listed.every((a) => a.bestTime === 3000)).toBe(true);
      return [...calls];
    };

    const one = await callsFor(1);
    const many = await callsFor(300);

    expect(many.length).toBe(one.length);
    expect(many).not.toContain('history.listByEvent');
  });
});
