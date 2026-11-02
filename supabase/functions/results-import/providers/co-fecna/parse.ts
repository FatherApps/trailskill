import type { Affiliation, NormalizedResult } from '../../port.ts';
import type { DistanceCode, StrokeCode } from '../../../../../src/core/sport/catalogs.ts';
import { cellText, decodeEntities, normalizeSpaces, UnknownEntityError } from './html.ts';

// Everything here reads the page's HTML with regular expressions. Any shape it does not expect throws; the provider turns
// that into the typed "unavailable", so a changed page never yields a half-read result.

export type RosterEntry = {
  /** As the form sends it. */
  value: string;
  /** Normalized, for comparing. */
  key: string;
  /** Last names then first names, as the source writes them. */
  name: string;
};
/** An entry whose name or value holds an entity we do not know: it has no name, and no key when the value is the unreadable part. */
export type UnreadableEntry = { unreadable: true; value: string | null; key: string | null };
export type RosterItem = RosterEntry | UnreadableEntry;
export type History = { affiliations: Affiliation[]; results: NormalizedResult[] };

/** Spaces, dots and hyphens dropped, letters upper-cased, 20 alphanumerics at most: values are not always digits only. */
export function normalizeNumber(raw: string): string {
  const key = raw.replace(/[\s.-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(key)) throw new Error('Unexpected number');
  return key;
}

const decodeOrNull = (text: string) => {
  try {
    return decodeEntities(text);
  } catch (error) {
    if (error instanceof UnknownEntityError) return null;
    throw error;
  }
};

const attributeOf = (attributes: string, name: string) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attributes)?.[1];

export function parseRoster(html: string): RosterItem[] {
  const select = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  let list: string | undefined;
  for (let found = select.exec(html); found; found = select.exec(html)) {
    if (attributeOf(found[1], 'name') === 'nadador') list = found[2];
  }
  if (list === undefined) throw new Error('No swimmer list');

  const entries: RosterItem[] = [];
  for (const [, attributes, text] of list.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const value = /^\s*value\s*=\s*"([^"]*)"\s*$/.exec(attributes)?.[1];
    if (value === undefined || text.includes('<')) throw new Error('Unexpected option');
    // An entity we do not know makes the entry unreadable, never absent: the provider must not answer "no match" for it.
    const decodedValue = decodeOrNull(value);
    const decodedName = decodeOrNull(text);
    const key = decodedValue === null ? null : normalizeNumber(decodedValue);
    if (decodedName === null || decodedValue === null) {
      entries.push({ unreadable: true, value: decodedValue, key });
      continue;
    }
    // Two blocks, last names first, split on the line break the page puts between them.
    const blocks = decodedName
      .trim()
      .split(/\n\s*/)
      .map(normalizeSpaces);
    if (blocks.length !== 2 || blocks.some((block) => block === '')) throw new Error('Unexpected name');
    entries.push({ value: decodedValue, key: key as string, name: blocks.join(' ') });
  }
  if (entries.length === 0) throw new Error('Empty swimmer list');
  return entries;
}

// The ids combine distance and a stroke letter: l free, e back, p breast, m fly, c medley.
const STROKE_BY_LETTER: Record<string, StrokeCode> = { l: 'FR', e: 'BK', p: 'BR', m: 'FL', c: 'IM' };
const DISTANCES = new Set<string>(['50', '100', '200', '400', '800', '1500']);

