/** Elapsed time in hundredths of a second (integer). A missing time is `null`, never 0. */
export type Hundredths = number;

export type TimeKind = 'repetition' | 'series_total' | 'race' | 'split';

const MISSING = '—';

// shortcut: assumes a non-negative integer, negatives and fractions are not handled; revisit if a caller needs them.
export function formatTime(
  value: Hundredths | null,
  options: { decimalSeparator?: ',' | '.' } = {},
): string {
  if (value === null || value === undefined) return MISSING;
  const { decimalSeparator = ',' } = options;
  const minutes = Math.floor(value / 6000);
  const seconds = Math.floor((value % 6000) / 100);
  const cents = String(value % 100).padStart(2, '0');
  const secondsText = minutes > 0 ? String(seconds).padStart(2, '0') : String(seconds);
  return `${minutes > 0 ? `${minutes}:` : ''}${secondsText}${decimalSeparator}${cents}`;
}

/** Nanoseconds to hundredths, truncating (BigInt division) so a time is never rounded up. */
export function hundredthsFromNanos(elapsedNanos: bigint): Hundredths {
  return Number(elapsedNanos / 10_000_000n);
}
