/** Elapsed time in hundredths of a second (integer). A missing time is `null`, never 0. */
export type Hundredths = number;

export type TimeKind = 'repetition' | 'series_total' | 'race' | 'split';

const MISSING = '—';

// shortcut: assumes a non-negative integer, negatives and fractions are not handled; revisit if a caller needs them.
export function formatTime(
  value: Hundredths | null,
  options: { decimalSeparator?: ',' | '.'; alwaysShowMinutes?: boolean } = {},
): string {
  if (value === null || value === undefined) return MISSING;
  const { decimalSeparator = ',', alwaysShowMinutes = false } = options;
  const minutes = Math.floor(value / 6000);
  const seconds = Math.floor((value % 6000) / 100);
  const cents = String(value % 100).padStart(2, '0');
  const showMinutes = minutes > 0 || alwaysShowMinutes;
  const secondsText = showMinutes ? String(seconds).padStart(2, '0') : String(seconds);
  return `${showMinutes ? `${minutes}:` : ''}${secondsText}${decimalSeparator}${cents}`;
}

/** Nanoseconds to hundredths, truncating (BigInt division) so a time is never rounded up. */
export function hundredthsFromNanos(elapsedNanos: bigint): Hundredths {
  return Number(elapsedNanos / 10_000_000n);
}

/** Elapsed time in milliseconds (integer), for times measured with millisecond precision. A missing time is `null`, never 0. */
export type Millis = number;

/**
 * Formats a millisecond time with three decimals (`1:05,372`) or, with `precision: 'hundredths'`, truncated to two (`1:05,37`),
 * so a time is never shown longer than it was. Same layout and separator rules as formatTime.
 */
export function formatMillis(
  value: Millis | null,
  options: { precision?: 'hundredths' | 'thousandths'; decimalSeparator?: ',' | '.'; alwaysShowMinutes?: boolean } = {},
): string {
  if (value === null || value === undefined) return MISSING;
  const { precision = 'hundredths', ...rest } = options;
  if (precision === 'hundredths') return formatTime(Math.floor(value / 10), rest);
  const { decimalSeparator = ',', alwaysShowMinutes = false } = rest;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const millis = String(value % 1000).padStart(3, '0');
  const showMinutes = minutes > 0 || alwaysShowMinutes;
  const secondsText = showMinutes ? String(seconds).padStart(2, '0') : String(seconds);
  return `${showMinutes ? `${minutes}:` : ''}${secondsText}${decimalSeparator}${millis}`;
}

/** Nanoseconds to milliseconds, truncating, so a time is never rounded up. */
export function millisFromNanos(elapsedNanos: bigint): Millis {
  return Number(elapsedNanos / 1_000_000n);
}
