import { ProviderUnavailableError } from '../../../port.ts';
import { MAX_CANDIDATES, SEARCH_TIMEOUT_MS, createCoFecnaProvider, type History, type Source } from '../provider.ts';

const NUMBER = '0000000000';
const OTHER = '1111111111';

const history = (name: string, resultCount = 1): History => ({
  name,
  affiliations: [{ club: 'Club Synthetic', league: 'League Synthetic', years: [2025, 2026] }],
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

function createFakeSource(options: { roster?: { key: string; name: string }[]; histories?: Record<string, History>; failWith?: Error } = {}) {
  const calls: string[] = [];
  const source: Source = {
    async roster() {
      calls.push('roster');
      if (options.failWith) throw options.failWith;
      return options.roster ?? [];
    },
    async history(identityNumber) {
      calls.push(`history:${identityNumber}`);
      if (options.failWith) throw options.failWith;
      const found = options.histories?.[identityNumber];
      if (!found) throw new Error(`no history for ${identityNumber}`);
      return found;
    },
  };
  return { source, calls };
}

const query = { firstName: 'Ana María', lastName: 'Pérez Gómez', identityNumber: null };

describe('co-fecna provider', () => {
  it('uses the key the registry expects', () => {
    expect(createCoFecnaProvider(createFakeSource().source).key).toBe('co-fecna');
  });

  describe('findCandidates with an identity number', () => {
    it('searches by number only and never reads the roster', async () => {
      const { source, calls } = createFakeSource({ histories: { [NUMBER]: history('PEREZ GOMEZ ANA MARIA', 3) } });
      const candidates = await createCoFecnaProvider(source).findCandidates({ ...query, identityNumber: NUMBER });
      expect(calls).toEqual([`history:${NUMBER}`]);
      expect(candidates).toEqual([
        {
          sourceAthleteKey: NUMBER,
          name: 'PEREZ GOMEZ ANA MARIA',
          affiliations: [{ club: 'Club Synthetic', league: 'League Synthetic', years: [2025, 2026] }],
          resultCount: 3,
        },
      ]);
    });
  });

  describe('findCandidates without an identity number', () => {
    const roster = [
      { key: NUMBER, name: 'PEREZ GOMEZ ANA MARIA' },
      { key: OTHER, name: 'RUIZ LEON JUAN' },
    ];

    it('matches by name ignoring case, accents, spacing and word order, and returns candidates only', async () => {
      const { source, calls } = createFakeSource({
        roster: [{ key: NUMBER, name: '  pérez  gómez ANA maría ' }, roster[1]],
        histories: { [NUMBER]: history('Pérez Gómez Ana María', 2) },
      });
      const candidates = await createCoFecnaProvider(source).findCandidates(query);
      expect(calls).toEqual(['roster', `history:${NUMBER}`]);
      expect(candidates.map(({ sourceAthleteKey, name, resultCount }) => ({ sourceAthleteKey, name, resultCount }))).toEqual([
        { sourceAthleteKey: NUMBER, name: 'Pérez Gómez Ana María', resultCount: 2 },
      ]);
    });

    it('requires every word of the first and last names, and allows extra words in the source', async () => {
      const { source } = createFakeSource({
        roster: [
          { key: NUMBER, name: 'PEREZ GOMEZ ANA MARIA LUCIA' },
          { key: OTHER, name: 'PEREZ ANA MARIA' },
        ],
        histories: { [NUMBER]: history('PEREZ GOMEZ ANA MARIA LUCIA') },
      });
      const candidates = await createCoFecnaProvider(source).findCandidates(query);
      expect(candidates.map((candidate) => candidate.sourceAthleteKey)).toEqual([NUMBER]);
    });

    it('returns an empty list, without asking for any history, when nobody matches', async () => {
      const { source, calls } = createFakeSource({ roster });
      expect(await createCoFecnaProvider(source).findCandidates({ ...query, lastName: 'Nadie' })).toEqual([]);
      expect(calls).toEqual(['roster']);
    });

    it('returns every homonym, up to the limit', async () => {
      const homonyms = Array.from({ length: MAX_CANDIDATES }, (_, index) => ({ key: `${index}`.padStart(10, '0'), name: 'PEREZ GOMEZ ANA MARIA' }));
      const histories = Object.fromEntries(homonyms.map(({ key }) => [key, history('PEREZ GOMEZ ANA MARIA')]));
      const { source } = createFakeSource({ roster: homonyms, histories });
      const candidates = await createCoFecnaProvider(source).findCandidates(query);
      expect(candidates.map((candidate) => candidate.sourceAthleteKey)).toEqual(homonyms.map(({ key }) => key));
    });

    it('is unavailable, not truncated, when more than the limit match, and asks for no history', async () => {
      const homonyms = Array.from({ length: MAX_CANDIDATES + 1 }, (_, index) => ({ key: `${index}`.padStart(10, '0'), name: 'PEREZ GOMEZ ANA MARIA' }));
      const { source, calls } = createFakeSource({ roster: homonyms });
      await expect(createCoFecnaProvider(source).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
      expect(calls).toEqual(['roster']);
    });
  });

  describe('fetchResults', () => {
    it('returns the normalized results of the source reference', async () => {
      const { source, calls } = createFakeSource({ histories: { [NUMBER]: history('PEREZ GOMEZ ANA MARIA', 2) } });
      const results = await createCoFecnaProvider(source).fetchResults(NUMBER);
      expect(calls).toEqual([`history:${NUMBER}`]);
      expect(results.map((result) => result.sourceResultKey)).toEqual(['r-0', 'r-1']);
    });

    it('returns nothing but the declared result fields', async () => {
      const dirty = history('PEREZ GOMEZ ANA MARIA');
      Object.assign(dirty.results[0], { idNumber: NUMBER, birthDate: '2014-05-01' });
      const { source } = createFakeSource({ histories: { [NUMBER]: dirty } });
      const [result] = await createCoFecnaProvider(source).fetchResults(NUMBER);
      expect(Object.keys(result).sort()).toEqual(['competition', 'distance', 'hundredths', 'pool', 'sourceResultKey', 'stroke', 'swumOn']);
    });
  });

  describe('when the source fails or changes shape', () => {
    const failures = {
      findCandidates: (provider: ReturnType<typeof createCoFecnaProvider>) => provider.findCandidates({ ...query, identityNumber: NUMBER }),
      findCandidatesByName: (provider: ReturnType<typeof createCoFecnaProvider>) => provider.findCandidates(query),
      fetchResults: (provider: ReturnType<typeof createCoFecnaProvider>) => provider.fetchResults(NUMBER),
    };

    it.each(Object.keys(failures) as (keyof typeof failures)[])('%s throws the typed unavailable error without the cause or the number', async (name) => {
      const cause = new Error(`parse failed near ${NUMBER}`);
      const { source } = createFakeSource({ failWith: cause });
      const error = await failures[name](createCoFecnaProvider(source)).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProviderUnavailableError);
      expect((error as Error).message).not.toContain(NUMBER);
      expect((error as Error).cause).toBeUndefined();
    });

    it('is unavailable when the history of one candidate fails', async () => {
      const { source } = createFakeSource({ roster: [{ key: NUMBER, name: 'PEREZ GOMEZ ANA MARIA' }], histories: {} });
      await expect(createCoFecnaProvider(source).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
    });
  });

  describe('the total time of a search', () => {
    afterEach(() => jest.useRealTimers());

    it('asks for one history at a time, never in parallel', async () => {
      const homonyms = [NUMBER, OTHER].map((key) => ({ key, name: 'PEREZ GOMEZ ANA MARIA' }));
      let running = 0;
      let peak = 0;
      const source: Source = {
        roster: async () => homonyms,
        history: async () => {
          peak = Math.max(peak, ++running);
          await Promise.resolve();
          running -= 1;
          return history('PEREZ GOMEZ ANA MARIA');
        },
      };
      await createCoFecnaProvider(source).findCandidates(query);
      expect(peak).toBe(1);
    });

    it('is unavailable after 30 seconds and asks for no more histories', async () => {
      jest.useFakeTimers();
      const homonyms = [NUMBER, OTHER].map((key) => ({ key, name: 'PEREZ GOMEZ ANA MARIA' }));
      const asked: string[] = [];
      const source: Source = {
        roster: async () => homonyms,
        history: (identityNumber) => {
          asked.push(identityNumber);
          return new Promise((resolve) => setTimeout(() => resolve(history('PEREZ GOMEZ ANA MARIA')), SEARCH_TIMEOUT_MS - 1_000));
        },
      };
      const pending = createCoFecnaProvider(source).findCandidates(query).catch((caught: unknown) => caught);
      await jest.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS + 5_000);
      expect(await pending).toBeInstanceOf(ProviderUnavailableError);
      expect(asked).toEqual([NUMBER, OTHER].slice(0, 2));
    });
  });

  it('logs nothing, on success or failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => {}));
    const ok = createFakeSource({ roster: [{ key: NUMBER, name: 'PEREZ GOMEZ ANA MARIA' }], histories: { [NUMBER]: history('PEREZ GOMEZ ANA MARIA') } });
    await createCoFecnaProvider(ok.source).findCandidates(query);
    await createCoFecnaProvider(ok.source).fetchResults(NUMBER);
    await createCoFecnaProvider(createFakeSource({ failWith: new Error(NUMBER) }).source).fetchResults(NUMBER).catch(() => undefined);
    spies.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
