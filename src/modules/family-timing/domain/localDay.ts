const pad = (n: number) => String(n).padStart(2, '0');

/** The phone's local calendar day (YYYY-MM-DD) of an ISO 8601 instant, the day the person lived it. */
export function localDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
