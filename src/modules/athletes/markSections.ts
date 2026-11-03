import { distances } from '../../core/sport';
import { t } from '../../core/i18n';
import { distanceLabel, strokeLabel } from './components/sportLabel';
import { marksByStroke, type MarkRow } from './marks';
import type { MarkSectionView } from './screens/MarksScreen';
import './i18n';

const day = (iso: string) => iso.slice(0, 10);

/** The screen's groups from the rows of `marksByEvent`: the container and the fixtures share this one grouping. */
export function markSections(rows: readonly MarkRow[]): MarkSectionView[] {
  return marksByStroke(rows).map(({ stroke, rows: grouped }) => ({
    id: stroke,
    title: strokeLabel(stroke),
    cards: grouped.map(({ id, distance, best }) => ({
      id,
      stroke,
      event: t('athletes.marks.event_spoken', { stroke: strokeLabel(stroke), meters: distances.find((d) => d.code === distance)?.meters ?? distance }),
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
