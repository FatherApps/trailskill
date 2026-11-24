import { isDistance, type DistanceCode, type PoolCode, type StrokeCode } from '../../../../../src/core/sport/catalogs.ts';
import { CELL_SEPARATOR } from './pdfLines.ts';
import { courseFromTitle, isRealDay, plain, unavailable } from './shared.ts';

// The text of a tournament's results PDF as `readPdfLines` gives it: one line per row of the page, its cells joined with a tab. Pure: no network, no PDF.
// The layout (read once from a real file, never kept): each page repeats a header of three lines (organizer, tournament and year, «20 - 21 de <mes> de 2026»);
// an event is «<n> <dist>m <ES>/<dist>m <EN> Men|Women» (a continued event repeats it, with the Age Group, at the top of the next page); then «Age Group: <category> | m|f»,
// the columns «Place Birth Ht Ln Team Points Name Prelim Time Obsv.» and one row per swimmer: Place (empty for a swimmer with no time), Birth YYMMDD, Ht, Ln,
// Team «Liga/Club», Points (not every row), Name «SURNAMES Names», Prelim, Time, Obsv. Anything it does not know of a row is `ProviderUnavailableError`, never a silent skip.

/** One swimmer's row of an individual event whose stroke and distance are in the catalogs. The birth date and the name stay in the adapter. */
export type PdfRow = {
  eventNumber: number;
  stroke: StrokeCode;
  distance: DistanceCode;
  /** The sex of the event (Men or Women). */
  gender: 'F' | 'M';
  /** 1-based, among the age groups of the event, and the row's position in its age group. */
  ageGroupIndex: number;
  rowIndex: number;
  heat: number;
  lane: number;
  /** YYMMDD as printed. */
  birth: string;
  /** As printed: «SURNAMES Names». */
  name: string;
  club: string | null;
  /** Null for N.T., DQ, No Show, DNF and a zero time: a missing time, never 0. */
  hundredths: number | null;
};

export type ParsedPdf = {
  /** The tournament's name line of the page header, if the header was found. */
  competition: string | null;
  /** First day of the tournament (`yyyy-mm-dd`): the header's, else the day of the tournament's key. */
  swumOn: string;
  /** The pool length the header states in so many words, if it says exactly one. */
  course: PoolCode | null;
  rows: PdfRow[];
};

const MONTHS: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
// «20 - 21 de noviembre de 2026», «30 de noviembre - 1 de diciembre de 2026» and «20 de noviembre de 2026».
const DATE_RANGE = /^(\d{1,2})\s*-\s*\d{1,2}\s+de\s+(\p{L}+)\s+de\s+(\d{4})$/u;
const DATE_ACROSS = /^(\d{1,2})\s+de\s+(\p{L}+)\s*-\s*\d{1,2}\s+de\s+\p{L}+\s+de\s+(\d{4})$/u;
const DATE_ONE = /^(\d{1,2})\s+de\s+(\p{L}+)\s+de\s+(\d{4})$/u;

// Individual events: «<n> <dist>m <ES>/<dist>m <EN> Men|Women». Anything else that looks like an event (relays «4x50m», mixed) is one to skip.
const EVENT = /(\d+)\s+(\d+)m\s+([^/|]+?)\s*\/\s*\d+m\s+([^|]+?)\s+(Men|Women)\b/;
const OTHER_EVENT = /(\d+)\s+(?:\d+x)?\d+m\s[^|]*\/[^|]*\b(?:Men|Women|Mixed)\b/;
const AGE_GROUP = /Age Group:\s*([^|]*?)\s*\|\s*[mfMF]\b/;

const STROKE_BY_SPANISH: Record<string, StrokeCode> = { libre: 'FR', espalda: 'BK', pecho: 'BR', mariposa: 'FL', combinado: 'IM' };
const STROKE_BY_ENGLISH: Record<string, StrokeCode> = {
  free: 'FR', freestyle: 'FR', back: 'BK', backstroke: 'BK', breast: 'BR', breaststroke: 'BR', fly: 'FL', butterfly: 'FL', im: 'IM', medley: 'IM', 'individual medley': 'IM',
};

const TIME = /^(?:(\d{1,2}):)?(\d{1,2})\.(\d{2})$/;
const STATUS = /^(?:N\.?T\.?|DQ|DNF|DNS|NS|No Show)$/i;
const isTimed = (cell: string) => TIME.test(cell) || STATUS.test(cell);

const UNREADABLE = 'A row of the tournament PDF is not in the shape this reader knows';

function hundredthsOf(cell: string): number | null {
  const match = TIME.exec(cell);
  if (!match) return null;
  const [minutes, seconds, cents] = [Number(match[1] ?? 0), Number(match[2]), Number(match[3])];
  if (seconds > 59) return unavailable(UNREADABLE);
  const total = (minutes * 60 + seconds) * 100 + cents;
  return total === 0 ? null : total;
}

