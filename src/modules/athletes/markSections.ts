import { distances } from '../../core/sport';
import { t } from '../../core/i18n';
import { distanceLabel, strokeLabel } from './components/sportLabel';
import { featuredMark, marksByStroke, type MarkRow } from './marks';
import type { MarkFeatured, MarkSectionView } from './screens/MarksScreen';
import './i18n';

const day = (iso: string) => iso.slice(0, 10);
const meters = (code: string) => distances.find((d) => d.code === code)?.meters ?? code;

// A mark set in the last 14 days, counting today, is new.
const newForDays = 14;
const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/** The calendar day on the device, as yyyy-mm-dd. */
export function localDay(now: Date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The screen's groups from the rows of `marksByEvent`: the container and the fixtures share this one grouping. */
export function markSections(rows: readonly MarkRow[]): MarkSectionView[] {
  return marksByStroke(rows).map(({ stroke, rows: grouped }) => ({
    id: stroke,
    title: strokeLabel(stroke),
    cards: grouped.map(({ id, distance, best }) => ({
      id,
      stroke,
      event: t('athletes.marks.event_spoken', { stroke: strokeLabel(stroke), meters: meters(distance) }),
      distance: distanceLabel(distance),
      time: best?.hundredths ?? null,
      // Same rule as the profile: an imported result is official, a measured race is a competition, any other eligible kind is training.
      ...(best
        ? {
            origin: best.origin === 'import' ? ('official' as const) : best.kind === 'race' ? ('competition' as const) : ('training' as const),
            ...(best.sourceName ? { sourceName: best.sourceName } : {}),
            date: day(best.date),
          }
        : {}),
    })),
  }));
}

/** The card of the most recent mark of the pool, or null without one; `today` is the device's day, to tell whether the mark is still new. */
export function markFeatured(rows: readonly MarkRow[], today: string): MarkFeatured | null {
  const row = featuredMark(rows);
  const best = row?.best;
  if (!row || !best) return null;
  return {
    id: row.id,
    stroke: row.stroke,
    event: t('athletes.marks.event_spoken', { stroke: strokeLabel(row.stroke), meters: meters(row.distance) }),
    title: t('athletes.marks.featured.event', { stroke: strokeLabel(row.stroke), distance: distanceLabel(row.distance) }),
    time: best.hundredths,
    origin: best.origin === 'import' ? 'official' : best.kind === 'race' ? 'competition' : 'training',
    ...(best.sourceName ? { sourceName: best.sourceName } : {}),
    date: day(best.date),
    isNew: daysBetween(day(best.date), today) <= newForDays,
  };
}
