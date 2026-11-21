import type { TournamentCatalogEntry } from './tournamentCatalog';

export type CalendarMonth = { year: number; month: number };

/** The year chips: the distinct years of the catalog, newest first, so a year appears when its rows arrive and none is hard-coded. */
export function catalogYears(entries: TournamentCatalogEntry[]): number[] {
  return [...new Set(entries.map((entry) => entry.year))].sort((a, b) => b - a);
}

export const yearOfKey = (dateKey: string) => Number(dateKey.slice(0, 4));

/** How many tournaments each day has, by `YYYYMMDD`; a day missing from the result has none. */
export function countByDateKey(entries: TournamentCatalogEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { dateKey } of entries) counts[dateKey] = (counts[dateKey] ?? 0) + 1;
  return counts;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The weeks of one month, Monday first, as `YYYYMMDD` keys; the days outside the month are null. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay: Sunday is 0; Monday-first puts Sunday last.
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: lastDay }, (_, index) => `${year}${pad(month)}${pad(index + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
