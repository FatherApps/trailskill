import { t } from '../../../core/i18n';
import '../i18n';

// Hermes' Intl support for es-CO is not guaranteed, so months come from translations; returns null for a malformed date.
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
  return t(`athletes.date.${style}`, {
    day,
    month: t(`athletes.date.month_${style}.${month}`),
    year: match[1],
  });
}
