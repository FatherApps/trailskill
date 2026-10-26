import { t } from '../../../core/i18n';
import { distances, pools, strokes } from '../../../core/sport';
import '../i18n';

// "Libre 50 m · piscina 25 m": names and lengths come from the sport catalogs; an unknown code stays visible as itself.
export function conflictEventLabel(event: { stroke: string; distance: string; pool: string }): string {
  const stroke = strokes.find((entry) => entry.code === event.stroke);
  const distance = distances.find((entry) => entry.code === event.distance);
  const pool = pools.find((entry) => entry.code === event.pool);
  const name = `${stroke ? t(stroke.nameKey) : event.stroke} ${distance ? t(distance.nameKey) : event.distance}`;
  return `${name} · ${pool ? t('timing.review.pool', { meters: pool.lengthMeters }) : event.pool}`;
}

// "25/10/2026 14:05" in the device's local time; a malformed date stays as it came.
export function formatConflictTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
