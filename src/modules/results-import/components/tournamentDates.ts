import { t } from '../../../core/i18n';
import '../i18n';

const monthName = (month: number) => t(`results_import.tournament.calendar.months.${month}`);

/** «18 oct 2025» from a `YYYYMMDD` key: the first three letters of the month name. */
export function formatTournamentDate(dateKey: string): string {
  return `${Number(dateKey.slice(6, 8))} ${monthName(Number(dateKey.slice(4, 6))).slice(0, 3)} ${dateKey.slice(0, 4)}`;
}

/** «Octubre 2026», the title of the month the calendar shows. */
export function monthTitle(year: number, month: number): string {
  const name = monthName(month);
  return t('results_import.tournament.calendar.title', { month: name.charAt(0).toUpperCase() + name.slice(1), year });
}

/** «18 de octubre, 2 torneos»: what a screen reader says for one day. */
export function dayLabel(dateKey: string, count: number): string {
  const values = { day: Number(dateKey.slice(6, 8)), month: monthName(Number(dateKey.slice(4, 6))) };
  return count === 0 ? t('results_import.tournament.calendar.day_none', values) : t('results_import.tournament.calendar.day', { ...values, count });
}
