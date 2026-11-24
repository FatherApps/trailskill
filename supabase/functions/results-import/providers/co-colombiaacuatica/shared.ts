import type { PoolCode } from '../../../../../src/core/sport/catalogs.ts';
import { ProviderUnavailableError } from '../../port.ts';

export const TOO_LARGE = 'The tournament file is too large';

/** The only way this provider fails: the typed "unavailable" with a clear message and no cause, so no number can leak. */
export const unavailable = (message: string): never => {
  throw new ProviderUnavailableError(message);
};

/** A day that exists (no 30 February, no month 13), from its three numbers. */
export function isRealDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Reads at most `limit` bytes of a stream and stops there: nothing past it is ever held. A missing body is empty. */
export async function readBounded(stream: ReadableStream<Uint8Array> | null | undefined, limit: number): Promise<Uint8Array> {
  const reader = stream?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return unavailable(TOO_LARGE);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

// Text as the matching reads it: no accents, no capital letters, one space between words.
export const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * What a title says in so many words about the pool length, as a pattern of its plain text and the pool it names: «25 m», «50 m»,
 * «piscina corta/larga», «curso corto/largo», SC/LC and SCM/LCM. Never inferred from anything else. Exported for the results of a PDF.
 */
export const COURSE_MARKERS: readonly (readonly [RegExp, PoolCode])[] = [
  [/\b25 ?m(?:etros)?\b/, 'SCM'],
  [/\b50 ?m(?:etros)?\b/, 'LCM'],
  [/\bpiscina corta\b/, 'SCM'],
  [/\bpiscina larga\b/, 'LCM'],
  [/\bcurso corto\b/, 'SCM'],
  [/\bcurso largo\b/, 'LCM'],
  [/\bscm?\b/, 'SCM'],
  [/\blcm?\b/, 'LCM'],
];

/** The pool length a title names, or null when it names none or both (a title that says both says nothing). */
export function courseFromTitle(title: string): PoolCode | null {
  const text = plain(title);
  const pools = new Set(COURSE_MARKERS.filter(([pattern]) => pattern.test(text)).map(([, pool]) => pool));
  return pools.size === 1 ? [...pools][0] : null;
}

