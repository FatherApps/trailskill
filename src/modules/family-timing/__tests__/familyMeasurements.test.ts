import { createInMemoryFamilyMeasurementRepository, NotCompetitionError, type FamilyMeasurement } from '../data/familyMeasurements';

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
