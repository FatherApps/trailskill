import type { Candidate, CandidateQuery, NormalizedResult, ResultsProvider, TournamentAthlete, TournamentEntry, TournamentProvider } from '../port.ts';
import type { TournamentCatalog } from '../service.ts';

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

/** What the platform's `lookup` was given besides the number, in the order of the calls: the athlete as the server read them. */
export type PlatformAthleteCall = Omit<TournamentAthlete, 'identityNumber'>;

type PlatformOptions = {
  key?: string;
  accepts?: (url: string) => boolean;
  // Typed loosely so a test can make the "platform" return something invalid.
  search?: unknown;
  tournaments?: TournamentEntry[];
  failWith?: Error;
  /** Gives the platform a `probeTournaments`, answering whatever this returns (typed loosely, so a test can make it invalid). */
  probe?: (dateKeys: readonly string[]) => unknown;
};

/** A platform that has a tournament on `days` and is stopped (a 403, say) at `stopAt`: what `probeTournaments` answers, day by day. */
export function probing(days: Record<string, Partial<TournamentEntry>>, stopAt?: string) {
  return (dateKeys: readonly string[]) => {
    const result: { probed: number; found: number; entries: TournamentEntry[]; stoppedBy?: string } = { probed: 0, found: 0, entries: [] };
    for (const dateKey of dateKeys) {
      if (dateKey === stopAt) return { ...result, stoppedBy: dateKey };
      result.probed += 1;
      if (dateKey in days) {
        result.found += 1;
        result.entries.push(tournamentEntry(dateKey, days[dateKey]));
      }
    }
    return result;
  };
}

export function createFakePlatform(options: PlatformOptions = {}): TournamentProvider & { calls: PlatformCall[]; athleteCalls: PlatformAthleteCall[]; listCalls: number[][]; probeCalls: string[][]; setFailure(error: Error | undefined): void } {
  const calls: PlatformCall[] = [];
  const athleteCalls: PlatformAthleteCall[] = [];
  const listCalls: number[][] = [];
  const probeCalls: string[][] = [];
  let failWith = options.failWith;
  return {
    key: options.key ?? 'zz-games',
    calls,
    athleteCalls,
    listCalls,
    probeCalls,
    probeTournaments: options.probe && (async (dateKeys) => {
      probeCalls.push([...dateKeys]);
      return (await options.probe!(dateKeys)) as Awaited<ReturnType<NonNullable<TournamentProvider['probeTournaments']>>>;
    }),
    setFailure: (error) => void (failWith = error),
    accepts: options.accepts ?? ((url) => url.startsWith('https://games.example.test/')),
    async listTournaments(years) {
      listCalls.push([...years]);
      if (failWith) throw failWith;
      return (options.tournaments ?? []).filter((entry) => years.includes(entry.year));
    },
    async lookup(...args: [string, TournamentAthlete] | [number, string, TournamentAthlete]) {
      const athlete = (typeof args[0] === 'number' ? args[2] : args[1]) as TournamentAthlete;
      const { identityNumber, ...rest } = athlete;
      athleteCalls.push(rest);
      calls.push(typeof args[0] === 'number' ? { year: args[0], dateKey: args[1] as string, identityNumber } : { url: args[0], identityNumber });
      if (failWith) throw failWith;
      return (options.search ?? { found: false }) as Awaited<ReturnType<TournamentProvider['lookup']>>;
    },
  };
}

/**
 * The catalog as the database keeps it (`results_import_claim_tournament_refresh`, `_release_`, `_save_tournaments` and the table): one claim per
 * platform per interval that a release gives back only while nobody claimed since, and rows saved by (platform, day), the first of a day winning and a stored pool length kept.
 */
export function createFakeCatalog(now: () => number = Date.now) {
  const claimed = new Map<string, number>();
  const rows = new Map<string, TournamentEntry & { organizationId: string; refreshedAt: number }>();
  const claims: Parameters<TournamentCatalog['claim']>[0][] = [];
  const releases: Parameters<TournamentCatalog['release']>[0][] = [];
  let saveFailure: Error | undefined;
  let courseFailure: Error | undefined;
  const courseCalls: { organizationId: string; dateKey: string; course: string }[] = [];
  const catalog: TournamentCatalog = {
    async claim(request) {
      claims.push(request);
      const previous = claimed.get(request.organizationId);
      if (previous !== undefined && now() < previous + request.intervalMs) return { status: 'fresh', retryAt: new Date(previous + request.intervalMs).toISOString() };
      claimed.set(request.organizationId, now());
      return { status: 'allowed', claimedAt: String(now()) };
    },
    async release(request) {
      releases.push(request);
      if (claimed.get(request.organizationId) !== Number(request.claimedAt)) return false;
      claimed.set(request.organizationId, Number(request.claimedAt) - request.intervalMs + request.retryAfterMs);
      return true;
    },
    async save(organizationId, entries) {
      if (saveFailure) throw saveFailure;
      const days = new Set<string>();
      for (const entry of entries) {
        if (days.has(entry.dateKey)) continue;
        days.add(entry.dateKey);
        // As the upsert does: a pool length already stored is kept when the new read has none (`course = coalesce(t.course, excluded.course)`).
        const course = rows.get(`${organizationId}|${entry.dateKey}`)?.course ?? entry.course;
        rows.set(`${organizationId}|${entry.dateKey}`, { ...entry, course, organizationId, refreshedAt: now() });
      }
      return days.size;
    },
    async held(organizationId, year) {
      return [...rows.values()].filter((row) => row.organizationId === organizationId && row.year === year).map((row) => row.dateKey);
    },
    async find(dateKey) {
      return [...rows.values()].filter((row) => row.dateKey === dateKey).map(({ organizationId, year, course }) => ({ organizationId, year, course }));
    },
    async setCourse(organizationId, dateKey, course) {
      courseCalls.push({ organizationId, dateKey, course });
      if (courseFailure) throw courseFailure;
      const row = rows.get(`${organizationId}|${dateKey}`);
      // As the RPC does: only where the tournament has no length yet.
      if (!row || row.course !== null) return false;
      rows.set(`${organizationId}|${dateKey}`, { ...row, course });
      return true;
    },
  };
  return {
    catalog,
    claims,
    releases,
    rows: () => [...rows.values()],
    failSave: (error: Error | undefined) => void (saveFailure = error),
    courseCalls,
    failSetCourse: (error: Error | undefined) => void (courseFailure = error),
    // A tournament that is already in the catalog, as a refresh or a load of earlier years left it.
    seed: (organizationId: string, entry: TournamentEntry, refreshedAt = now()) => void rows.set(`${organizationId}|${entry.dateKey}`, { ...entry, organizationId, refreshedAt }),
  };
}

export const tournamentEntry = (dateKey: string, overrides: Partial<TournamentEntry> = {}): TournamentEntry => ({
  dateKey,
  year: Number(dateKey.slice(0, 4)),
  name: `Synthetic Open ${dateKey}`,
  city: 'Example City',
  discipline: 'SW',
  course: null,
  sourceUrl: `https://games.example.test/t/${dateKey}`,
  ...overrides,
});
