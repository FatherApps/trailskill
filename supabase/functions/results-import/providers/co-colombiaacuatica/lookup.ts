import { ProviderUnavailableError, SourceUnreachableError } from '../../port.ts';
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

const REJECTED = 'The tournament address is not one this provider accepts';
const NO_FILE = 'The tournament has no published results file';
const REDIRECTS = 'The tournament address redirects';
const NO_ANSWER = 'The platform did not answer';

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The tournament folder of a pasted address: `https`, the exact host, no port, credentials, query or fragment, and a path of
 * the shape `/backtun/torneos/<YYYY>/<YYYYMMDD>/` (with or without `index.php`), the year being the date's own. The whole text
 * is matched, so nothing else gets through. The zip address is built here from the folder; the pasted one is never requested.
 */
export function tournamentFromUrl(raw: string): { tournament: string; zipUrl: string } {
  const match = FOLDER.exec(raw.trim());
  const [, year, date] = match ?? [];
  if (!match || year !== date.slice(0, 4) || !isRealDay(Number(year), Number(date.slice(4, 6)), Number(date.slice(6)))) {
    throw new ProviderUnavailableError(REJECTED);
  }
  return { tournament: date, zipUrl: `https://${HOST}/backtun/torneos/${year}/${date}/resultados${date}Lenex.zip` };
}

async function download(fetchImpl: FetchImpl, url: string, signal: AbortSignal): Promise<Uint8Array> {
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
    throw new ProviderUnavailableError(NO_FILE);
  }
  if (response.status !== 200) {
    cancel();
    // A 5xx is the platform failing (retrying soon may work); any other status is an answer that will not change.
    throw response.status >= 500 ? new SourceUnreachableError() : new ProviderUnavailableError(NO_ANSWER);
  }
  if (Number(response.headers.get('content-length')) > MAX_ZIP_BYTES) {
    cancel();
    throw new ProviderUnavailableError(TOO_LARGE);
  }
  return readBounded(response.body, MAX_ZIP_BYTES);
}

/**
 * The tournament's results for one identity number: validates the address, downloads the zip in memory, reads its only `.lef`
 * and searches it. Any failure is a typed "unavailable" with a clear message and no cause, so no number can leak; only a platform
 * that did not answer (network, the total time, a 5xx) is `SourceUnreachableError`, whose claim the service gives back (#888).
 * Nothing is written to disk, cached or logged.
 */
export function createTournamentLookup(fetchImpl: FetchImpl = fetch) {
  return async function lookup(url: string, identityNumber: string): Promise<LenexSearch> {
    const { tournament, zipUrl } = tournamentFromUrl(url);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new SourceUnreachableError());
      }, TOTAL_TIMEOUT_MS);
    });
    // The deadline is for the wait on the network. The zip and the XML are parsed in one go, with no `await` a timer could cut in on,
    // and bounded by the 10 MB and 20 MB caps (under 0.5 s at the caps), so they have no deadline of their own (#901).
    try {
      const zip = await Promise.race([download(fetchImpl, zipUrl, controller.signal), deadline]);
      const lef = await readSingleLef(zip);
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(lef);
      } catch {
        throw new ProviderUnavailableError(NOT_LENEX);
      }
      return searchLenex(text, tournament, identityNumber);
    } catch (error) {
      throw error instanceof ProviderUnavailableError ? error : new ProviderUnavailableError(NO_ANSWER);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
}
