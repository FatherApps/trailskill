import { BirthDateRequiredError, NoFileError, ProviderUnavailableError, SourceUnreachableError, type TournamentAthlete } from '../../port.ts';
import { searchLenex, type LenexSearch } from './lenex.ts';
import { searchPdf } from './pdfMatch.ts';
import { readPdfLines, type OpenPdf } from './pdfLines.ts';
import { parsePdfResults } from './pdfResults.ts';
import { TOO_LARGE, isRealDay, plain, readBounded } from './shared.ts';
import { openWithUnpdf } from './unpdf.ts';
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
/** The calendar of the platform: the tournaments of every year, with the organizer, and sometimes the pool length, in the title. */
export const CALENDAR_URL = `https://${HOST}/seccion/calendario`;
/** The PDF link of a row of that page or of an event of the calendar, exactly: the key of the tournament is in its path. The host is case-insensitive, as a host is: the calendar writes it with capitals. */
export const TOURNAMENT_PDF = new RegExp(`^https://${HOST.replaceAll('.', '\\.')}/backtun/torneos/resultados/pdf/(\\d{4})/(\\d{8})resultados\\.pdf$`, 'i');

/** The most the server downloads of a tournament's results PDF. The real ones are a few hundred KB. */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
/** The platform answers a tournament without results with a PDF of exactly this size (a page that says the document was not generated). */
export const FILLER_PDF_BYTES = 41477;
const FILLER_TEXT = 'el documento solicitado no ha sido generado';

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

/** The PDF address of a tournament of the list, the shape `TOURNAMENT_PDF` reads: what the catalog keeps as the tournament's source. */
export const tournamentPdfUrl = (year: number, dateKey: string) => `https://${HOST}/backtun/torneos/resultados/pdf/${year}/${dateKey}resultados.pdf`;

/** A `YYYYMMDD` key of a day that exists, whose first four digits are the year. */
export const isTournamentKey = (year: number, dateKey: string) =>
  /^\d{8}$/.test(dateKey) && year === Number(dateKey.slice(0, 4)) && isRealDay(year, Number(dateKey.slice(4, 6)), Number(dateKey.slice(6)));

/** The same folder from a tournament of the list: its year and `YYYYMMDD` key, the year being the key's own. Anything else is as invalid as a bad address. */
export function tournamentFromKey(year: number, dateKey: string): { tournament: string; zipUrl: string } {
  if (!isTournamentKey(year, dateKey)) throw new ProviderUnavailableError(REJECTED);
  return { tournament: dateKey, zipUrl: `https://${HOST}/backtun/torneos/${year}/${dateKey}/resultados${dateKey}Lenex.zip` };
}

async function download(fetchImpl: FetchImpl, url: string, signal: AbortSignal, limit: number, method: 'GET' | 'HEAD'): Promise<Uint8Array> {
  // `manual`: a redirect is answered, never followed. A request that fails is a platform that did not answer.
  const response = await fetchImpl(url, { ...(method === 'GET' ? {} : { method }), redirect: 'manual', signal }).catch(() => {
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
export async function fetchBounded(fetchImpl: FetchImpl, url: string, limit: number, method: 'GET' | 'HEAD' = 'GET'): Promise<Uint8Array> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SourceUnreachableError());
    }, TOTAL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([download(fetchImpl, url, controller.signal, limit, method), deadline]);
  } catch (error) {
    throw error instanceof ProviderUnavailableError ? error : new ProviderUnavailableError(NO_ANSWER);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * The tournament's results for one athlete: validates the address, downloads the zip in memory, reads its only `.lef`
 * and searches it by the identity number. A tournament with no zip (a 404) falls back to its results PDF, built from the tournament's own key
 * and read the same way (5 MB, the same total time, no redirects): the athlete is found there by name and birth date (`searchPdf`), and one with no
 * birth date is `BirthDateRequiredError`. A tournament with neither is `NoFileError`. Any failure is a typed "unavailable" with a clear message and
 * no cause, so no number can leak; only a platform that did not answer (network, the total time, a 5xx) is `SourceUnreachableError`, whose claim
 * the service gives back (#888). Nothing is written to disk, cached or logged. `openPdf` opens a PDF (unpdf; tests give their own).
 */
export function createTournamentLookup(fetchImpl: FetchImpl = fetch, openPdf: OpenPdf = openWithUnpdf) {
  function lookup(url: string, athlete: TournamentAthlete): Promise<LenexSearch>;
  function lookup(year: number, dateKey: string, athlete: TournamentAthlete): Promise<LenexSearch>;
  async function lookup(...args: [string, TournamentAthlete] | [number, string, TournamentAthlete]): Promise<LenexSearch> {
    const [{ tournament, zipUrl }, athlete] = typeof args[0] === 'number' ? [tournamentFromKey(args[0], args[1] as string), args[2]!] : [tournamentFromUrl(args[0]), args[1] as TournamentAthlete];
    // The zip and the XML are parsed in one go, with no `await` a timer could cut in on, and bounded by the 10 MB and 20 MB caps
    // (under 0.5 s at the caps), so they have no deadline of their own (#901).
    try {
      let zip: Uint8Array;
      try {
        zip = await fetchBounded(fetchImpl, zipUrl, MAX_ZIP_BYTES);
      } catch (error) {
        if (error instanceof NoFileError) return await lookupPdf(Number(tournament.slice(0, 4)), tournament, athlete);
        throw error;
      }
      const lef = await readSingleLef(zip);
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(lef);
      } catch {
        throw new ProviderUnavailableError(NOT_LENEX);
      }
      return searchLenex(text, tournament, athlete.identityNumber);
    } catch (error) {
      throw error instanceof ProviderUnavailableError ? error : new ProviderUnavailableError(NO_ANSWER);
    }
  }
  // The PDF is downloaded under the same rules as the zip. Its extraction runs after the network deadline and is bounded by the size, page and text caps.
  async function lookupPdf(year: number, tournament: string, athlete: TournamentAthlete): Promise<LenexSearch> {
    const pdf = await fetchBounded(fetchImpl, tournamentPdfUrl(year, tournament), MAX_PDF_BYTES);
    if (pdf.length === FILLER_PDF_BYTES) throw new NoFileError();
    const { birthDate } = athlete;
    if (birthDate === null) throw new BirthDateRequiredError();
    const lines = await readPdfLines(openPdf, pdf);
    if (lines.some((line) => plain(line).includes(FILLER_TEXT))) throw new NoFileError();
    return searchPdf(parsePdfResults(lines, tournament), tournament, { ...athlete, birthDate });
  }
  return lookup;
}
