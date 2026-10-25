import { t } from '../../../core/i18n';
import { distances, pools, strokes } from '../../../core/sport';
import '../i18n';

// "Libre 50": the stroke name and the meters, both from the sport catalogs. An unknown code stays visible as itself.
export function eventLabel(stroke: string, distance: string): string {
  const strokeEntry = strokes.find((entry) => entry.code === stroke);
  const distanceEntry = distances.find((entry) => entry.code === distance);
  return `${strokeEntry ? t(strokeEntry.nameKey) : stroke} ${distanceEntry ? distanceEntry.meters : distance}`;
}

// "MP Libre 50": the label of the personal best column of an event. With a pool it names it too, "MP Libre 50 · 25 m";
// an unknown pool code stays visible as itself.
export function personalBestLabel(stroke: string, distance: string, pool?: string): string {
  const event = eventLabel(stroke, distance);
  if (pool === undefined) return t('schoolConsole.table.personal_best', { event });
  const entry = pools.find((p) => p.code === pool);
  return t('schoolConsole.table.personal_best_pool', { event, pool: entry ? `${entry.lengthMeters} m` : pool });
}
