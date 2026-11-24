import { NoFileError, ProviderUnavailableError, type TournamentEntry } from '../../port.ts';
import { fetchBounded, tournamentFromKey, tournamentPdfUrl } from './lookup.ts';
import { TOO_LARGE } from './shared.ts';
import { normalizeCity } from './tournaments.ts';
import { parseXml, type XmlNode } from './xml.ts';
import { MAX_ZIP_BYTES, readSingleLef } from './zip.ts';

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const spaces = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The name and city of the one `MEET` of a LENEX text, from its attributes only: no athlete, club or result node is ever read.
 * Null when the file is not a LENEX with one meet or the meet has no usable name or city: nothing is guessed.
 */
export function readMeet(text: string): { name: string; city: string } | null {
  let meet: XmlNode | undefined;
  try {
    const root = parseXml(text);
    const meets = root.name === 'LENEX' ? root.children.filter((child) => child.name === 'MEETS') : [];
    const found = meets.length === 1 ? meets[0].children.filter((child) => child.name === 'MEET') : [];
    meet = found.length === 1 ? found[0] : undefined;
  } catch {
    return null;
  }
  const name = spaces(meet?.attrs.name ?? '');
  const city = normalizeCity(meet?.attrs.city ?? '');
  return name !== '' && city !== '' ? { name, city } : null;
}

/** The meet of a zip's only `.lef`; null for anything it cannot vouch for (a corrupt zip, a file that is not LENEX). */
function meetOfZip(zip: Uint8Array): Promise<{ name: string; city: string } | null> {
  return readSingleLef(zip).then(
    (lef) => {
      try {
        return readMeet(new TextDecoder('utf-8', { fatal: true }).decode(lef));
      } catch {
        return null;
      }
    },
    (error) => {
      if (error instanceof ProviderUnavailableError) return null;
      throw error;
    },
  );
}

/**
 * `probeTournaments` of the adapter: for each day, in order and one request at a time, a HEAD of the day's Lenex zip. A 404 is no tournament;
 * a 200 gets one bounded GET of the zip and its meet read. Any other answer (a 4xx, a redirect, a 5xx, a timeout, a network failure) stops
 * the run at that day, which is `stoppedBy`; that day is not counted. A zip that cannot be read or has no usable name and city is counted
 * as found and left out.
 */
export function createTournamentProbe(fetchImpl: FetchImpl = fetch) {
  return async function probeTournaments(dateKeys: readonly string[]): Promise<{ probed: number; found: number; entries: TournamentEntry[]; stoppedBy?: string }> {
    const entries: TournamentEntry[] = [];
    let [probed, found] = [0, 0];
    for (const dateKey of dateKeys) {
      const year = Number(dateKey.slice(0, 4));
      const { zipUrl } = tournamentFromKey(year, dateKey);
      let meet: { name: string; city: string } | null = null;
      try {
        await fetchBounded(fetchImpl, zipUrl, Infinity, 'HEAD');
        try {
          meet = await meetOfZip(await fetchBounded(fetchImpl, zipUrl, MAX_ZIP_BYTES));
        } catch (error) {
          // The zip is not there any more or is too large: this day is left out. Anything else stops the run.
          if (!(error instanceof NoFileError || (error instanceof ProviderUnavailableError && error.message === TOO_LARGE))) throw error;
        }
        found += 1;
      } catch (error) {
        if (!(error instanceof NoFileError)) return { probed, found, entries, stoppedBy: dateKey };
      }
      probed += 1;
      if (meet) entries.push({ dateKey, year, name: meet.name, city: meet.city, discipline: 'SW', course: null, sourceUrl: tournamentPdfUrl(year, dateKey) });
    }
    return { probed, found, entries };
  };
}
