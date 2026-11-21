import { ProviderUnavailableError, type TournamentEntry } from '../../port.ts';
import { INDEX_URL, TOURNAMENT_PDF, fetchBounded, isTournamentKey } from './lookup.ts';

// The index of one year is about 80 KB; 2 MB leaves room to grow and still bounds what a wrong answer can make us hold.
const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const CHANGED = 'The tournament list is not in the shape this provider reads';

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
// An entity this does not know stays as written: it only shows in a name, it never decides a row.
const decode = (text: string) =>
  text.replace(/&(?:#(\d{1,7})|([a-z]+));/gi, (all, code: string | undefined, name: string | undefined) =>
    name ? (NAMED[name] ?? all) : Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : all,
  );
const spaces = (text: string) => text.replace(/\s+/g, ' ').trim();
const cellText = (html: string) => spaces(decode(html.replace(/<[^>]*>/g, '')));

/**
 * The city of a platform's «Sede» («ATL, Barranquilla»): the department prefix is out, accents and capital letters are one fixed
 * spelling («Bogota D.C.») and spaces are collapsed, so the same city written elsewhere (an old catalog, a typed one) is the same text.
 */
export function normalizeCity(raw: string): string {
  return normalizeCityName(raw.slice(raw.indexOf(',') + 1));
}

/** The same fixed spelling for a city written without the department prefix (the one a LENEX file carries): a comma stays part of the name. */
export function normalizeCityName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s.])(\p{L})/gu, (_all, before: string, letter: string) => before + letter.toUpperCase());
}

/**
 * The tournaments of the platform's index page, every year it lists. A row whose PDF link has no valid `YYYYMMDD` key is left out
 * (the key is never guessed); a page with no readable row at all is a markup this does not know, so it is `ProviderUnavailableError`,
 * never an empty list that would look like "no tournaments".
 */
export function parseTournamentIndex(html: string): TournamentEntry[] {
  const entries: TournamentEntry[] = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
    const href = /\shref="([^"]*)"/.exec(row)?.[1];
    const title = /\stitle="([^"]*)"/.exec(row)?.[1];
    const [, year, dateKey] = (href && TOURNAMENT_PDF.exec(href)) || [];
    if (cells.length < 4 || title === undefined || !isTournamentKey(Number(year), dateKey ?? '')) continue;
    entries.push({
      dateKey,
      year: Number(year),
      name: spaces(decode(title)),
      city: normalizeCity(cellText(cells[1])),
      discipline: cellText(cells[3]),
      course: null,
      sourceUrl: href!,
    });
  }
  if (entries.length === 0) throw new ProviderUnavailableError(CHANGED);
  return entries;
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/** `listTournaments` of the adapter: the index page, read with the rules every request to the platform follows, filtered to the year asked. */
export function createTournamentList(fetchImpl: FetchImpl = fetch) {
  return async function listTournaments(year: number): Promise<TournamentEntry[]> {
    const html = new TextDecoder().decode(await fetchBounded(fetchImpl, INDEX_URL, MAX_INDEX_BYTES));
    return parseTournamentIndex(html).filter((entry) => entry.year === year);
  };
}
