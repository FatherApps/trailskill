import { ProviderUnavailableError, type NormalizedResult } from '../../port.ts';
import { isDistance, isPool, type DistanceCode, type PoolCode, type StrokeCode } from '../../../../../src/core/sport/catalogs.ts';
import { normalizeNumber } from '../co-fecna/parse.ts';
import { NOT_LENEX, parseXml, type XmlNode } from './xml.ts';

export type LenexSearch = { found: false } | { found: true; athlete: { name: string; club: string | null }; results: NormalizedResult[] };

const STROKES: Readonly<Record<string, StrokeCode>> = { FREE: 'FR', BACK: 'BK', BREAST: 'BR', FLY: 'FL', MEDLEY: 'IM' };
const PLAIN_ID = /^[A-Za-z0-9_-]{1,40}$/;

const bad = (): never => {
  throw new ProviderUnavailableError(NOT_LENEX);
};

const kids = (node: XmlNode, name: string) => node.children.filter((child) => child.name === name);
const only = (node: XmlNode, name: string): XmlNode => {
  const found = kids(node, name);
  return found.length === 1 ? found[0] : bad();
};
const spaces = (text: string) => text.replace(/\s+/g, ' ').trim();

/** A day that exists (no 30 February, no month 13), from its three numbers. */
export function isRealDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseDate(value: string | undefined): string {
  const match = value === undefined ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match && isRealDay(Number(match[1]), Number(match[2]), Number(match[3])) ? (value as string) : bad();
}

// `hh:mm:ss.cc`, exact hundredths. A missing or zero time is null, never 0.
function parseTime(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return bad();
  const hundredths = ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 100 + Number(match[4]);
  return hundredths === 0 ? null : hundredths;
}

type EventInfo = { swumOn: string; stroke: StrokeCode; distance: DistanceCode } | 'skipped';

// Individual events whose stroke and distance are in the catalogs; relays and anything else are skipped, never normalized.
function readEvents(meet: XmlNode): Map<string, EventInfo> {
  const events = new Map<string, EventInfo>();
  for (const session of kids(only(meet, 'SESSIONS'), 'SESSION')) {
    const swumOn = parseDate(session.attrs.date);
    for (const event of kids(only(session, 'EVENTS'), 'EVENT')) {
      const id = event.attrs.eventid;
      if (id === undefined || events.has(id)) return bad();
      const style = only(event, 'SWIMSTYLE').attrs;
      const stroke = style.stroke !== undefined && Object.hasOwn(STROKES, style.stroke) ? STROKES[style.stroke] : null;
      const distance = `${style.distance}m`;
      const individual = (style.relaycount ?? '1') === '1';
      events.set(id, individual && stroke && isDistance(distance) ? { swumOn, stroke, distance } : 'skipped');
    }
  }
  return events;
}

/**
 * The rows of the one athlete whose `license` is the identity number (both normalized), from the text of a LENEX file.
 * `tournament` is the folder of the tournament in its URL and goes into every key; the license never does.
 * Only the athlete's name and club and the declared result fields come out: the birth date and every other participant stay inside.
 */
export function searchLenex(text: string, tournament: string, identityNumber: string): LenexSearch {
  const root = parseXml(text);
  if (root.name !== 'LENEX') bad();
  const meet = only(only(root, 'MEETS'), 'MEET');
  const pool = isPool(meet.attrs.course) ? (meet.attrs.course as PoolCode) : bad();
  const competition = spaces(meet.attrs.name ?? '') || null;
  const events = readEvents(meet);

  let wanted: string;
  try {
    wanted = normalizeNumber(identityNumber);
  } catch {
    return { found: false };
  }
  const matches: { athlete: XmlNode; club: XmlNode }[] = [];
  for (const club of kids(only(meet, 'CLUBS'), 'CLUB')) {
    for (const athlete of kids(only(club, 'ATHLETES'), 'ATHLETE')) {
      try {
        if (normalizeNumber(athlete.attrs.license ?? '') === wanted) matches.push({ athlete, club });
      } catch {
        // No readable license: it cannot be the number we look for.
      }
    }
  }
  if (matches.length > 1) bad(); // The license names two people: the identity is ambiguous.
  if (matches.length === 0) return { found: false };

  const { athlete, club } = matches[0];
  const name = spaces(`${athlete.attrs.firstname ?? ''} ${athlete.attrs.lastname ?? ''}`) || bad();
  const results = new Map<string, NormalizedResult>();
  for (const result of kids(only(athlete, 'RESULTS'), 'RESULT')) {
    const { eventid, resultid } = result.attrs;
    const event = eventid === undefined ? undefined : events.get(eventid);
    if (!event || resultid === undefined) return bad();
    if (event === 'skipped') continue;
    if (!PLAIN_ID.test(eventid as string) || !PLAIN_ID.test(resultid)) return bad();
    const sourceResultKey = `${tournament}|${eventid}|${resultid}`;
    // The service refuses keys with the identity number: so does this, before it gets there.
    if (results.has(sourceResultKey) || sourceResultKey.toUpperCase().includes(wanted)) return bad();
    const hundredths = result.attrs.status ? null : parseTime(result.attrs.swimtime);
    results.set(sourceResultKey, { sourceResultKey, stroke: event.stroke, distance: event.distance, pool, hundredths, swumOn: event.swumOn, competition });
  }
  return { found: true, athlete: { name, club: spaces(club.attrs.name ?? '') || null }, results: [...results.values()] };
}
