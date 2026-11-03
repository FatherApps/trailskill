import {
  ProviderUnavailableError,
  type Candidate,
  type CandidateQuery,
  type NormalizedResult,
  type ResultsProvider,
} from '../../port.ts';
import { normalizeNumber, type History, type RosterEntry, type RosterItem } from './parse.ts';

export type { History, RosterEntry, RosterItem };

// The worker's proposal, pending maintainer review: more homonyms than this is "unavailable", never a silent cut.
export const MAX_CANDIDATES = 5;
// Approved by the maintainer: 30 s for a whole search (each request has its own 10 s in fetchPage).
export const SEARCH_TIMEOUT_MS = 30_000;

/** What the page gives, already parsed. Each call is one request to the source; it throws on any failure or change of shape. */
export interface Source {
  roster(signal?: AbortSignal): Promise<RosterItem[]>;
  history(entry: RosterEntry, signal?: AbortSignal): Promise<History>;
}

const isUnreadable = (entry: RosterItem): entry is Exclude<RosterItem, RosterEntry> => 'unreadable' in entry;

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

// The identity comes from the list entry: the page's own heading can show someone else, so it is never read.
const toCandidate = ({ key, name }: RosterEntry, { affiliations, results }: History): Candidate => ({
  sourceAthleteKey: key,
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

/**
 * `open` gives a fresh source for each call, so the swimmer list and the session cookie live only as long as that request.
 * Nothing is cached, logged or kept.
 */
export function createCoFecnaProvider(open: () => Source): ResultsProvider {
  // Any failure is the same typed error with no cause; nothing is logged, so no number or name can leak.
  // One signal for the whole search, aborted when the total time is over: whatever is in flight stops, and nothing new is asked.
  async function guarded<T>(call: (source: Source, signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderUnavailableError());
      }, SEARCH_TIMEOUT_MS);
    });
    try {
      return await Promise.race([call(open(), controller.signal), deadline]);
    } catch {
      throw new ProviderUnavailableError();
    } finally {
      clearTimeout(timer);
      // On a failure too: requests the source still has running (parallel events) stop with it.
      controller.abort();
    }
  }

  // Every history goes through here, so no path asks the source for more once the total time is over.
  function historyOf(source: Source, entry: RosterEntry, signal: AbortSignal): Promise<History> {
    if (signal.aborted) throw new ProviderUnavailableError();
    return source.history(entry, signal);
  }

  // The number must be one of the list's options, or there is no match and no history is asked for.
  async function lookup(source: Source, identityNumber: string, signal: AbortSignal): Promise<RosterEntry | null> {
    let key: string;
    try {
      key = normalizeNumber(identityNumber);
    } catch {
      return null;
    }
    const roster = await source.roster(signal);
    const found = roster.filter((entry) => entry.key === key);
    if (found.length > 1) throw new ProviderUnavailableError(); // Two entries share the number: the identity is ambiguous.
    // An unreadable entry with this number, or one without a key that may have been it, cannot be ruled out: never "no match".
    if (found.some(isUnreadable) || (found.length === 0 && roster.some((entry) => isUnreadable(entry) && entry.key === null))) {
      throw new ProviderUnavailableError();
    }
    return (found[0] as RosterEntry | undefined) ?? null;
  }

  return {
    key: 'co-fecna',

    findCandidates: ({ firstName, lastName, identityNumber }: CandidateQuery) =>
      guarded(async (source, signal) => {
        if (identityNumber !== null) {
          const entry = await lookup(source, identityNumber, signal);
          return entry ? [toCandidate(entry, await historyOf(source, entry, signal))] : [];
        }
        const wanted = words(`${firstName} ${lastName}`);
        const roster = await source.roster(signal);
        const found = roster.filter((entry): entry is RosterEntry => !isUnreadable(entry) && matches(wanted, entry.name));
        // Nobody found while an entry could not be read: that entry may be the person, so "no match" would mislead.
        if (found.length === 0 && roster.some(isUnreadable)) throw new ProviderUnavailableError();
        if (found.length > MAX_CANDIDATES || new Set(found.map((entry) => entry.key)).size !== found.length) {
          throw new ProviderUnavailableError();
        }
        // One athlete at a time, in order, never in parallel.
        const candidates: Candidate[] = [];
        for (const entry of found) {
          candidates.push(toCandidate(entry, await historyOf(source, entry, signal)));
        }
        return candidates;
      }),

    // A number that is not in the list cannot be confirmed: that is unavailable, never an empty history.
    fetchResults: (sourceAthleteKey: string) =>
      guarded(async (source, signal) => {
        const entry = await lookup(source, sourceAthleteKey, signal);
        if (!entry) throw new ProviderUnavailableError();
        return (await historyOf(source, entry, signal)).results.map(toResult);
      }),
  };
}