function dateOf(lines: readonly string[]): string | null {
  for (const text of lines) {
    const [, day, month, year] = DATE_RANGE.exec(text) ?? DATE_ACROSS.exec(text) ?? DATE_ONE.exec(text) ?? [];
    const number = MONTHS[plain(month ?? '')];
    if (day !== undefined && number !== undefined && isRealDay(Number(year), number, Number(day))) {
      return `${year}-${String(number).padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  return null;
}

type Event = { number: number; stroke: StrokeCode; distance: DistanceCode; gender: 'F' | 'M' } | 'skipped';

function eventOf(text: string): { number: number; event: Event } | null {
  const full = EVENT.exec(text);
  if (full) {
    const [, number, distance, spanish, english, sex] = full;
    const stroke = STROKE_BY_SPANISH[plain(spanish).split(' ')[0]] ?? STROKE_BY_ENGLISH[plain(english)] ?? STROKE_BY_ENGLISH[plain(english).split(' ')[0]];
    const code = `${Number(distance)}m`;
    return { number: Number(number), event: stroke && isDistance(code) ? { number: Number(number), stroke, distance: code, gender: sex === 'Men' ? 'M' : 'F' } : 'skipped' };
  }
  const other = OTHER_EVENT.exec(text);
  return other ? { number: Number(other[1]), event: 'skipped' } : null;
}

/**
 * Reads the whole text of a tournament's results PDF. `dateKey` (`YYYYMMDD`) is the tournament's own key, the day used when the header has none.
 * Throws `ProviderUnavailableError` when no event is found (a format this does not know) or a row of an individual event cannot be read.
 */
export function parsePdfResults(lines: readonly string[], dateKey: string): ParsedPdf {
  const cellsOf = lines.map((line) => line.split(CELL_SEPARATOR));
  const texts = cellsOf.map((cells) => cells.join(' ').replace(/\s+/g, ' ').trim());
  const first = texts.findIndex((text) => eventOf(text) !== null);
  if (first < 0) return unavailable('The tournament PDF has no event this reader knows');

  // The header is read from what comes before the first event: the date line, with the tournament's name right above it.
  const before = texts.slice(0, first);
  const dateAt = before.findLastIndex((text) => dateOf([text]) !== null);
  const swumOn = (dateAt >= 0 ? dateOf([before[dateAt]]) : null) ?? `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6)}`;
  const competition = dateAt > 0 ? before[dateAt - 1] || null : null;
  // Only a header that says exactly one pool length counts; an address or an e-mail (a footer) is never read for it.
  const stated = new Set(before.filter((text) => !text.includes('@')).map(courseFromTitle).filter((course) => course !== null));
  const course = stated.size === 1 ? [...stated][0] : null;

  const rows: PdfRow[] = [];
  let event: Event | null = null;
  let eventNumber = -1;
  let ageGroup: string | null = null;
  let ageGroupIndex = 0;
  let rowIndex = 0;
  texts.forEach((text, at) => {
    const found = eventOf(text);
    // An event continued on the next page repeats its header: the same number is the same event, with its age group counting on.
    if (found && found.number !== eventNumber) {
      [event, eventNumber, ageGroup, ageGroupIndex, rowIndex] = [found.event, found.number, null, 0, 0];
    }
    const age = AGE_GROUP.exec(text);
    if (age && age[1] !== ageGroup) [ageGroup, ageGroupIndex, rowIndex] = [age[1], ageGroupIndex + 1, 0];
    if (found || age || event === null || event === 'skipped') return;

    const cells = cellsOf[at].map((cell) => cell.trim());
    const place = /^\d{1,3}$/.test(cells[0]) && /^\d{6}$/.test(cells[1] ?? '') ? 1 : 0;
    const birth = cells[place];
    if (!/^\d{6}$/.test(birth ?? '')) return; // The column titles, a footer: not a row.
    const [month, day] = [Number(birth.slice(2, 4)), Number(birth.slice(4))];
    if (ageGroup === null || month < 1 || month > 12 || day < 1 || day > 31) return unavailable(UNREADABLE);

    let next = place + 1;
    const hasLetters = (cell: string | undefined): cell is string => cell !== undefined && /\p{L}/u.test(cell) && !isTimed(cell);
    // Heat and lane come together, or neither.
    const lead: string[] = [];
    while (lead.length < 2 && /^\d{1,3}$/.test(cells[next] ?? '')) lead.push(cells[next++]);
    if (lead.length === 1) return unavailable(UNREADABLE);
    const team = cells[next++];
    if (!hasLetters(team)) return unavailable(UNREADABLE);
    if (/^\d{1,4}$/.test(cells[next] ?? '')) next += 1; // Points: not in every row.
    const name = cells[next++];
    if (!hasLetters(name)) return unavailable(UNREADABLE);
    // Prelim and Time come next (one or both), then the observation, if any: the swimmer's time is the last of those. What follows them is one text cell at most,
    // and never one that looks like a time (a time written another way is not read as an observation).
    const tail = cells.slice(next);
    const timed = tail.findIndex((cell) => !isTimed(cell));
    const count = timed < 0 ? tail.length : timed;
    const rest = tail.slice(count);
    if (count < 1 || count > 2 || rest.length > 1 || rest.some((cell) => /^[\d:.,]+$/.test(cell))) return unavailable(UNREADABLE);

    rowIndex += 1;
    rows.push({
      eventNumber: event.number,
      stroke: event.stroke,
      distance: event.distance,
      gender: event.gender,
      ageGroupIndex,
      rowIndex,
      heat: Number(lead[0] ?? 0),
      lane: Number(lead[1] ?? 0),
      birth,
      name: name.replace(/\s+/g, ' '),
      club: team.slice(team.indexOf('/') + 1).trim() || null,
      hundredths: hundredthsOf(tail[count - 1]),
    });
  });
  return { competition, swumOn, course, rows };
}
