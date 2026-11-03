import { ProviderUnavailableError, SourceUnreachableError } from '../../../port.ts';
import type { History, RosterEntry, RosterItem } from '../parse.ts';
import { MAX_CANDIDATES, SEARCH_TIMEOUT_MS, createCoFecnaProvider as create, type Source } from '../provider.ts';

const createCoFecnaProvider = (source: Source) => create(() => source);

const NUMBER = '0000000000';
const OTHER = '1111111111';
const NAME = 'PEREZ GOMEZ ANA MARIA';

const entry = (key: string, name = NAME): RosterEntry => ({ key, name, value: ` ${key}` });

const history = (resultCount = 1): History => ({
  affiliations: [{ club: null, league: null, years: [2025, 2026] }],
  results: Array.from({ length: resultCount }, (_, index) => ({
    sourceResultKey: `r-${index}`,
    stroke: 'FR' as const,
    distance: '50m' as const,
    pool: 'LCM' as const,
    hundredths: 2890,
    swumOn: '2026-03-14',
    competition: 'Synthetic Open',
  })),
});

function createFakeSource(options: { roster?: RosterItem[]; histories?: Record<string, History>; failWith?: Error } = {}) {
  const calls: string[] = [];
  const source: Source = {
    async roster() {
      calls.push('roster');
      if (options.failWith) throw options.failWith;
      return options.roster ?? [];
    },
    async history({ key }) {
      calls.push(`history:${key}`);
      if (options.failWith) throw options.failWith;
      const found = options.histories?.[key];
      if (!found) throw new Error(`no history for ${key}`);
      return found;
    },
  };
  return { source, calls };
}

const query = { firstName: 'Ana María', lastName: 'Pérez Gómez', identityNumber: null };
const homonyms = (count: number) => Array.from({ length: count }, (_, index) => entry(`${index}`.padStart(10, '0')));
const historiesOf = (roster: RosterEntry[]) => Object.fromEntries(roster.map(({ key }) => [key, history()]));

