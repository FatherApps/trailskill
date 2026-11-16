import { createInMemoryHistoryRepository } from '../data/inMemoryHistoryRepository';
import type { HistoryMeasurement } from '../data/history';
import { personalBestTime } from '../personalBest';

// A guardian device only holds the rows the sync stream sends (#1018): the school times shared with the guardian.
const event = { stroke: 'FR', distance: '50m', pool: 'SCM' } as const;

const row = (id: string, hundredths: number, capturedAt: string): HistoryMeasurement =>
  ({
    id, kind: 'race', athleteId: 'athlete-1', seriesId: null, arrivalPosition: null, hundredths, stroke: 'FR', distance: '50m',
    pool: 'SCM', sessionType: 'training', source: 'screen_button', createdBy: 'coach-a', deviceId: 'device-a', capturedAt, parentId: null,
    origin: 'own',
  }) as HistoryMeasurement;

describe('the guardian history and best time', () => {
  it('come only from the rows in the local database, and drop a row that leaves it', async () => {
    const local = [row('shared', 3100, '2026-02-01T08:00:00Z'), row('also-shared', 3300, '2026-03-01T08:00:00Z')];
    const history = createInMemoryHistoryRepository(local);

    expect((await history.listByEvent('athlete-1', event)).map((m) => m.id)).toEqual(['also-shared', 'shared']);
    expect(await personalBestTime(history, 'athlete-1', event)).toBe(3100);

    // The switch goes off: the stream stops matching the fastest row and the device removes it.
    local.splice(0, 1);

    expect((await history.listByEvent('athlete-1', event)).map((m) => m.id)).toEqual(['also-shared']);
    expect(await personalBestTime(history, 'athlete-1', event)).toBe(3300);

    local.length = 0;

    expect(await history.listByEvent('athlete-1', event)).toEqual([]);
    expect(await personalBestTime(history, 'athlete-1', event)).toBeNull();
  });
});
