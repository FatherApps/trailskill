import { fetchPage } from './fetchPage.ts';
import { parseHistory, parseRoster } from './parse.ts';
import type { Source } from './provider.ts';

const FORM_URL = 'https://ecoapplet.co/fecna/reportes/historial';
const FILTER_URL = 'https://ecoapplet.co/fecna/reportes/historialFilter';

// ASSUMED, pending the maintainer: the oldest date with data is unconfirmed; the page answered 200 to this one.
const HISTORY_START = '2000-01-01';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * One source per request: the cookie the form page sets and the swimmer list live only as long as this object.
 * `anual=0` asks for every row, not the best time of each year; `prueba=1` asks for every event.
 */
export function createHttpSource(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, now: () => string = today): Source {
  let cookie: string | null = null;
  return {
    async roster() {
      const page = await fetchPage(fetchImpl, FORM_URL);
      cookie = page.setCookie?.split(';')[0] ?? null;
      return parseRoster(page.body);
    },
    async history(entry) {
      const body = new URLSearchParams({ inicio: HISTORY_START, fin: now(), nadador: entry.value, anual: '0', prueba: '1' });
      const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
      if (cookie) headers.cookie = cookie;
      return parseHistory((await fetchPage(fetchImpl, FILTER_URL, { method: 'POST', headers, body })).body);
    },
  };
}
