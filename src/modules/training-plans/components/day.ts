// Session days are plain YYYY-MM-DD text, never instants, so no time zone can move an assignment to another day.

const pad = (n: number) => String(n).padStart(2, '0');

/** Today on the device's calendar. */
export function todayText(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The day `days` after (or before, when negative) a YYYY-MM-DD day. */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** The seven days, Monday to Sunday, of the week of a YYYY-MM-DD day. */
export function weekOf(day: string): string[] {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const sinceMonday = (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => shiftDay(day, index - sinceMonday));
}

/** For example "lunes, 2 de noviembre de 2026". */
export function dayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
