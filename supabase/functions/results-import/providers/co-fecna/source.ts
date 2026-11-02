import { fetchPage } from './fetchPage.ts';
import { EVENT_NUMBERS, parseProfile, parseRoster, parseRows } from './parse.ts';
import type { Source } from './provider.ts';

const FORM_URL = 'https://ecoapplet.co/fecna/reportes/historial';
const FILTER_URL = 'https://ecoapplet.co/fecna/reportes/historialFilter';
const eventUrl = (prueba: number) => `https://ecoapplet.co/fecna/reportes/${prueba}/getHistorial`;

// The import brings the whole history of the person, never the best time of each year: `anual=0`, never `anual=1`.
// ASSUMED, not verified with real rows: that getHistorial honours `anual=0` and a start date as old as this one.
const ANNUAL = '0';
const HISTORY_START = '2000-01-01';

// Decided by the maintainer: a third-party site, so never all 17 events at once and never one by one (it would not fit the 30 s).
export const MAX_IN_FLIGHT = 3;

const today = () => new Date().toISOString().slice(0, 10);

/** `run` over every item, at most `limit` at a time, in order. The first failure stops the rest from starting and fails the whole. */
async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await run(items[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

/**
 * One source per request: the cookie the form page sets and the swimmer list live only as long as this object.
 * The answer to the form is only the profile card and empty tables; the rows come from one `getHistorial` per event,
 * with the same cookie. If a single event fails, the whole history fails: an incomplete history would look complete.
 */
export function createHttpSource(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, now: () => string = today): Source {
  let cookie: string | null = null;
  return {
    async roster() {
      const page = await fetchPage(fetchImpl, FORM_URL);
      cookie = page.setCookie?.split(';')[0] ?? null;
      return parseRoster(page.body);
    },
    async history(entry, expired = () => false) {
      // The events carry no filter of their own: they answer for the session the POST set up. Without a cookie they would
      // answer empty, and an empty history must never be told apart from "no session".
      const session = cookie;
      if (!session) throw new Error('No session');
      const body = new URLSearchParams({ inicio: HISTORY_START, fin: now(), nadador: entry.value, anual: ANNUAL, prueba: '1' });
      const headers = { 'content-type': 'application/x-www-form-urlencoded', cookie: session };
      const { club, league } = parseProfile((await fetchPage(fetchImpl, FILTER_URL, { method: 'POST', headers, body })).body);

      const rows = await mapLimited(EVENT_NUMBERS, MAX_IN_FLIGHT, async (prueba) => {
        if (expired()) throw new Error('Out of time');
        return parseRows(prueba, (await fetchPage(fetchImpl, eventUrl(prueba), { headers: { cookie: session } })).body);
      });
      const results = rows.flat();
      const years = [...new Set(results.map((result) => Number(result.swumOn.slice(0, 4))))].sort();
      return { affiliations: years.length || club || league ? [{ club, league, years }] : [], results };
    },
  };
}
