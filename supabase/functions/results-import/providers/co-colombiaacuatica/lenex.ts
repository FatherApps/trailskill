import { ProviderUnavailableError, type NormalizedResult, type TournamentSearch } from '../../port.ts';
import { isDistance, isPool, type DistanceCode, type PoolCode, type StrokeCode } from '../../../../../src/core/sport/catalogs.ts';
import { keyHasNumber, normalizeNumber } from '../../identityNumber.ts';
import { isRealDay } from './shared.ts';
import { bad, parseXml, type XmlNode } from './xml.ts';

export type LenexSearch = TournamentSearch;

const STROKES: Readonly<Record<string, StrokeCode>> = { FREE: 'FR', BACK: 'BK', BREAST: 'BR', FLY: 'FL', MEDLEY: 'IM' };
const PLAIN_ID = /^[A-Za-z0-9_-]{1,40}$/;

const kids = (node: XmlNode, name: string) => node.children.filter((child) => child.name === name);
const only = (node: XmlNode, name: string): XmlNode => {
  const found = kids(node, name);
  return found.length === 1 ? found[0] : bad();
};
// A container that may be missing (a relay-only club has no ATHLETES, an athlete may have no RESULTS): its children, or none.
const childrenOf = (node: XmlNode, name: string): XmlNode[] => {
  const containers = kids(node, name);
  return containers.length > 1 ? bad() : (containers[0]?.children ?? []);
};
const spaces = (text: string) => text.replace(/\s+/g, ' ').trim();

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

type EventInfo = { swumOn: string; stroke: StrokeCode; distance: DistanceCode; pool: PoolCode } | 'skipped';

// The course a node declares, on itself or on its POOL children: undefined when it declares none; the pool when all it declares is one
// recognized course; null otherwise (an unknown value, or two different ones), because a course is never guessed.
function courseOf(node: XmlNode): PoolCode | null | undefined {
  const declared = [node.attrs.course, ...kids(node, 'POOL').map((pool) => pool.attrs.course)].filter((course) => course !== undefined);
  if (declared.length === 0) return undefined;
  return declared.every((course) => course === declared[0]) && isPool(declared[0]) ? declared[0] : null;
}

// Full individual swims whose stroke, distance and course are in the catalogs; relays, any non-empty `technique` and anything else are skipped, never normalized.
// The course is the session's own, or else the meet's (`MEET@course` or `MEET/POOL`). An unknown course of a session leaves out its rows;
// no course declared, or an unknown one for the whole meet, is not a file this reader knows.
function readEvents(meet: XmlNode): Map<string, EventInfo> {
  const events = new Map<string, EventInfo>();
  for (const session of kids(only(meet, 'SESSIONS'), 'SESSION')) {
    const swumOn = parseDate(session.attrs.date);
    const own = courseOf(session);
    const pool = own === undefined ? courseOf(meet) : own;
    if (pool === undefined || (own === undefined && pool === null)) return bad();
    for (const event of kids(only(session, 'EVENTS'), 'EVENT')) {
      const id = event.attrs.eventid === undefined ? undefined : spaces(event.attrs.eventid);
      if (id === undefined || events.has(id)) return bad();
      const style = only(event, 'SWIMSTYLE').attrs;
      const stroke = style.stroke !== undefined && Object.hasOwn(STROKES, style.stroke) ? STROKES[style.stroke] : null;
      const distance = `${style.distance}m`;
      const individual = (style.relaycount ?? '1') === '1';
      const fullSwim = (style.technique ?? '') === ''; // KICK, PULL, DRILL, REGULAR or any other value is not a full swim
      events.set(id, individual && fullSwim && stroke && pool && isDistance(distance) ? { swumOn, stroke, distance, pool } : 'skipped');
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
  const competition = spaces(meet.attrs.name ?? '') || null;
  const events = readEvents(meet);

  let wanted: string;
  try {
    wanted = normalizeNumber(identityNumber);
  } catch {
    return { found: false };
  }
  const matches: { athlete: XmlNode; club: XmlNode }[] = [];
  let unreadable = false;
  // No license is no claim of identity (many minors have none), so that athlete cannot be the person: left out in both paths.
  // A license that is there but unreadable may be the person written badly: doubt, so "unavailable" in both paths.
  for (const club of kids(only(meet, 'CLUBS'), 'CLUB')) {
    for (const athlete of childrenOf(club, 'ATHLETES').filter((child) => child.name === 'ATHLETE')) {
      const license = spaces(athlete.attrs.license ?? '');
      if (license === '') continue;
      try {
        if (normalizeNumber(license) === wanted) matches.push({ athlete, club });
      } catch {
        unreadable = true;
      }
    }
  }
  if (unreadable) throw new ProviderUnavailableError('The tournament file has participants with an unreadable license, so the person cannot be ruled out');
  if (matches.length > 1) bad(); // The license names two people: the identity is ambiguous.
  if (matches.length === 0) return { found: false };

  const { athlete, club } = matches[0];
  const name = spaces(`${athlete.attrs.firstname ?? ''} ${athlete.attrs.lastname ?? ''}`) || bad();
  const results = new Map<string, NormalizedResult>();
  for (const result of childrenOf(athlete, 'RESULTS').filter((child) => child.name === 'RESULT')) {
    const event = result.attrs.eventid === undefined ? undefined : events.get(spaces(result.attrs.eventid));
    if (!event || result.attrs.resultid === undefined) return bad();
    if (event === 'skipped') continue;
    const eventid = spaces(result.attrs.eventid as string);
    const resultid = spaces(result.attrs.resultid);
    if (!PLAIN_ID.test(eventid) || !PLAIN_ID.test(resultid)) continue; // only this row is left out: its id cannot go into a key
    const sourceResultKey = `${tournament}|${eventid}|${resultid}`;
    if (results.has(sourceResultKey)) return bad();
    if (keyHasNumber(sourceResultKey, identityNumber)) {
      throw new ProviderUnavailableError('A result key of the tournament file would be the identity number');
    }
    const hundredths = result.attrs.status ? null : parseTime(result.attrs.swimtime);
    results.set(sourceResultKey, { sourceResultKey, stroke: event.stroke, distance: event.distance, pool: event.pool, hundredths, swumOn: event.swumOn, competition });
  }
  return { found: true, athlete: { name, club: spaces(club.attrs.name ?? '') || null }, results: [...results.values()] };
}