const COLUMNS = ['categoria', 'tiempo', 'diferencia en s', 'puntos world aquatics', 'fecha', 'piscina', 'torneo'];
const columnName = (text: string) =>
  cellText(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// ASSUMED, pending real rows (issue #80, questions 8 to 10): the cell formats below are invented.
// Time: `ss.cc` or `m:ss.cc`; a missing time is an empty cell or a dash.
function parseTime(text: string): number | null {
  if (text === '' || text === '-') return null;
  const match = /^(?:(\d{1,2}):)?(\d{1,2})[.,](\d{2})$/.exec(text);
  if (!match || (match[1] !== undefined && Number(match[2]) > 59)) throw new Error('Unexpected time');
  const hundredths = (Number(match[1] ?? 0) * 60 + Number(match[2])) * 100 + Number(match[3]);
  if (hundredths === 0) throw new Error('Unexpected time');
  return hundredths;
}

// Date: `yyyy-mm-dd` or `dd/mm/yyyy`.
function parseDate(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) ?? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) throw new Error('Unexpected date');
  const [year, month, day] = text.includes('/') ? [match[3], match[2], match[1]] : [match[1], match[2], match[3]];
  const iso = `${year}-${month}-${day}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) throw new Error('Unexpected date');
  return iso;
}

// Pool: 25 or 50, with or without "m".
function parsePool(text: string): NormalizedResult['pool'] {
  const meters = /^(25|50)\s*m?$/i.exec(text)?.[1];
  if (!meters) throw new Error('Unexpected pool');
  return meters === '25' ? 'SCM' : 'LCM';
}

// A tag that opens and is never closed is a cut or changed page: the regular expressions below would drop it silently.
function requireBalanced(html: string, tags: string[]) {
  for (const tag of tags) {
    const opened = html.match(new RegExp(`<${tag}\\b`, 'gi'))?.length ?? 0;
    const closed = html.match(new RegExp(`</${tag}\\s*>`, 'gi'))?.length ?? 0;
    if (opened !== closed) throw new Error('Unbalanced markup');
  }
}

export function parseHistory(html: string): History {
  // The answer repeats the swimmer list; without it, an empty page is a changed page, not "no results".
  if (!/<select\b[^>]*\bname\s*=\s*"nadador"/i.test(html)) throw new Error('Not the history page');
  requireBalanced(html, ['table', 'thead', 'tr', 'th', 'td']);
  const results: NormalizedResult[] = [];
  const seenTables = new Set<string>();
  const usedKeys = new Set<string>();

  for (const [, attributes, inside] of html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)) {
    const id = (attributeOf(attributes, 'id') ?? '').toLowerCase();
    const match = /^(\d+)([a-z])$/.exec(id);
    if (!match) continue; // Not an event table.
    const [, meters, letter] = match;
    if (!DISTANCES.has(meters) || !(letter in STROKE_BY_LETTER) || seenTables.has(id)) throw new Error('Unexpected table');
    seenTables.add(id);

    const head = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(inside);
    if (!head) throw new Error('No header');
    const headers = [...head[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(([, text]) => columnName(text));
    if (headers.join('|') !== COLUMNS.join('|')) throw new Error('Unexpected columns');

    for (const [, row] of inside.replace(head[0], '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, text]) => cellText(text));
      if (cells.length !== COLUMNS.length || /<th\b/i.test(row)) throw new Error('Unexpected row');
      // The category column can hint at the birth year, so it is never read.
      const [, time, , , date, pool, competition] = cells;
      const base = `${id}|${parsePool(pool)}|${parseDate(date)}|${time}|${competition}`;
      // The page has no row id: a repeated row gets a counter so keys stay unique.
      let sourceResultKey = base;
      for (let copy = 1; usedKeys.has(sourceResultKey); copy += 1) sourceResultKey = `${base}#${copy}`;
      usedKeys.add(sourceResultKey);
      results.push({
        sourceResultKey,
        stroke: STROKE_BY_LETTER[letter],
        distance: `${meters}m` as DistanceCode,
        pool: parsePool(pool),
        hundredths: parseTime(time),
        swumOn: parseDate(date),
        competition: competition === '' ? null : competition,
      });
    }
  }

  // The known structure shows no club or league, so only the years with results are listed (question 6 is open).
  const years = [...new Set(results.map((result) => Number(result.swumOn.slice(0, 4))))].sort();
  return { affiliations: years.length ? [{ club: null, league: null, years }] : [], results };
}
