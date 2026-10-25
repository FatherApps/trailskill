import { t } from '../../../core/i18n';
import { distances, strokes } from '../../../core/sport';
import '../i18n';

// "Libre 50": the stroke name and the meters, both from the sport catalogs. An unknown code stays visible as itself.
export function eventLabel(stroke: string, distance: string): string {
  const strokeEntry = strokes.find((entry) => entry.code === stroke);
  const distanceEntry = distances.find((entry) => entry.code === distance);
  return `${strokeEntry ? t(strokeEntry.nameKey) : stroke} ${distanceEntry ? distanceEntry.meters : distance}`;
}

// "MP Libre 50": the label of the personal best column of an event.
export const personalBestLabel = (stroke: string, distance: string) =>
  t('schoolConsole.table.personal_best', { event: eventLabel(stroke, distance) });