describe('co-fecna provider', () => {
  it('uses the key the registry expects', () => {
    expect(createCoFecnaProvider(createFakeSource().source).key).toBe('co-fecna');
  });

  describe('findCandidates with an identity number', () => {
    it('finds the number among the list options and asks only for that history', async () => {
      const { source, calls } = createFakeSource({ roster: [entry(OTHER, 'RUIZ LEON JUAN'), entry(NUMBER)], histories: { [NUMBER]: history(3) } });
      const candidates = await createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER });
      expect(calls).toEqual(['roster', `history:${NUMBER}`]);
      expect(candidates).toEqual([
        { sourceAthleteKey: NUMBER, name: NAME, affiliations: [{ club: null, league: null, years: [2025, 2026] }], resultCount: 3 },
      ]);
    });

    it('compares the normalized number: dots, hyphens, spaces and case do not matter', async () => {
      const { source } = createFakeSource({ roster: [entry('AB1234')], histories: { AB1234: history() } });
      const candidates = await createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: 'ab-12.34' });
      expect(candidates.map((candidate) => candidate.sourceAthleteKey)).toEqual(['AB1234']);
    });

    it('answers no match and asks for no history when the number is not among the options', async () => {
      const { source, calls } = createFakeSource({ roster: [entry(OTHER)], histories: historiesOf([entry(OTHER)]) });
      expect(await createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER })).toEqual([]);
      expect(calls).toEqual(['roster']);
    });

    it('answers no match without touching the source when the number cannot be a source number', async () => {
      const { source, calls } = createFakeSource({ roster: [entry(OTHER)] });
      expect(await createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: 'not/a/number' })).toEqual([]);
      expect(calls).toEqual([]);
    });

    it('is unavailable when two options share the normalized number', async () => {
      const { source } = createFakeSource({ roster: [entry('1234'), { ...entry('1234'), value: '123-4' }], histories: { '1234': history() } });
      await expect(createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: '1234' })).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });
  });

  describe('findCandidates without an identity number', () => {
    it('matches by name ignoring case, accents, spacing and word order, and returns candidates only', async () => {
      const { source, calls } = createFakeSource({
        roster: [entry(NUMBER, '  pérez  gómez ANA maría '), entry(OTHER, 'RUIZ LEON JUAN')],
        histories: { [NUMBER]: history(2) },
      });
      const candidates = await createCoFecnaProvider(source).findCandidates(query);
      expect(calls).toEqual(['roster', `history:${NUMBER}`]);
      expect(candidates.map(({ sourceAthleteKey, name, resultCount }) => ({ sourceAthleteKey, name, resultCount }))).toEqual([
        { sourceAthleteKey: NUMBER, name: '  pérez  gómez ANA maría ', resultCount: 2 },
      ]);
    });

    it('requires every word of the first and last names, and allows extra words in the source', async () => {
      const roster = [entry(NUMBER, 'PEREZ GOMEZ ANA MARIA LUCIA'), entry(OTHER, 'PEREZ ANA MARIA')];
      const { source } = createFakeSource({ roster, histories: historiesOf(roster) });
      const candidates = await createCoFecnaProvider(source).findCandidates(query);
      expect(candidates.map((candidate) => candidate.sourceAthleteKey)).toEqual([NUMBER]);
    });

    it('returns an empty list, without asking for any history, when nobody matches', async () => {
      const { source, calls } = createFakeSource({ roster: [entry(NUMBER)] });
      expect(await createCoFecnaProvider(source).findCandidates({ ...query, lastName: 'Nadie' })).toEqual([]);
      expect(calls).toEqual(['roster']);
    });

    it('returns every homonym, up to the limit', async () => {
      const roster = homonyms(MAX_CANDIDATES);
      const { source } = createFakeSource({ roster, histories: historiesOf(roster) });
      const candidates = await createCoFecnaProvider(source).findCandidates(query);
      expect(candidates.map((candidate) => candidate.sourceAthleteKey)).toEqual(roster.map(({ key }) => key));
    });

    it('is unavailable, not truncated, when more than the limit match, and asks for no history', async () => {
      const { source, calls } = createFakeSource({ roster: homonyms(MAX_CANDIDATES + 1) });
      await expect(createCoFecnaProvider(source).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
      expect(calls).toEqual(['roster']);
    });

    it('is unavailable when two matches share a number', async () => {
      const { source } = createFakeSource({ roster: [entry(NUMBER), entry(NUMBER)], histories: { [NUMBER]: history() } });
      await expect(createCoFecnaProvider(source).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
    });
  });

  describe('fetchResults', () => {
    it('returns the normalized results of the reference found among the options', async () => {
      const { source, calls } = createFakeSource({ roster: [entry(NUMBER)], histories: { [NUMBER]: history(2) } });
      const results = await createCoFecnaProvider(source).fetchResults(NUMBER);
      expect(calls).toEqual(['roster', `history:${NUMBER}`]);
      expect(results.map((result) => result.sourceResultKey)).toEqual(['r-0', 'r-1']);
    });

    it('is unavailable, with no history asked for, when the reference is not among the options', async () => {
      const { source, calls } = createFakeSource({ roster: [entry(OTHER)], histories: historiesOf([entry(OTHER)]) });
      await expect(createCoFecnaProvider(source).fetchResults(NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
      expect(calls).toEqual(['roster']);
    });

    it('returns nothing but the declared result fields', async () => {
      const dirty = history();
      Object.assign(dirty.results[0], { idNumber: NUMBER, birthDate: '2014-05-01' });
      const { source } = createFakeSource({ roster: [entry(NUMBER)], histories: { [NUMBER]: dirty } });
      const [result] = await createCoFecnaProvider(source).fetchResults(NUMBER);
      expect(Object.keys(result).sort()).toEqual(['competition', 'distance', 'hundredths', 'pool', 'sourceResultKey', 'stroke', 'swumOn']);
    });
  });

  it('opens a fresh source for every call, so nothing outlives the request', async () => {
    const open = jest.fn(() => createFakeSource({ roster: [entry(NUMBER)], histories: { [NUMBER]: history() } }).source);
    const provider = create(open);
    await provider.findCandidates(query);
    await provider.fetchResults(NUMBER);
    expect(open).toHaveBeenCalledTimes(2);
  });

  describe('when the source fails or changes shape', () => {
    const calls = {
      'findCandidates by number': (provider: ReturnType<typeof createCoFecnaProvider>) =>
        provider.findCandidates({ ...query, identityNumber: NUMBER }),
      'findCandidates by name': (provider: ReturnType<typeof createCoFecnaProvider>) => provider.findCandidates(query),
      fetchResults: (provider: ReturnType<typeof createCoFecnaProvider>) => provider.fetchResults(NUMBER),
    };

    it.each(Object.keys(calls) as (keyof typeof calls)[])('%s throws the typed unavailable error without the cause or the number', async (name) => {
      const { source } = createFakeSource({ failWith: new Error(`parse failed near ${NUMBER}`) });
      const error = await calls[name](createCoFecnaProvider(source)).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProviderUnavailableError);
      expect((error as Error).message).not.toContain(NUMBER);
      expect((error as Error).cause).toBeUndefined();
    });

    it('is unavailable when the history of one candidate fails', async () => {
      const { source } = createFakeSource({ roster: [entry(NUMBER)], histories: {} });
      await expect(createCoFecnaProvider(source).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
    });
  });

  // Only a source that did not answer (network, timeout, 5xx) is `SourceUnreachableError`: that is the one failure where trying again soon can work.
  describe('which failures say the source could not be reached', () => {
    const entries = homonyms(2);
    const runs: Record<string, (provider: ReturnType<typeof createCoFecnaProvider>) => Promise<unknown>> = {
      'findCandidates by number': (provider) => provider.findCandidates({ ...query, identityNumber: NUMBER }),
      'findCandidates by name': (provider) => provider.findCandidates(query),
      fetchResults: (provider) => provider.fetchResults(NUMBER),
    };

    it.each(Object.keys(runs))('%s passes on that the source could not be reached', async (name) => {
      const { source } = createFakeSource({ failWith: new SourceUnreachableError() });
      expect(await runs[name](createCoFecnaProvider(source)).catch((caught: unknown) => caught)).toBeInstanceOf(SourceUnreachableError);
    });

    it.each([
      ['a shape change', new Error('No swimmer list')],
      ['a typed error that is not about reaching the source', new ProviderUnavailableError('HTTP 403')],
    ])('%s is unavailable but not unreachable', async (_name, failWith) => {
      const { source } = createFakeSource({ failWith });
      const error = await createCoFecnaProvider(source).fetchResults(NUMBER).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProviderUnavailableError);
      expect(error).not.toBeInstanceOf(SourceUnreachableError);
    });

    it.each([
      ['more than the limit of namesakes', () => createFakeSource({ roster: homonyms(MAX_CANDIDATES + 1) }), runs['findCandidates by name']],
      ['two matches that share a number', () => createFakeSource({ roster: [entries[0], entries[0]] }), runs['findCandidates by name']],
      ['two options that share the number', () => createFakeSource({ roster: [entry(NUMBER), { ...entry(NUMBER), value: `-${NUMBER}` }] }), runs['findCandidates by number']],
      ['a number that is not in the list', () => createFakeSource({ roster: [entry(OTHER)] }), runs.fetchResults],
      ['an unreadable roster entry', () => createFakeSource({ roster: [entry(OTHER), { unreadable: true, value: null, key: null }] }), runs['findCandidates by name']],
    ])('%s is unavailable but not unreachable', async (_name, build, run) => {
      const error = await run(createCoFecnaProvider(build().source)).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProviderUnavailableError);
      expect(error).not.toBeInstanceOf(SourceUnreachableError);
    });
  });

  describe('the total time of a search', () => {
    afterEach(() => jest.useRealTimers());

    it('hands the source one signal that aborts when the total time is over, so a history in flight is cancelled', async () => {
      jest.useFakeTimers();
      let signal: AbortSignal | undefined;
      const source: Source = {
        roster: async () => [entry(NUMBER)],
        history: (_entry, shared) => {
          signal = shared;
          return new Promise(() => undefined);
        },
      };
      const pending = createCoFecnaProvider(source).fetchResults(NUMBER).catch((caught: unknown) => caught);
      await jest.advanceTimersByTimeAsync(1);
      expect(signal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS);
      expect(signal?.aborted).toBe(true);
      expect(await pending).toBeInstanceOf(SourceUnreachableError);
    });

    it('also aborts the swimmer list request when the total time is over', async () => {
      jest.useFakeTimers();
      let signal: AbortSignal | undefined;
      const source: Source = {
        roster: (shared) => {
          signal = shared;
          return new Promise(() => undefined);
        },
        history: async () => history(),
      };
      const pending = createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER }).catch((caught: unknown) => caught);
      await jest.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS + 1);
      expect(signal?.aborted).toBe(true);
      expect(await pending).toBeInstanceOf(SourceUnreachableError);
    });

    it.each([
      ['by identity number', (provider: ReturnType<typeof create>) => provider.findCandidates({ ...query, identityNumber: NUMBER })],
      ['to fetch results', (provider: ReturnType<typeof create>) => provider.fetchResults(NUMBER)],
    ])('is unavailable, and asks for no history, when the list only answers after the time is over (%s)', async (_label, run) => {
      jest.useFakeTimers();
      const asked: string[] = [];
      const source: Source = {
        roster: () => new Promise((resolve) => setTimeout(() => resolve([entry(NUMBER)]), SEARCH_TIMEOUT_MS + 1_000)),
        history: async ({ key }) => {
          asked.push(key);
          return history();
        },
      };
      const pending = run(createCoFecnaProvider(source)).catch((caught: unknown) => caught);
      await jest.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS + 5_000);
      expect(await pending).toBeInstanceOf(SourceUnreachableError);
      expect(asked).toEqual([]);
    });

    it('asks for one history at a time, never in parallel', async () => {
      let running = 0;
      let peak = 0;
      const source: Source = {
        roster: async () => homonyms(2),
        history: async () => {
          peak = Math.max(peak, ++running);
          await Promise.resolve();
          running -= 1;
          return history();
        },
      };
      await createCoFecnaProvider(source).findCandidates(query);
      expect(peak).toBe(1);
    });

    it('is unavailable after 30 seconds, even if a history is still running, and asks for no more', async () => {
      jest.useFakeTimers();
      const asked: string[] = [];
      const source: Source = {
        roster: async () => homonyms(2),
        history: ({ key }) => {
          asked.push(key);
          return new Promise((resolve) => setTimeout(() => resolve(history()), SEARCH_TIMEOUT_MS + 1_000));
        },
      };
      const pending = createCoFecnaProvider(source).findCandidates(query).catch((caught: unknown) => caught);
      await jest.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS + 5_000);
      expect(await pending).toBeInstanceOf(SourceUnreachableError);
      expect(asked).toEqual(['0000000000']);
    });
  });

  it('logs nothing, on success or failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => {}));
    const ok = createFakeSource({ roster: [entry(NUMBER)], histories: { [NUMBER]: history() } });
    await createCoFecnaProvider(ok.source).findCandidates(query);
    await createCoFecnaProvider(ok.source).fetchResults(NUMBER);
    await createCoFecnaProvider(createFakeSource({ failWith: new Error(NUMBER) }).source).fetchResults(NUMBER).catch(() => undefined);
    spies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});

