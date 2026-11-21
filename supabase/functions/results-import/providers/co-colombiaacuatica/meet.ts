import { ProviderUnavailableError } from '../../port.ts';
import { MAX_ZIP_BYTES, readSingleLef } from './zip.ts';
import { fetchBounded, tournamentFromKey, tournamentFromUrl, TOURNAMENT_PDF } from './lookup.ts';
import { normalizeCityName } from './tournaments.ts';
import { NOT_LENEX, parseXml } from './xml.ts';

/** The code the platform's index uses for swimming: every tournament that has a LENEX file is one. */
export const LENEX_DISCIPLINE = 'SW';

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

// The opening tag of the first MEET and nothing after it: attributes only, quoted, as the XML reader reads them.
const MEET_TAG = /<MEET(?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>/;

/**
 * The name and the city of the tournament, from the MEET tag of a LENEX text. Only that tag is parsed: the clubs, the athletes and
 * every other participant that follow it are never read, so a broken body does not matter and nothing personal comes out.
 */
export function readMeetHeader(text: string): { name: string; city: string } {
  const tag = MEET_TAG.exec(text)?.[0];
  if (tag === undefined) throw new ProviderUnavailableError(NOT_LENEX);
  const { attrs } = parseXml(tag.replace(/\s*\/?>$/, '/>'));
  const name = (attrs.name ?? '').replace(/\s+/g, ' ').trim();
  const city = normalizeCityName(attrs.city ?? '');
  if (name === '' || city === '') throw new ProviderUnavailableError(NOT_LENEX);
  return { name, city };
}

/**
 * The header of the tournament of a day: its zip downloaded in memory with the rules every request to the platform follows, its only
 * `.lef` decoded, and `readMeetHeader` on it. Nothing is written to disk and nothing but the two header fields is kept.
 */
export async function fetchMeetHeader(fetchImpl: FetchImpl, year: number, dateKey: string): Promise<{ name: string; city: string }> {
  const lef = await readSingleLef(await fetchBounded(fetchImpl, tournamentFromKey(year, dateKey).zipUrl, MAX_ZIP_BYTES));
  try {
    return readMeetHeader(new TextDecoder('utf-8', { fatal: true }).decode(lef));
  } catch (error) {
    throw error instanceof ProviderUnavailableError ? error : new ProviderUnavailableError(NOT_LENEX);
  }
}

/**
 * The year and key of every tournament address in a list, once each and in the order met: the folder of the tournament or its PDF,
 * exactly as the adapter accepts them. Any other address, and any key that is not a real day of its year, is left out, never guessed.
 */
export function keysFromUrls(urls: readonly string[]): { year: number; dateKey: string }[] {
  const keys = new Map<string, { year: number; dateKey: string }>();
  for (const url of urls) {
    const [, pdfYear, pdfKey] = TOURNAMENT_PDF.exec(url.trim()) ?? [];
    try {
      const dateKey = pdfKey ?? tournamentFromUrl(url).tournament;
      const year = pdfYear === undefined ? Number(dateKey.slice(0, 4)) : Number(pdfYear);
      tournamentFromKey(year, dateKey);
      keys.set(dateKey, { year, dateKey });
    } catch {
      // not an address of this platform
    }
  }
  return [...keys.values()];
}
