import { defaultMarkMeters } from './pace';

/** Default meters of each of `count` free marks: k × the pool length, null once a mark reaches the distance. */
export function defaultSplitMeters(count: number, poolLength: number, distance: number): (number | null)[] {
  return Array.from({ length: count }, (_, i) => defaultMarkMeters(i + 1, poolLength, distance));
}

export type SplitMetersInput = { ok: true; value: (number | null)[] } | { ok: false; reason: 'format' | 'range' | 'order' };

const NUMBER = /^\d+(?:[.,]\d+)?$/;

/** Reads the review fields: "37,5" or "37.5"; an empty field is no meters (null), never 0. Meters are above 0, below the distance and increasing. */
export function parseSplitMeters(texts: readonly string[], distance: number): SplitMetersInput {
  const value: (number | null)[] = [];
  let last = 0;
  for (const text of texts) {
    const trimmed = text.trim();
    if (trimmed === '') {
      value.push(null);
      continue;
    }
    if (!NUMBER.test(trimmed)) return { ok: false, reason: 'format' };
    const meters = Number(trimmed.replace(',', '.'));
    if (!(meters > 0) || meters >= distance) return { ok: false, reason: 'range' };
    if (meters <= last) return { ok: false, reason: 'order' };
    last = meters;
    value.push(meters);
  }
  return { ok: true, value };
}

/** "50" or "37,5": the decimal separator the app writes in Spanish. */
export const formatMeters = (meters: number): string => String(meters).replace('.', ',');
