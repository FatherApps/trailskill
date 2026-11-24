import { createCoColombiaacuatica } from '../index.ts';
import { TOTAL_TIMEOUT_MS, TOURNAMENT_PDF } from '../lookup.ts';
import { ME, lenex } from './lenexBuilder.ts';
import { buildZip } from './zipBuilder.ts';

const BASE = 'https://www.colombiaacuatica.com/backtun/torneos';
const zipUrl = (dateKey: string) => `${BASE}/${dateKey.slice(0, 4)}/${dateKey}/resultados${dateKey}Lenex.zip`;
const pdfUrl = (dateKey: string) => `${BASE}/resultados/pdf/${dateKey.slice(0, 4)}/${dateKey}resultados.pdf`;
const zipOf = (text: string) => buildZip([{ name: 'meet.lef', data: new TextEncoder().encode(text), method: 8 }]);

type Answer = Response | Error | (() => Response | Promise<Response>);
type Calls = { method: string; url: string; init?: RequestInit }[];

// A fake platform: `days` maps a day to what its zip answers (HEAD and GET alike unless `get` says otherwise); an unlisted day is a 404.
function platform(days: Record<string, Answer>, get: Record<string, Answer> = {}) {
  const calls: Calls = [];
  let open = 0;
  let overlapped = false;
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, init });
    open += 1;
    overlapped ||= open > 1;
    try {
      const dateKey = /\/(\d{8})\/resultados/.exec(url)?.[1] ?? '';
      const answer = method === 'GET' && dateKey in get ? get[dateKey] : days[dateKey];
      if (answer === undefined) return new Response(null, { status: 404 });
      if (answer instanceof Error) throw answer;
      const response = typeof answer === 'function' ? await answer() : answer;
      // A response is read once: a fresh copy for each request.
      return method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response.clone();
    } finally {
      open -= 1;
    }
  });
  return { fetchImpl, calls, overlapped: () => overlapped, probe: (keys: string[]) => createCoColombiaacuatica(fetchImpl).probeTournaments!(keys) };
}

const found = async (text = lenex({ meetCity: 'ATL, Barranquilla' })) => new Response(await zipOf(text), { status: 200 });

describe('probeTournaments', () => {
  it('asks one day with a HEAD and goes on to the next when it is a 404, without a GET', async () => {
    const { probe, calls } = platform({});
    expect(await probe(['20251018', '20251019'])).toEqual({ probed: 2, found: 0, entries: [] });
    expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([`HEAD ${zipUrl('20251018')}`, `HEAD ${zipUrl('20251019')}`]);
    for (const { init } of calls) expect(init).toEqual(expect.objectContaining({ redirect: 'manual' }));
  });

  it('reads the meet of a day that answers 200 with one GET of its zip', async () => {
    const { probe, calls } = platform({ '20251018': await found() });
    const result = await probe(['20251018']);
    expect(calls.map(({ method }) => method)).toEqual(['HEAD', 'GET']);
    expect(result).toEqual({
      probed: 1,
      found: 1,
      entries: [
        { dateKey: '20251018', year: 2025, name: 'Festival Sintético & Amigos', city: 'Barranquilla', discipline: 'SW', course: null, sourceUrl: pdfUrl('20251018') },
      ],
    });
    expect(TOURNAMENT_PDF.test(result.entries[0].sourceUrl)).toBe(true);
  });

  it('returns only the fields of the meet: no athlete name, club or number goes out', async () => {
    const { probe } = platform({ '20251018': await found(lenex({ athletes: [ME] })) });
    const [entry] = (await probe(['20251018'])).entries;
    expect(Object.keys(entry).sort()).toEqual(['city', 'course', 'dateKey', 'discipline', 'name', 'sourceUrl', 'year']);
    const text = JSON.stringify(entry);
    for (const secret of [ME.first, ME.last, ME.club, ME.license!, ME.birthdate]) expect(text).not.toContain(secret);
  });

  it.each([
    ['without a name', lenex({ meetName: null })],
    ['with a blank name', lenex({ meetName: '   ' })],
    ['without a city', lenex({ meetCity: null })],
    ['with a blank city', lenex({ meetCity: ' , ' })],
    ['that is not a LENEX', '<html></html>'],
  ])('counts a zip %s as found and leaves it out', async (_name, text) => {
    const { probe } = platform({ '20251018': await found(text) });
    expect(await probe(['20251018'])).toEqual({ probed: 1, found: 1, entries: [] });
  });

  it('counts a corrupt zip and one that is too large as found, leaves them out and goes on', async () => {
    const { probe, calls } = platform(
      { '20251018': new Response('not a zip', { status: 200 }), '20251019': new Response('x', { status: 200, headers: { 'content-length': String(64 * 1024 * 1024) } }), '20251020': await found() },
      {},
    );
    const result = await probe(['20251018', '20251019', '20251020']);
    expect(result).toEqual(expect.objectContaining({ probed: 3, found: 3 }));
    expect(result.entries.map((entry) => entry.dateKey)).toEqual(['20251020']);
    expect(result.stoppedBy).toBeUndefined();
    expect(calls.filter(({ method }) => method === 'GET')).toHaveLength(3);
  });

  it('asks one request at a time', async () => {
    const { probe, overlapped } = platform({ '20251018': await found(), '20251019': await found() });
    await probe(['20251018', '20251019', '20251020']);
    expect(overlapped()).toBe(false);
  });

  const stops: [string, Answer][] = [
    ['403', new Response(null, { status: 403 })],
    ['429', new Response(null, { status: 429 }) ],
    ['405', new Response(null, { status: 405 })],
    ['another 4xx', new Response(null, { status: 418 })],
    ['a redirect', new Response(null, { status: 302, headers: { location: 'https://example.invalid/' } })],
    ['a 500', new Response(null, { status: 500 })],
    ['a 503', new Response(null, { status: 503 })],
    ['a network failure', new TypeError('network down')],
  ];

  it.each(stops)('stops dry at the day that answers %s: no later day is asked, what was found before stays', async (_name, answer) => {
    const { probe, calls } = platform({ '20251018': await found(), '20251020': answer, '20251021': await found() });
    const result = await probe(['20251018', '20251019', '20251020', '20251021']);
    expect(result).toEqual(expect.objectContaining({ probed: 2, found: 1, stoppedBy: '20251020' }));
    expect(result.entries.map((entry) => entry.dateKey)).toEqual(['20251018']);
    expect(calls.some(({ url }) => url === zipUrl('20251021'))).toBe(false);
    expect(calls.map(({ method, url }) => `${method} ${url}`).at(-1)).toBe(`HEAD ${zipUrl('20251020')}`);
  });

  it.each(stops)('stops dry when the GET of a found day answers %s', async (_name, answer) => {
    const { probe, calls } = platform({ '20251018': await found(), '20251019': await found() }, { '20251018': answer });
    const result = await probe(['20251018', '20251019']);
    expect(result).toEqual({ probed: 0, found: 0, entries: [], stoppedBy: '20251018' });
    expect(calls.some(({ url }) => url === zipUrl('20251019'))).toBe(false);
  });

  describe('with a platform that stalls', () => {
    afterEach(() => jest.useRealTimers());

    it('stops dry at the day that does not answer in 30 seconds', async () => {
      jest.useFakeTimers();
      const fetchImpl = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
      const pending = createCoColombiaacuatica(fetchImpl).probeTournaments!(['20251018', '20251019']);
      await jest.advanceTimersByTimeAsync(TOTAL_TIMEOUT_MS + 1);
      expect(await pending).toEqual({ probed: 0, found: 0, entries: [], stoppedBy: '20251018' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });
});
