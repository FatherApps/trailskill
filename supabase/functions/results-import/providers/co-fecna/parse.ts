import type { Affiliation, NormalizedResult } from '../../port.ts';
import type { DistanceCode, PoolCode, StrokeCode } from '../../../../../src/core/sport/catalogs.ts';
import { cellText, decodeEntities, normalizeSpaces, UnknownEntityError } from './html.ts';

// The swimmer list and the profile card are read from the page's HTML with regular expressions; the rows come as JSON.
// Any shape this does not expect throws; the provider turns that into the typed "unavailable", so a changed page never
// yields a half-read result.

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

// The numbers of the page's `prueba` selector, with their stroke and distance (issue #80, comment 6581210025, question 3).
// The numbers in between (1, 8, 12, 16, 20) are not events of their own.
const EVENTS = {
  2: ['FR', '50m'], 3: ['FR', '100m'], 4: ['FR', '200m'], 5: ['FR', '400m'], 6: ['FR', '800m'], 7: ['FR', '1500m'],
  9: ['BK', '50m'], 10: ['BK', '100m'], 11: ['BK', '200m'],
  13: ['BR', '50m'], 14: ['BR', '100m'], 15: ['BR', '200m'],
  17: ['FL', '50m'], 18: ['FL', '100m'], 19: ['FL', '200m'],
  21: ['IM', '200m'], 22: ['IM', '400m'],
} as const satisfies Record<number, readonly [StrokeCode, DistanceCode]>;

/** The event numbers to ask `getHistorial` for, one request each. */
export const EVENT_NUMBERS: number[] = Object.keys(EVENTS).map(Number);

// The two-letter pool code of the source, as the sport catalog names it (long course 50 m, short course 25 m).
// Any other code is rejected: a pool is never guessed.
const POOL_BY_CODE: Record<string, PoolCode> = { LC: 'LCM', SC: 'SCM' };

const plain = (text: string) =>
  cellText(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export type Profile = { club: string | null; league: string | null };

/**
 * The profile card of the history page: `ul.nav > a.nav-link` with the label as text and the value in `span.badge`.
 * Only Club and Liga are read. The other labels (identity, gender, birth date) are skipped before their value is looked
 * at. A card without either of them is a changed page, never an empty affiliation; an empty badge is a missing value.
 */
export function parseProfile(html: string): Profile {
  // Without the swimmer list this is not the history page (a maintenance page may carry anything else).
  if (!/<select\b[^>]*\bname\s*=\s*"nadador"/i.test(html)) throw new Error('Not the history page');
  const values: Record<'club' | 'liga', string[]> = { club: [], liga: [] };
  for (const [, attributes, card] of html.matchAll(/<ul\b([^>]*)>([\s\S]*?)<\/ul>/gi)) {
    // Only a list classed `nav` is the card: a link with the same class elsewhere on the page is not.
    if (!(attributeOf(attributes, 'class') ?? '').split(/\s+/).includes('nav')) continue;
    for (const [, inside] of card.matchAll(/<a\b[^>]*\bnav-link\b[^>]*>([\s\S]*?)<\/a>/gi)) {
      const entry = /^([\s\S]*?)<span\b[^>]*\bbadge\b[^>]*>([\s\S]*?)<\/span>/i.exec(inside);
      if (!entry) continue;
      const label = plain(entry[1]);
      if (label === 'club' || label === 'liga') values[label].push(cellText(entry[2]));
    }
  }
  if (values.club.length !== 1 || values.liga.length !== 1) throw new Error('Unexpected profile card');
  return { club: values.club[0] || null, league: values.liga[0] || null };
}

const textOf = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Unexpected value');
  return value;
};

// Time: `hh:mm:ss.cc`. A missing time is an empty or null value, never 0.
function parseTime(value: unknown): number | null {
  if (value === null) return null;
  const text = textOf(value).trim();
  if (text === '') return null;
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{2})$/.exec(text);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) throw new Error('Unexpected time');
  const hundredths = ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 100 + Number(match[4]);
  if (hundredths === 0) throw new Error('Unexpected time');
  return hundredths;
}

// Date: `yyyy-mm-dd`, and a real day.
function parseDate(value: unknown): string {
  const text = textOf(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) throw new Error('Unexpected date');
  return text;
}

function parsePool(value: unknown): PoolCode {
  const code = textOf(value);
  if (!Object.hasOwn(POOL_BY_CODE, code)) throw new Error('Unexpected pool');
  return POOL_BY_CODE[code];
}

/**
 * The rows of one `reportes/<prueba>/getHistorial` answer: a JSON array, whatever content type it was served with.
 * Each result is rebuilt from the five fields it needs. Everything else in the row (category, difference, points,
 * gender, birth date, age) is never read, so it cannot reach the output.
 */
export function parseRows(prueba: number, body: string): NormalizedResult[] {
  if (!Object.hasOwn(EVENTS, prueba)) throw new Error('Unknown event');
  const [stroke, distance] = EVENTS[prueba as keyof typeof EVENTS];
  const rows: unknown = JSON.parse(body);
  if (!Array.isArray(rows)) throw new Error('Unexpected answer');

  // Keyed by `sourceResultKey`: rows that give the same key (event, pool, date, tournament, time) are one result; what differs elsewhere is never kept.
  const results = new Map<string, NormalizedResult>();
  for (const row of rows as unknown[]) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) throw new Error('Unexpected row');
    const fields = row as Record<string, unknown>;
    // A row of another event would put a time under the wrong stroke or distance.
    if (String(fields.prueba_id) !== String(prueba)) throw new Error('Unexpected event');
    const pool = parsePool(fields.piscina);
    const swumOn = parseDate(fields.fecha_torneo);
    const competition = fields.torneo === null ? null : normalizeSpaces(textOf(fields.torneo)) || null;
    const hundredths = parseTime(fields.tiempo);
    // The source has no row id. The key holds every field that is kept (the event gives stroke and distance), so rows
    // alike in all of them are one result, and it depends on the row's own text, never on its position. The tournament
    // is the one free text, in the middle: the codes and date before it and the digits after it keep the key unambiguous.
    const sourceResultKey = `${prueba}|${pool}|${swumOn}|${competition ?? ''}|${hundredths ?? ''}`;
    if (!results.has(sourceResultKey)) results.set(sourceResultKey, { sourceResultKey, stroke, distance, pool, hundredths, swumOn, competition });
  }
  return [...results.values()];
}
