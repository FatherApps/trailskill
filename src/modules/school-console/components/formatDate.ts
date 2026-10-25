import { t } from '../../../core/i18n';
import '../i18n';

// Hermes' Intl support for es-CO is not guaranteed, so months come from translations; returns null for a malformed date.
// No core helper exists yet (the athletes module has the same function, private to it).
export function formatDate(iso: string, style: 'short' | 'long'): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  // Date.UTC rolls over invalid days (day 0, 32, Feb 30, Feb 29 in common years); a round-trip rejects them.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) return null;
  return t(`schoolConsole.date.${style}`, {
    day,
    month: t(`schoolConsole.date.month_${style}.${month}`),
    year: match[1],
  });
}

// A local date-time (YYYY-MM-DDTHH:mm) as its short date and its 24-hour time; null when either part is malformed.
export function formatDateTime(iso: string): { date: string; time: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = formatDate(match[1], 'short');
  if (date === null || Number(match[2]) > 23 || Number(match[3]) > 59) return null;
  return { date, time: `${match[2]}:${match[3]}` };
}

// Local date as YYYY-MM-DD, the form formatDate reads.
export const localDate = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-');

// Local date-time as YYYY-MM-DDTHH:mm, the form formatDateTime reads.
export const localDateTime = (date: Date) => `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
