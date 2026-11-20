import { t } from '../i18n';

// Months come from translations, not Intl: Hermes' Intl support for es-CO is not guaranteed. The day is the phone's own.
export function formatDeletionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return t('accounts.delete.date', { day: date.getDate(), month: t(`accounts.delete.month.${date.getMonth() + 1}`), year: date.getFullYear() });
}
