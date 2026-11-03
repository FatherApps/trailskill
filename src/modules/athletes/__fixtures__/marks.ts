import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { Hundredths } from '../../../core/time';
import { importedAchievement, type EventAchievement } from '../achievements';
import { markFeatured, markSections } from '../markSections';
import { marksByEvent } from '../marks';
import type { MarksView } from '../screens/MarksScreen';

// Synthetic athletes and marks: fictional names, no real people or organizations. Times are in hundredths of a second.
const athletes: Extract<MarksView, { kind: 'data' }>['athletes'] = [
  { id: 'fx-1', name: 'Lucía R.', initials: 'LR', color: 'athlete-3' },
  { id: 'fx-2', name: 'Tomás R.', initials: 'TR', color: 'athlete-2' },
];

/** One measured result, the input of the same grouping the container runs; a `repetition` counts as training. */
export const measured = (
  stroke: StrokeCode,
  distance: DistanceCode,
  hundredths: number | null,
  day: string,
  over: Partial<EventAchievement> = {},
): EventAchievement => ({
  id: `${stroke}-${distance}-${day}`,
  kind: 'race',
  hundredths: hundredths as Hundredths | null,
  capturedAt: `${day}T08:00:00Z`,
  origin: 'own',
  stroke,
  distance,
  pool: 'SCM',
  ...over,
});

/** What the container builds from the achievements, the featured mark and the sections: the fixtures never copy the grouped result by hand. */
export const marksSections = (achievements: EventAchievement[], pool: PoolCode) => markSections(marksByEvent(achievements, pool));
export const marksFeatured = (achievements: EventAchievement[], pool: PoolCode, today = '2026-10-20') => markFeatured(marksByEvent(achievements, pool), today);

const data = { kind: 'data' as const, athletes, selectedId: 'fx-1', firstName: 'Lucía', pool: 'SCM' as const };

const scmMarks = [
  measured('FR', '50m', 3482, '2026-10-18'),
  importedAchievement({ id: 'i-1', provider: 'xx-demo', stroke: 'FR', distance: '100m', pool: 'SCM', hundredths: 7966 as Hundredths, swumOn: '2025-08-23' }, 'Federación Demo'),
  measured('BK', '50m', 4108, '2026-10-02', { kind: 'repetition' }),
  measured('BR', '50m', 4731, '2026-08-23'),
  measured('FL', '50m', 3955, '2026-08-23'),
];

export const marksFixture: MarksView = { ...data, featured: marksFeatured(scmMarks, 'SCM'), sections: marksSections(scmMarks, 'SCM') };

// The long pool lists no empty IM 100, so IM has no section.
export const marksLongPoolFixture: MarksView = {
  ...data,
  pool: 'LCM',
  // Older than 14 days on the fixture's day, so the card has no "Nueva" tag.
  featured: marksFeatured([measured('FR', '50m', 3601, '2026-09-12', { pool: 'LCM' })], 'LCM'),
  sections: marksSections([measured('FR', '50m', 3601, '2026-09-12', { pool: 'LCM' })], 'LCM'),
};

export const marksLongTextFixture: MarksView = {
  ...data,
  athletes: [{ id: 'fx-5', name: 'María de los Ángeles P.', initials: 'MP', color: 'athlete-1' }, ...athletes],
  selectedId: 'fx-5',
  firstName: 'María de los Ángeles',
  featured: marksFeatured([measured('FR', '50m', 123456, '2026-10-18', { kind: 'repetition' })], 'SCM'),
  sections: marksSections([measured('FR', '50m', 123456, '2026-10-18', { kind: 'repetition' })], 'SCM'),
};
