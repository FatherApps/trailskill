import type { TournamentEntry } from '../../supabase/functions/results-import/port.ts';
import { tournamentPdfUrl } from '../../supabase/functions/results-import/providers/co-colombiaacuatica/lookup.ts';
import { LENEX_DISCIPLINE, fetchMeetHeader, keysFromUrls } from '../../supabase/functions/results-import/providers/co-colombiaacuatica/meet.ts';
import { normalizeCityName } from '../../supabase/functions/results-import/providers/co-colombiaacuatica/tournaments.ts';

// The logic of `build-tournament-seed.ts`, apart from Deno and the file system so it can be tested with a fake fetch and a fake clock.
// A manual tool: it never runs in the app or in CI. Every address, host and rule of the platform comes from its adapter.

export const SEED_YEARS = [2024, 2025] as const;
/** The least time between the end of one request and the start of the next. */
export const MIN_GAP_MS = 2000;
/** Says what this is and nothing about who runs it. */
export const USER_AGENT = 'swimcro-tournament-catalog-builder/1 (manual run, one request at a time)';

/** A tournament some source without athletes names (a news piece, a calendar page): `url` is any address of that tournament. */
export type Named = { url: string; name: string; city: string; discipline: string };
export type Sources = { urls: readonly string[]; named?: readonly Named[] };
export type Unresolved = { dateKey: string; reason: 'conflict' | 'no_header' };
export type Deps = {
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Called once per request with `<date_key> <HTTP status>`, and with nothing else. */
  log: (line: string) => void;
};

const spaces = (text: string) => text.replace(/\s+/g, ' ').trim();
const sameRow = (a: TournamentEntry, b: TournamentEntry) => a.name === b.name && a.city === b.city && a.discipline === b.discipline && a.sourceUrl === b.sourceUrl;

/**
 * The catalog of 2024 and 2025 from the keys of the known addresses. For each day key, in this order:
 * 1. sources without athletes that name it (complete ones only): when they all say the same, that is the row; when two differ the key is
 *    `conflict`, because the key is the date alone and two tournaments of one day cannot both have it;
 * 2. a row the file already had, kept as it is and never asked again;
 * 3. the MEET header of the tournament's own file, read in memory and dropped: name and city only.
 * A key that none of those resolves is left out and reported, never guessed. One request at a time, `MIN_GAP_MS` apart.
 */
export async function buildSeed(sources: Sources, existing: readonly TournamentEntry[], { fetchImpl, now, sleep, log }: Deps) {
  const inRange = (year: number) => (SEED_YEARS as readonly number[]).includes(year);
  const had = new Map(existing.filter((row) => inRange(row.year)).map((row) => [row.dateKey, row]));

  const namedByKey = new Map<string, Map<string, Named>>();
  for (const source of sources.named ?? []) {
    const [key] = keysFromUrls([source.url]);
    const [name, city, discipline] = [spaces(source.name), normalizeCityName(source.city), spaces(source.discipline)];
    if (!key || !name || !city || !discipline) continue;
    const variants = namedByKey.get(key.dateKey) ?? new Map<string, Named>();
    variants.set(`${name}|${city}|${discipline}`.toLowerCase(), { url: source.url, name, city, discipline });
    namedByKey.set(key.dateKey, variants);
  }

  let last = Number.NEGATIVE_INFINITY;
  const throttled = (dateKey: string) => async (address: string, init?: RequestInit) => {
    const wait = last + MIN_GAP_MS - now();
    if (wait > 0) await sleep(wait);
    let status = 'error';
    try {
      const response = await fetchImpl(address, { ...init, headers: { 'user-agent': USER_AGENT } });
      status = String(response.status);
      return response;
    } finally {
      last = now();
      log(`${dateKey} ${status}`);
    }
  };

  const keys = keysFromUrls([...sources.urls, ...(sources.named ?? []).map((source) => source.url)]).filter((key) => inRange(key.year));
  const rows = new Map(had);
  const unresolved: Unresolved[] = [];
  const changed: TournamentEntry[] = [];
  for (const { year, dateKey } of keys) {
    const variants = [...(namedByKey.get(dateKey)?.values() ?? [])];
    let row: TournamentEntry | undefined;
    if (variants.length > 1) {
      rows.delete(dateKey);
      unresolved.push({ dateKey, reason: 'conflict' });
      continue;
    }
    if (variants.length === 1) {
      row = { dateKey, year, name: variants[0].name, city: variants[0].city, discipline: variants[0].discipline, course: null, sourceUrl: tournamentPdfUrl(year, dateKey) };
    } else if (!had.has(dateKey)) {
      try {
        const header = await fetchMeetHeader(throttled(dateKey), year, dateKey);
        row = { dateKey, year, ...header, discipline: LENEX_DISCIPLINE, course: null, sourceUrl: tournamentPdfUrl(year, dateKey) };
      } catch {
        unresolved.push({ dateKey, reason: 'no_header' });
        continue;
      }
    }
    if (row) {
      const before = had.get(dateKey);
      if (before && !sameRow(before, row)) changed.push(row);
      rows.set(dateKey, row);
    }
  }

  const sorted = [...rows.values()].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  unresolved.sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  const coverage = Object.fromEntries(
    SEED_YEARS.map((year) => [year, { resolved: sorted.filter((row) => row.year === year).length, unresolved: unresolved.filter((item) => Number(item.dateKey.slice(0, 4)) === year).length }]),
  );
  return { rows: sorted, added: sorted.filter((row) => !had.has(row.dateKey)), changed, unresolved, coverage };
}
