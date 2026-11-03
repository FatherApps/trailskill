import type { Candidate, CandidateQuery, NormalizedResult, ResultsProvider } from '../port.ts';

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
