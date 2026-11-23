import { createInMemoryFamilyMeasurementRepository, InvalidSplitMetersError, NotCompetitionError, parseSplitMeters, type FamilyMeasurement } from '../data/familyMeasurements';

const base: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'FL',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'competition',
  competition: 'Festival de prueba',
  capturedAt: '2026-11-08T14:00:00.000Z',
  millis: 47_210,
  splits: [],
  officialMillis: null,
  officialSetAt: null,
};

describe('in-memory family measurements', () => {
  it('lists an athlete newest first', async () => {
    const repo = createInMemoryFamilyMeasurementRepository([base, { ...base, id: 'm2', capturedAt: '2026-11-09T14:00:00.000Z' }, { ...base, id: 'm3', athleteId: 'a2' }]);
    expect((await repo.listByAthlete('a1')).map((m) => m.id)).toEqual(['m2', 'm1']);
  });

  it('sets and clears the official time of a competition, never the captured one', async () => {
    const repo = createInMemoryFamilyMeasurementRepository([base]);
    await repo.setOfficial('m1', 42_710, '2026-11-08T15:00:00.000Z');
    let [m] = await repo.listByAthlete('a1');
    expect(m).toMatchObject({ millis: 47_210, officialMillis: 42_710, officialSetAt: '2026-11-08T15:00:00.000Z' });
    await repo.setOfficial('m1', null, '2026-11-08T16:00:00.000Z');
    [m] = await repo.listByAthlete('a1');
    expect(m).toMatchObject({ millis: 47_210, officialMillis: null, officialSetAt: null });
  });

  it('refuses an official time on training', async () => {
    const repo = createInMemoryFamilyMeasurementRepository([{ ...base, sessionType: 'training', competition: null }]);
    await expect(repo.setOfficial('m1', 42_710, '2026-11-08T15:00:00.000Z')).rejects.toBeInstanceOf(NotCompetitionError);
  });
});

describe('in-memory deletion', () => {
  it('hides a deleted time and restores it', async () => {
    const repo = createInMemoryFamilyMeasurementRepository([base]);
    await repo.remove('m1', '2026-11-09T10:00:00.000Z');
    expect(await repo.listByAthlete('a1')).toEqual([]);
    expect((await repo.listDeleted('a1')).map((m) => m.id)).toEqual(['m1']);
    await repo.restore('m1');
    expect((await repo.listByAthlete('a1')).map((m) => m.id)).toEqual(['m1']);
  });
});

describe('parseSplitMeters', () => {
  it('reads numbers and nulls, keeps the length, and gives null for a time saved before free laps or unreadable text', () => {
    expect(parseSplitMeters('[25,50,null]')).toEqual([25, 50, null]);
    expect(parseSplitMeters('[25,"x"]')).toEqual([25, null]);
    expect(parseSplitMeters(null)).toBeNull();
    expect(parseSplitMeters('{"a":1}')).toBeNull();
    expect(parseSplitMeters('not json')).toBeNull();
  });

  it('keeps the meters of a measurement the fake saves', async () => {
    const repo = createInMemoryFamilyMeasurementRepository();
    await repo.add({ ...base, splits: [17_000, 35_000], splitMeters: [25, null] });
    expect((await repo.listByAthlete('a1'))[0].splitMeters).toEqual([25, null]);
  });
});

describe('the fake refuses the meters the server refuses', () => {
  const withMeters = (splitMeters: unknown): FamilyMeasurement => ({ ...base, splits: [17_000, 35_000], splitMeters: splitMeters as (number | null)[] });

  it('needs one entry per split, each a number or null', async () => {
    const repo = createInMemoryFamilyMeasurementRepository();
    await expect(repo.add(withMeters([25]))).rejects.toBeInstanceOf(InvalidSplitMetersError);
    await expect(repo.add(withMeters([25, '50']))).rejects.toBeInstanceOf(InvalidSplitMetersError);
    await expect(repo.add(withMeters([25, [50]]))).rejects.toBeInstanceOf(InvalidSplitMetersError);
    await expect(repo.add(withMeters([25, null]))).resolves.toBeUndefined();
    await expect(repo.add({ ...base, id: 'old', splitMeters: null })).resolves.toBeUndefined();
  });

  it('saves a series all or none', async () => {
    const repo = createInMemoryFamilyMeasurementRepository();
    await expect(repo.addMany([{ ...base, id: 'ok' }, { ...withMeters([25]), id: 'bad' }])).rejects.toBeInstanceOf(InvalidSplitMetersError);
    expect(await repo.listByAthlete('a1')).toEqual([]);
  });
});
