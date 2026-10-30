import {
  ProviderUnavailableError,
  type Affiliation,
  type Candidate,
  type CandidateQuery,
  type NormalizedResult,
  type ResultsProvider,
} from '../../port.ts';

// The worker's proposal, pending maintainer review: more homonyms than this is "unavailable", never a silent cut.
export const MAX_CANDIDATES = 5;
// Approved by the maintainer: 30 s for a whole search (each request has its own 10 s in fetchText).
export const SEARCH_TIMEOUT_MS = 30_000;

export type RosterEntry = { key: string; name: string };
export type History = { name: string; affiliations: Affiliation[]; results: NormalizedResult[] };

/** What the page gives, already parsed. Each call is one request to the source; it throws on any failure or change of shape. */
export interface Source {
  roster(): Promise<RosterEntry[]>;
  history(identityNumber: string): Promise<History>;
}

// Case, accents, extra spaces and word order ignored (docs/research/results-import.md, identity rule 2).
const words = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

// Every word of the first and last names must appear in the source's name, in any order.
const matches = (wanted: string[], sourceName: string) => {
  const present = new Set(words(sourceName));
  return wanted.length > 0 && wanted.every((word) => present.has(word));
};

const toCandidate = (sourceAthleteKey: string, { name, affiliations, results }: History): Candidate => ({
  sourceAthleteKey,
  name,
  affiliations,
  resultCount: results.length,
});

// Rebuilt with only the declared fields, so anything else the parser let through (an idNumber, a birthDate) stays inside.
const toResult = ({ sourceResultKey, stroke, distance, pool, hundredths, swumOn, competition }: NormalizedResult): NormalizedResult => ({
  sourceResultKey,
  stroke,
  distance,
  pool,
  hundredths,
  swumOn,
  competition,
});

export function createCoFecnaProvider(source: Source): ResultsProvider {
  // Any failure is the same typed error with no cause; nothing is logged, so no number or name can leak.
  // `expired` stops a search from asking for more once the total time is over.
  async function guarded<T>(call: (expired: () => boolean) => Promise<T>): Promise<T> {
    let over = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        over = true;
        reject(new ProviderUnavailableError());
      }, SEARCH_TIMEOUT_MS);
    });
    try {
      return await Promise.race([call(() => over), deadline]);
    } catch {
      throw new ProviderUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    key: 'co-fecna',

    findCandidates: ({ firstName, lastName, identityNumber }: CandidateQuery) =>
      guarded(async (expired) => {
        if (identityNumber !== null) return [toCandidate(identityNumber, await source.history(identityNumber))];
        const wanted = words(`${firstName} ${lastName}`);
        const found = (await source.roster()).filter((entry) => matches(wanted, entry.name));
        if (found.length > MAX_CANDIDATES) throw new ProviderUnavailableError();
        // One athlete at a time, in order, never in parallel.
        const candidates: Candidate[] = [];
        for (const { key } of found) {
          if (expired()) throw new ProviderUnavailableError();
          candidates.push(toCandidate(key, await source.history(key)));
        }
        return candidates;
      }),

    fetchResults: (sourceAthleteKey: string) =>
      guarded(async () => (await source.history(sourceAthleteKey)).results.map(toResult)),
  };
}
