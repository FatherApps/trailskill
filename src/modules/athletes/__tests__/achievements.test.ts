import type { Hundredths } from '../../../core/time';
import { importedAchievement, latestAchievement, type EventAchievement } from '../achievements';

// Synthetic data only.
const imported = {
  id: 'i1',
  provider: 'xx-demo',
  stroke: 'FR',
  distance: '50m',
  pool: 'LCM',
  hundredths: 3000 as Hundredths,
  swumOn: '2026-03-01',
} as const;

describe('importedAchievement', () => {
  it('counts as a race on its competition date, and keeps the event and the source name', () => {
    expect(importedAchievement(imported, 'Federación Demo')).toEqual({
      id: 'i1',
      kind: 'race',
      hundredths: 3000,
      capturedAt: '2026-03-01',
      origin: 'import',
      sourceName: 'Federación Demo',
      stroke: 'FR',
      distance: '50m',
      pool: 'LCM',
    });
  });

  it('has no source name when the organization is not known, and keeps a missing time as null, never 0', () => {
    const achievement = importedAchievement({ ...imported, hundredths: null });

    expect(achievement.hundredths).toBeNull();
    expect('sourceName' in achievement).toBe(false);
  });
});

describe('latestAchievement', () => {
  const at = (id: string, capturedAt: string, pool: 'SCM' | 'LCM'): EventAchievement => ({
    id,
    kind: 'race',
    hundredths: 3000 as Hundredths,
    capturedAt,
    origin: 'own',
    stroke: 'FR',
    distance: '50m',
    pool,
  });

  it('is undefined without results', () => {
    expect(latestAchievement([])).toBeUndefined();
  });

  it('is the most recent by date, whether measured or imported', () => {
    const list = [at('a', '2026-03-01T08:00:00Z', 'SCM'), importedAchievement({ ...imported, swumOn: '2026-04-01' }), at('c', '2026-02-01T08:00:00Z', 'SCM')];

    expect(latestAchievement(list)?.id).toBe('i1');
  });

  it('does not depend on the order of the list', () => {
    const list = [at('a', '2026-03-01T08:00:00Z', 'SCM'), at('b', '2026-05-01T08:00:00Z', 'LCM')];

    expect(latestAchievement([...list].reverse())?.id).toBe('b');
  });
});
