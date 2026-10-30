import { t } from '../../../core/i18n';
import { distances, pools, strokes, type DistanceCode, type PoolCode, type StrokeCode } from '../../../core/sport';

const nameOf = (catalog: readonly { code: string; nameKey: string }[], code: string) => t(catalog.find((entry) => entry.code === code)?.nameKey ?? code);

/** "Libre 50 m · Piscina larga": the event of a result, from the sport catalogs. */
export const eventLabel = (stroke: StrokeCode, distance: DistanceCode, pool: PoolCode) =>
  t('resultsImport.event.label', { stroke: nameOf(strokes, stroke), distance: nameOf(distances, distance), pool: nameOf(pools, pool) });