describe('co-fecna provider with unreadable roster entries', () => {
  const unreadable = (key: string | null): RosterItem => ({ unreadable: true, value: key, key });
  const unavailable = (promise: Promise<unknown>) => expect(promise).rejects.toBeInstanceOf(ProviderUnavailableError);

  it('is unavailable when the number matches an unreadable entry', async () => {
    const { source, calls } = createFakeSource({ roster: [unreadable(NUMBER), entry(OTHER)], histories: historiesOf([entry(OTHER)]) });
    await unavailable(createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER }));
    expect(calls).toEqual(['roster']);
  });

  it('is unavailable when a name search finds nobody and the list has an unreadable entry', async () => {
    const { source } = createFakeSource({ roster: [unreadable(OTHER), entry(NUMBER, 'RUIZ LEON JUAN')] });
    await unavailable(createCoFecnaProvider(source).findCandidates(query));
  });

  it('is unavailable when a number search finds nobody and an unreadable entry has no key', async () => {
    const { source } = createFakeSource({ roster: [unreadable(null), entry(OTHER)] });
    await unavailable(createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER }));
  });

  it('keeps answering "no match" for a number when the unreadable entries all have another key', async () => {
    const { source } = createFakeSource({ roster: [unreadable(OTHER), entry('2222222222')] });
    expect(await createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER })).toEqual([]);
  });

  // #830: an unreadable entry may be the person, and linking the wrong person cannot be undone: unavailable, match or not.
  it('is unavailable when a name search has a readable match and the list has an unreadable entry, and asks for no history', async () => {
    const roster = [unreadable(OTHER), entry(NUMBER)];
    const { source, calls } = createFakeSource({ roster, histories: historiesOf([entry(NUMBER)]) });
    await unavailable(createCoFecnaProvider(source).findCandidates(query));
    expect(calls).toEqual(['roster']);
  });

  it('is unavailable when a number search has a readable match and an unreadable entry with the same key', async () => {
    const { source, calls } = createFakeSource({ roster: [entry(NUMBER), unreadable(NUMBER)], histories: historiesOf([entry(NUMBER)]) });
    await unavailable(createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER }));
    expect(calls).toEqual(['roster']);
  });

  it('is unavailable when a number search has a readable match and an unreadable entry without a key', async () => {
    const { source, calls } = createFakeSource({ roster: [entry(NUMBER), unreadable(null)], histories: historiesOf([entry(NUMBER)]) });
    await unavailable(createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER }));
    expect(calls).toEqual(['roster']);
    await unavailable(createCoFecnaProvider(source).fetchResults(NUMBER));
  });

  it('is not affected by an unreadable entry with another key when a number search has a readable match', async () => {
    const { source, calls } = createFakeSource({ roster: [unreadable(OTHER), entry(NUMBER)], histories: historiesOf([entry(NUMBER)]) });
    const candidates = await createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER });
    expect(candidates.map((candidate) => candidate.sourceAthleteKey)).toEqual([NUMBER]);
    expect(calls).toEqual(['roster', `history:${NUMBER}`]);
  });

  it('is unavailable to fetch results of a number that matches an unreadable entry', async () => {
    const { source } = createFakeSource({ roster: [unreadable(NUMBER)] });
    await unavailable(createCoFecnaProvider(source).fetchResults(NUMBER));
  });

  it('answers a search with no match as before when no entry is unreadable', async () => {
    const { source } = createFakeSource({ roster: [entry(OTHER, 'RUIZ LEON JUAN')] });
    expect(await createCoFecnaProvider(source).findCandidates(query)).toEqual([]);
    expect(await createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER })).toEqual([]);
  });
});
