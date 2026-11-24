import type { PoolCode } from '../../../../../src/core/sport/catalogs.ts';
import { ProviderUnavailableError, type TournamentEntry } from '../../port.ts';
import { CALENDAR_URL, INDEX_URL, TOURNAMENT_PDF, fetchBounded, isTournamentKey, tournamentPdfUrl } from './lookup.ts';

// The index of one year is about 80 KB and the calendar of every year about 700 KB; 2 MB each leaves room to grow and still bounds what a wrong answer can make us hold.
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const CHANGED = 'The tournament list is not in the shape this provider reads';
const CALENDAR_CHANGED = 'The tournament calendar is not in the shape this provider reads';

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
  return raw
    .slice(raw.indexOf(',') + 1)
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

// Text as the matching reads it: no accents, no capital letters, one space between words.
const plain = (text: string) => spaces(text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());

/**
 * What marks a calendar event as another discipline than swimming, found in its title (organizer or name). They come from the titles of the
 * real calendar: underwater activities (the platform also lists them: «subacuáticas», fin swimming, apnea, underwater rugby and hockey),
 * diving, water polo, artistic swimming, and open water. A marker is plain text (no accents or capitals) that a word starts with, so
 * «polo» is not «Apolo». It is a discipline word, never an organization's name. Masters swimming is swimming: it stays.
 */
export const EXCLUDED_DISCIPLINE_MARKERS = [
  'subacu', 'subacau', 'aletas', 'finswimming', 'apnea', 'rugby', 'hockey',
  'clavad', 'diving', 'polo', 'waterpolo', 'artistic', 'sincroniz', 'aguas abiertas', 'aguas libres', 'open water',
] as const;
const EXCLUDED = new RegExp(`\\b(?:${EXCLUDED_DISCIPLINE_MARKERS.join('|')})`);

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

/**
 * The events of the calendar's `events: [ ... ]` as plain data: for each one, its fields that are text. The page writes them as a JavaScript
 * literal (bare keys, single quotes, comments), so this reads that literal with a small scanner and never evaluates anything. A value that is
 * not a text or a bare word or number (a call, an expression) is a page this does not read: `ProviderUnavailableError`.
 * shortcut: a text escape is its character without the backslash (no \n, \u...), when a title shows one, read it.
 */
function readCalendarEvents(script: string): Record<string, string | undefined>[] {
  const fail = (): never => {
    throw new ProviderUnavailableError(CALENDAR_CHANGED);
  };
  const start = /\bevents\s*:\s*\[/.exec(script);
  if (!start) return fail();
  let at = start.index + start[0].length;
  const trivia = () => {
    for (;;) {
      if (/\s/.test(script[at] ?? '')) at += 1;
      else if (script.startsWith('//', at)) at = script.indexOf('\n', at) < 0 ? script.length : script.indexOf('\n', at);
      else if (script.startsWith('/*', at)) at = script.indexOf('*/', at) < 0 ? fail() : script.indexOf('*/', at) + 2;
      else return;
    }
  };
  const text = (): string => {
    const quote = script[at++];
    let out = '';
    for (; at < script.length; at += 1) {
      const char = script[at];
      if (char === quote) return (at += 1), out;
      if (char === '\n') break;
      out += char === '\\' ? script[(at += 1)] ?? '' : char;
    }
    return fail();
  };
  const isQuote = () => script[at] === "'" || script[at] === '"';
  const events: Record<string, string | undefined>[] = [];
  for (trivia(); script[at] !== ']'; trivia()) {
    if (script[at++] !== '{') fail();
    const fields: Record<string, string | undefined> = {};
    for (trivia(); script[at] !== '}'; trivia()) {
      const quoted = isQuote();
      const key = quoted ? text() : /^[\w$]+/.exec(script.slice(at, at + 64))?.[0];
      if (key === undefined || (at += quoted ? 0 : key.length, false)) fail();
      trivia();
      if (script[at++] !== ':') fail();
      trivia();
      if (isQuote()) fields[key!] = text();
      else {
        const word = /^[\w.#+-]+/.exec(script.slice(at, at + 64))?.[0] ?? fail();
        at += word.length;
        fields[key!] = undefined;
      }
      trivia();
      if (script[at] === ',') at += 1;
      else if (script[at] !== '}') fail();
    }
    at += 1;
    events.push(fields);
    trivia();
    if (script[at] === ',') at += 1;
    else if (script[at] !== ']') fail();
  }
  return events;
}

/**
 * The swimming tournaments of the platform's calendar, every year it lists. Each event whose link is the PDF of a tournament is one (the
 * link's key is the day and year, never the event's `start`); the title is « organizer | name » and a title with no organizer is left out, so
 * is an event of another discipline (`EXCLUDED_DISCIPLINE_MARKERS`) and a repeated day (the first stays). The calendar has no venue, so the
 * city is the organizer, spelled as the cities of the index; the pool length is only what the title says (`courseFromTitle`). A page with no
 * tournament left, or in another shape, is `ProviderUnavailableError`, never an empty list.
 */
export function parseCalendar(html: string): TournamentEntry[] {
  const entries = new Map<string, TournamentEntry>();
  for (const { title, url } of readCalendarEvents(html)) {
    const [, year, dateKey] = (url && TOURNAMENT_PDF.exec(url)) || [];
    const cut = title?.indexOf(' | ') ?? -1;
    if (title === undefined || cut < 0 || !isTournamentKey(Number(year), dateKey ?? '') || entries.has(dateKey) || EXCLUDED.test(plain(decode(title)))) continue;
    const organizer = spaces(decode(title.slice(0, cut)));
    const name = spaces(decode(title.slice(cut + 3)));
    if (organizer && name)
      entries.set(dateKey, { dateKey, year: Number(year), name, city: normalizeCity(organizer), discipline: 'SW', course: courseFromTitle(title), sourceUrl: tournamentPdfUrl(Number(year), dateKey) });
  }
  if (entries.size === 0) throw new ProviderUnavailableError(CALENDAR_CHANGED);
  return [...entries.values()];
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * `listTournaments` of the adapter: the index page and then the calendar, each read with the rules every request to the platform follows,
 * filtered to the years asked. A day both list is one row, the index's (its city is the venue's); the pool length the calendar's title
 * names is kept on it, and a day only the calendar lists is added after. If either page cannot be read the whole list is unavailable:
 * a catalog is never saved half-read.
 */
export function createTournamentList(fetchImpl: FetchImpl = fetch) {
  return async function listTournaments(years: readonly number[]): Promise<TournamentEntry[]> {
    const read = async (url: string) => new TextDecoder().decode(await fetchBounded(fetchImpl, url, MAX_PAGE_BYTES));
    const index = parseTournamentIndex(await read(INDEX_URL));
    const calendar = parseCalendar(await read(CALENDAR_URL));
    const courses = new Map(calendar.map((entry) => [entry.dateKey, entry.course]));
    const days = new Set(index.map((entry) => entry.dateKey));
    return [...index.map((entry) => ({ ...entry, course: entry.course ?? courses.get(entry.dateKey) ?? null })), ...calendar.filter((entry) => !days.has(entry.dateKey))].filter((entry) =>
      years.includes(entry.year),
    );
  };
}
