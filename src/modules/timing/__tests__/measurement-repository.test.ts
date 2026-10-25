import { createInMemoryMeasurementRepository } from '..';
import type { Measurement } from '..';

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
  };
}

describe('in-memory measurement repository', () => {
  it('lists every arrival of a series by position, unassigned ones included', async () => {
    const repository = createInMemoryMeasurementRepository();
    await repository.add(arrival('m3', 'S', 3, 'athlete-2'));
    await repository.add(arrival('m2', 'S', 2, null));
    await repository.add(arrival('m1', 'S', 1, 'athlete-1'));
    await repository.add(arrival('other', 'T', 1, 'athlete-1'));

    const listed = await repository.listBySeries('S');

    expect(listed.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(listed[1]?.athleteId).toBeNull();
  });
});
