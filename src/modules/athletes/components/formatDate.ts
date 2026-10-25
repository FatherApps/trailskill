import { t } from '../../../core/i18n';
import '../i18n';

// Hermes' Intl support for es-CO is not guaranteed, so months come from translations; returns null for a malformed date.
export function formatDate(iso: string, style: 'short' | 'long'): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return t(`athletes.date.${style}`, {
    day: Number(match[3]),
    month: t(`athletes.date.month_${style}.${month}`),
    year: match[1],
  });
}
