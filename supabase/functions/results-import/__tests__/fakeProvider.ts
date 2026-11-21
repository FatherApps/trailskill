import type { Candidate, CandidateQuery, NormalizedResult, ResultsProvider, TournamentEntry, TournamentProvider } from '../port.ts';

export type FakeCall =
  | { method: 'findCandidates'; argument: CandidateQuery }
  | { method: 'fetchResults'; argument: string };

type FakeOptions = {
  key?: string;
  // Typed loosely so a test can make the "source" return something invalid.
  candidates?: unknown[];
  results?: unknown[];
  failWith?: Error;
};

export function createFakeProvider(options: FakeOptions = {}): ResultsProvider & { calls: FakeCall[]; setFailure(error: Error | undefined): void } {
  const calls: FakeCall[] = [];
  let failWith = options.failWith;
  const answer = async <T>(value: unknown[] | undefined): Promise<T[]> => {
    if (failWith) throw failWith;
    return (value ?? []) as T[];
  };
  return {
    key: options.key ?? 'zz-test',
    calls,
    // Lets a test make the "source" fail first and answer later.
    setFailure: (error) => void (failWith = error),
    async findCandidates(query) {
      calls.push({ method: 'findCandidates', argument: query });
      return answer<Candidate>(options.candidates);
    },
    async fetchResults(sourceAthleteKey) {
      calls.push({ method: 'fetchResults', argument: sourceAthleteKey });
      return answer<NormalizedResult>(options.results);
    },
  };
}

export const TOURNAMENT_URL = 'https://games.example.test/tournament/1';

// `url` is the pasted address; `year` and `dateKey` are the tournament of the list.
export type PlatformCall = { url: string; identityNumber: string } | { year: number; dateKey: string; identityNumber: string };

type PlatformOptions = {
  key?: string;
  accepts?: (url: string) => boolean;
  // Typed loosely so a test can make the "platform" return something invalid.
  search?: unknown;
  tournaments?: TournamentEntry[];
  failWith?: Error;
};

export function createFakePlatform(options: PlatformOptions = {}): TournamentProvider & { calls: PlatformCall[]; setFailure(error: Error | undefined): void } {
  const calls: PlatformCall[] = [];
  let failWith = options.failWith;
  return {
    key: options.key ?? 'zz-games',
    calls,
    setFailure: (error) => void (failWith = error),
    accepts: options.accepts ?? ((url) => url.startsWith('https://games.example.test/')),
    async listTournaments(year) {
      if (failWith) throw failWith;
      return (options.tournaments ?? []).filter((entry) => entry.year === year);
    },
    async lookup(...args: [string, string] | [number, string, string]) {
      calls.push(typeof args[0] === 'number' ? { year: args[0], dateKey: args[1], identityNumber: args[2]! } : { url: args[0], identityNumber: args[1] });
      if (failWith) throw failWith;
      return (options.search ?? { found: false }) as Awaited<ReturnType<TournamentProvider['lookup']>>;
    },
  };
}
