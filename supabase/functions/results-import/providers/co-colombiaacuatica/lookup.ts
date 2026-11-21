import { NoFileError, ProviderUnavailableError, SourceUnreachableError } from '../../port.ts';
import { searchLenex, type LenexSearch } from './lenex.ts';
import { TOO_LARGE, isRealDay, readBounded } from './shared.ts';
import { NOT_LENEX } from './xml.ts';
import { MAX_ZIP_BYTES, readSingleLef } from './zip.ts';

export const PROVIDER_KEY = 'co-colombiaacuatica';
// Approved by the maintainer: 30 s for the whole lookup, as for the federation.
export const TOTAL_TIMEOUT_MS = 30_000;

// The only host the server ever asks, an exact constant. Nothing else in the codebase writes this name.
const HOST = 'www.colombiaacuatica.com';
const FOLDER = new RegExp(`^https://${HOST.replaceAll('.', '\\.')}/backtun/torneos/(\\d{4})/(\\d{8})/(?:index\\.php)?$`);
/** The page that lists the tournaments of the year. */
export const INDEX_URL = `https://${HOST}/seccion/resultados`;
/** The PDF link of a row of that page, exactly: the key of the tournament is in its path. */
export const TOURNAMENT_PDF = new RegExp(`^https://${HOST.replaceAll('.', '\\.')}/backtun/torneos/resultados/pdf/(\\d{4})/(\\d{8})resultados\\.pdf$`);

const REJECTED = 'The tournament address is not one this provider accepts';
const REDIRECTS = 'The tournament address redirects';
const NO_ANSWER = 'The platform did not answer';

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The tournament folder of a pasted address: `https`, the exact host, no port, credentials, query or fragment, and a path of
 * the shape `/backtun/torneos/<YYYY>/<YYYYMMDD>/` (with or without `index.php`), the year being the date's own. The whole text
 * is matched, so nothing else gets through. The zip address is built here from the folder; the pasted one is never requested.
 */
export function tournamentFromUrl(raw: string): { tournament: string; zipUrl: string } {
  const [, year, date] = FOLDER.exec(raw.trim()) ?? [];
  return tournamentFromKey(Number(year), date ?? '');
}

/** A `YYYYMMDD` key of a day that exists, whose first four digits are the year. */
export const isTournamentKey = (year: number, dateKey: string) =>
  /^\d{8}$/.test(dateKey) && year === Number(dateKey.slice(0, 4)) && isRealDay(year, Number(dateKey.slice(4, 6)), Number(dateKey.slice(6)));

/** The same folder from a tournament of the list: its year and `YYYYMMDD` key, the year being the key's own. Anything else is as invalid as a bad address. */
export function tournamentFromKey(year: number, dateKey: string): { tournament: string; zipUrl: string } {
  if (!isTournamentKey(year, dateKey)) throw new ProviderUnavailableError(REJECTED);
  return { tournament: dateKey, zipUrl: `https://${HOST}/backtun/torneos/${year}/${dateKey}/resultados${dateKey}Lenex.zip` };
}

async function download(fetchImpl: FetchImpl, url: string, signal: AbortSignal, limit: number): Promise<Uint8Array> {
  // `manual`: a redirect is answered, never followed. A request that fails is a platform that did not answer.
  const response = await fetchImpl(url, { redirect: 'manual', signal }).catch(() => {
    throw new SourceUnreachableError();
  });
  const cancel = () => response.body?.cancel().catch(() => undefined);
  if (response.type === 'opaqueredirect' || response.status === 0 || (response.status >= 300 && response.status < 400)) {
    cancel();
    throw new ProviderUnavailableError(REDIRECTS);
  }
  if (response.status === 404) {
    cancel();
    throw new NoFileError();
  }
  if (response.status !== 200) {
    cancel();
    // A 5xx is the platform failing (retrying soon may work); any other status is an answer that will not change.
    throw response.status >= 500 ? new SourceUnreachableError() : new ProviderUnavailableError(NO_ANSWER);
  }
  if (Number(response.headers.get('content-length')) > limit) {
    cancel();
    throw new ProviderUnavailableError(TOO_LARGE);
  }
  return readBounded(response.body, limit);
}

/**
 * One GET with the rules every request to the platform follows: 30 s in all (`TOTAL_TIMEOUT_MS`), redirects answered and never followed,
 * a 404 and the size `limit` as typed "unavailable". Only a platform that did not answer is `SourceUnreachableError`. The deadline
 * covers the wait on the network only; what the caller does with the bytes has none.
 */
export async function fetchBounded(fetchImpl: FetchImpl, url: string, limit: number): Promise<Uint8Array> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SourceUnreachableError());
    }, TOTAL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([download(fetchImpl, url, controller.signal, limit), deadline]);
  } catch (error) {
    throw error instanceof ProviderUnavailableError ? error : new ProviderUnavailableError(NO_ANSWER);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * The tournament's results for one identity number: validates the address, downloads the zip in memory, reads its only `.lef`
 * and searches it. Any failure is a typed "unavailable" with a clear message and no cause, so no number can leak; only a platform
 * that did not answer (network, the total time, a 5xx) is `SourceUnreachableError`, whose claim the service gives back (#888).
 * Nothing is written to disk, cached or logged.
 */
export function createTournamentLookup(fetchImpl: FetchImpl = fetch) {
  function lookup(url: string, identityNumber: string): Promise<LenexSearch>;
  function lookup(year: number, dateKey: string, identityNumber: string): Promise<LenexSearch>;
  async function lookup(...args: [string, string] | [number, string, string]): Promise<LenexSearch> {
    const [{ tournament, zipUrl }, identityNumber] =
      typeof args[0] === 'number' ? [tournamentFromKey(args[0], args[1]), args[2]!] : [tournamentFromUrl(args[0]), args[1]];
    // The zip and the XML are parsed in one go, with no `await` a timer could cut in on, and bounded by the 10 MB and 20 MB caps
    // (under 0.5 s at the caps), so they have no deadline of their own (#901).
    try {
      const lef = await readSingleLef(await fetchBounded(fetchImpl, zipUrl, MAX_ZIP_BYTES));
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(lef);
      } catch {
        throw new ProviderUnavailableError(NOT_LENEX);
      }
      return searchLenex(text, tournament, identityNumber);
    } catch (error) {
      throw error instanceof ProviderUnavailableError ? error : new ProviderUnavailableError(NO_ANSWER);
    }
  }
  return lookup;
}
