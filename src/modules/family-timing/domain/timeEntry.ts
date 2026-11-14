import type { Millis } from '../../../core/time';

export type TimeEntry = { ok: true; value: Millis } | { ok: false };

// A typed official time: "42,71", "42.710", "1:05,3" or "1:05,372". Up to three decimals; fewer are padded, so "42,7" is 42,700.
// An empty or zero value is refused: an official time always has a value.
const TIME = /^(?:(\d{1,3}):)?(\d{1,2})(?:[.,](\d{1,3}))?$/;

export function parseTimeEntry(text: string): TimeEntry {
  const match = TIME.exec(text.trim());
  if (!match) return { ok: false };
  const [, minutes, seconds, fraction = ''] = match;
  if (minutes !== undefined && Number(seconds) >= 60) return { ok: false };
  const value = Number(minutes ?? 0) * 60_000 + Number(seconds) * 1000 + Number(fraction.padEnd(3, '0'));
  return value > 0 ? { ok: true, value } : { ok: false };
}
