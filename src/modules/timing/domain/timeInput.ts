import type { Hundredths } from '../../../core/time';

export type TimeInput = { ok: true; value: Hundredths | null } | { ok: false };

// The inverse of formatTime: "35,20", "35.2", "35" or "1:05,30". An empty field is a missing time (null), never 0.
// A typed zero stays 0 on purpose: the repository guard refuses it.
const TIME = /^(?:(\d{1,3}):)?(\d{1,2})(?:[.,](\d{1,2}))?$/;

export function parseTimeInput(text: string): TimeInput {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const match = TIME.exec(trimmed);
  if (!match) return { ok: false };
  const [, minutes, seconds, cents = ''] = match;
  if (minutes !== undefined && Number(seconds) >= 60) return { ok: false };
  return { ok: true, value: Number(minutes ?? 0) * 6000 + Number(seconds) * 100 + Number(cents.padEnd(2, '0')) };
}
