import { ProviderUnavailableError } from '../../../port.ts';
import { createCoFecna } from '../index.ts';
import { AGE, BIRTH_DATE, GENDER, IDENTITY, PRUEBAS, historyPage, historyRow, option, profileCard, rosterPage } from './fixtures.ts';

const NUMBER = '1234567890';
const roster = rosterPage([option(NUMBER, 'PEREZ GOMEZ', 'ANA MARIA'), option('9999999999', 'RUIZ', 'JUAN'), option(' 1.234-5', 'PEREZ GOMEZ', 'ANA')]);
const page = (body: string, cookie = 'SESSION=synthetic; HttpOnly; secure') =>
  new Response(body, { status: 200, headers: cookie ? { 'set-cookie': cookie } : {} });

// Rows by event number. The answer is a JSON array served as text/html, as the source does.
type Rows = Record<number, Record<string, unknown>[]>;
const DEFAULT_ROWS: Rows = { 2: [historyRow(), historyRow({ fecha_torneo: '2025-01-02' })], 9: [historyRow({}, 9)] };
const historial = (rows: Rows, prueba: number) =>
  new Response(JSON.stringify(rows[prueba] ?? []), { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });

type Request = { url: string; method: string; headers: Headers; body: string };
const HISTORIAL = /\/reportes\/(\d+)\/getHistorial$/;

/** A fake source: the form on GET, the history page (profile and empty tables) on POST, one JSON array per event. */
function fakeFetch(
  options: { rows?: Rows; onHistorial?: (prueba: number, signal?: AbortSignal | null) => Promise<Response> | Response; onPost?: () => Response; formCookie?: string } = {},
) {
  const requests: Request[] = [];
  const fetchImpl = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    requests.push({ url, method, headers: new Headers(init.headers), body: String(init.body ?? '') });
    const prueba = HISTORIAL.exec(url)?.[1];
    if (prueba !== undefined) return (options.onHistorial ?? ((n) => historial(options.rows ?? DEFAULT_ROWS, n)))(Number(prueba), init.signal);
    if (method === 'GET') return options.formCookie === undefined ? page(roster) : page(roster, options.formCookie);
    return options.onPost?.() ?? page(historyPage(), '');
  });
  return { fetchImpl, requests };
}
const historials = (requests: Request[]) => requests.filter(({ url }) => HISTORIAL.test(url));

const query = { firstName: 'Ana María', lastName: 'Pérez Gómez', identityNumber: null };

describe('co-fecna adapter on synthetic pages', () => {
  it('searching by number reads the list, posts the form, then reads one getHistorial per event with the same cookie', async () => {
    const { fetchImpl, requests } = fakeFetch();
    const [candidate] = await createCoFecna(fetchImpl).findCandidates({ ...query, identityNumber: '123-456-7890' });
    expect(requests.slice(0, 2).map(({ method }) => method)).toEqual(['GET', 'POST']);
    const post = requests[1];
    expect(post.url.endsWith('/historialFilter')).toBe(true);
    expect(post.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(post.headers.get('cookie')).toBe('SESSION=synthetic');
    const form = new URLSearchParams(post.body);
    // The import brings the whole history, never the best time of each year.
    expect(Object.fromEntries(form)).toMatchObject({ nadador: NUMBER, anual: '0', prueba: '1' });
    expect(form.get('inicio')).toBe('2000-01-01');
    expect(form.get('fin')).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const gets = historials(requests);
    expect(gets.map(({ url }) => Number(HISTORIAL.exec(url)?.[1])).sort((a, b) => a - b)).toEqual(PRUEBAS);
    expect(gets.every(({ method }) => method === 'GET')).toBe(true);
    expect(gets.every(({ headers }) => headers.get('cookie') === 'SESSION=synthetic')).toBe(true);
    expect(gets[0].url).toBe(`https://ecoapplet.co/fecna/reportes/${HISTORIAL.exec(gets[0].url)?.[1]}/getHistorial`);

    // The tables of the POST answer are all empty: the three results come from getHistorial.
    expect(candidate).toEqual({
      sourceAthleteKey: NUMBER,
      name: 'PEREZ GOMEZ ANA MARIA',
      affiliations: [{ club: 'Club Sintético', league: 'Liga Sintética', years: [] }],
      resultCount: 3,
    });
  });

  it('gives the affiliation no years even with results: the rows carry no club, so the current club is not credited with them', async () => {
    const { fetchImpl } = fakeFetch();
    const [candidate] = await createCoFecna(fetchImpl).findCandidates({ ...query, identityNumber: NUMBER });
    expect(candidate.resultCount).toBe(3);
    expect(candidate.affiliations).toEqual([{ club: 'Club Sintético', league: 'Liga Sintética', years: [] }]);
  });

  it('a person with results never comes back with 0 because the tables are empty', async () => {
    const { fetchImpl } = fakeFetch();
    const results = await createCoFecna(fetchImpl).fetchResults(NUMBER);
    expect(results.map(({ stroke, distance, swumOn }) => `${stroke} ${distance} ${swumOn}`).sort()).toEqual([
      'BK 50m 2026-03-14',
      'FR 50m 2025-01-02',
      'FR 50m 2026-03-14',
    ]);
  });

  it('never copies the gender, the birth date, the age or the identity anywhere in what it returns', async () => {
    const { fetchImpl } = fakeFetch();
    const adapter = createCoFecna(fetchImpl);
    const output = JSON.stringify([await adapter.findCandidates({ ...query, identityNumber: NUMBER }), await adapter.fetchResults(NUMBER)]);
    expect(output).not.toMatch(new RegExp(`${GENDER}|${BIRTH_DATE}|${AGE}|${IDENTITY}|Identificaci`));
  });

  it('a number that is not among the options is no match, and the form is never posted', async () => {
    const { fetchImpl, requests } = fakeFetch();
    expect(await createCoFecna(fetchImpl).findCandidates({ ...query, identityNumber: '5555555555' })).toEqual([]);
    expect(requests.map(({ method }) => method)).toEqual(['GET']);
  });

  it('takes the name from the list, never from the heading of the history page', async () => {
    const { fetchImpl } = fakeFetch();
    const [candidate] = await createCoFecna(fetchImpl).findCandidates({ ...query, identityNumber: NUMBER });
    expect(JSON.stringify(candidate)).not.toContain('SOMEONE ELSE');
  });

  it('searching by name posts once per match and reads the events of one match before the next', async () => {
    const { fetchImpl, requests } = fakeFetch();
    const candidates = await createCoFecna(fetchImpl).findCandidates({ firstName: 'ana', lastName: 'pérez gómez', identityNumber: null });
    expect(candidates.map((candidate) => candidate.sourceAthleteKey)).toEqual([NUMBER, '12345']);
    const posts = requests.map((request, index) => ({ request, index })).filter(({ request }) => request.method === 'POST');
    expect(posts.map(({ request }) => new URLSearchParams(request.body).get('nadador'))).toEqual([NUMBER, ' 1.234-5']);
    expect(historials(requests)).toHaveLength(2 * PRUEBAS.length);
    expect(requests.slice(posts[0].index + 1, posts[1].index).every(({ url }) => HISTORIAL.test(url))).toBe(true);
  });

  it('refreshes the results of a reference without the reference in them', async () => {
    const { fetchImpl } = fakeFetch();
    const results = await createCoFecna(fetchImpl).fetchResults(NUMBER);
    expect(results).toHaveLength(3);
    expect(JSON.stringify(results)).not.toContain(NUMBER);
  });

  it('a new request starts without the previous cookie', async () => {
    const { fetchImpl, requests } = fakeFetch();
    const adapter = createCoFecna(fetchImpl);
    await adapter.fetchResults(NUMBER);
    await adapter.fetchResults(NUMBER);
    const forms = requests.filter(({ method, url }) => method === 'GET' && !HISTORIAL.test(url));
    expect(forms).toHaveLength(2);
    expect(forms.every(({ headers }) => headers.get('cookie') === null)).toBe(true);
  });

  it('is unavailable on an HTTP error, after a single request', async () => {
    const fetchImpl = jest.fn(async () => new Response('down', { status: 503 }));
    await expect(createCoFecna(fetchImpl).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('is unavailable when the list changed shape', async () => {
    const fetchImpl = jest.fn(async () => page('<html>no list</html>'));
    await expect(createCoFecna(fetchImpl).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('is unavailable when the history page changed shape, and asks for no event', async () => {
    const { fetchImpl, requests } = fakeFetch({ onPost: () => page('<html>maintenance</html>', '') });
    await expect(createCoFecna(fetchImpl).fetchResults(NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(requests.map(({ method }) => method)).toEqual(['GET', 'POST']);
  });

  it('is unavailable when the history page has no profile card, and asks for no event', async () => {
    const { fetchImpl, requests } = fakeFetch({ onPost: () => page(historyPage(''), '') });
    await expect(createCoFecna(fetchImpl).fetchResults(NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(historials(requests)).toHaveLength(0);
  });

  it('keeps going with an empty club or league badge', async () => {
    const { fetchImpl } = fakeFetch({ onPost: () => page(historyPage(profileCard([['Club', ''], ['Liga', 'Liga Sintética']])), '') });
    const [candidate] = await createCoFecna(fetchImpl).findCandidates({ ...query, identityNumber: NUMBER });
    expect(candidate.affiliations[0]).toMatchObject({ club: null, league: 'Liga Sintética' });
  });

  describe('the 17 reads of getHistorial', () => {
    afterEach(() => jest.useRealTimers());

    it('never has more than 3 in flight at once, and still asks for every event', async () => {
      let running = 0;
      let peak = 0;
      const { fetchImpl, requests } = fakeFetch({
        onHistorial: async (prueba) => {
          peak = Math.max(peak, ++running);
          await new Promise((resolve) => setTimeout(resolve, 2));
          running -= 1;
          return historial(DEFAULT_ROWS, prueba);
        },
      });
      await createCoFecna(fetchImpl).fetchResults(NUMBER);
      expect(historials(requests)).toHaveLength(PRUEBAS.length);
      expect(peak).toBe(3);
    });

    it('is unavailable, not partial, when one event fails, and starts no more after the failure', async () => {
      // The first event fails at once while the other two in flight are still answering: nothing else may start after that.
      const slow = (prueba: number) => new Promise<Response>((resolve) => setTimeout(() => resolve(historial(DEFAULT_ROWS, prueba)), 20));
      const { fetchImpl, requests } = fakeFetch({ onHistorial: (prueba) => (prueba === 2 ? new Response('down', { status: 503 }) : slow(prueba)) });
      await expect(createCoFecna(fetchImpl).fetchResults(NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(historials(requests)).toHaveLength(3);
    });

    it('is unavailable, and never reads an event, when the form page sets no cookie', async () => {
      const { fetchImpl, requests } = fakeFetch({ formCookie: '' });
      await expect(createCoFecna(fetchImpl).fetchResults(NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
      expect(historials(requests)).toHaveLength(0);
      expect(requests.map(({ method }) => method)).toEqual(['GET']);
    });

    it.each([
      ['text that is not JSON', '<html>maintenance</html>'],
      ['a JSON object', '{"0":1}'],
    ])('is unavailable when one event answers %s', async (_label, body) => {
      const { fetchImpl } = fakeFetch({ onHistorial: (prueba) => (prueba === 22 ? new Response(body, { status: 200 }) : historial(DEFAULT_ROWS, prueba)) });
      await expect(createCoFecna(fetchImpl).fetchResults(NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
    });

    it('is unavailable when one row belongs to another event, and for a search by name too', async () => {
      const rows: Rows = { 2: [historyRow({}, 3)] };
      const { fetchImpl } = fakeFetch({ rows });
      await expect(createCoFecna(fetchImpl).fetchResults(NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
      await expect(createCoFecna(fetchImpl).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
    });

    it('is unavailable after 30 seconds with a slow source, with no partial result and no new request once time is over', async () => {
      jest.useFakeTimers();
      // Each answer takes 9 s (inside the 10 s of a request): even 3 at a time, 17 events do not fit in 30 s.
      const { fetchImpl, requests } = fakeFetch({
        onHistorial: (prueba) => new Promise((resolve) => setTimeout(() => resolve(historial(DEFAULT_ROWS, prueba)), 9_000)),
      });
      const pending = createCoFecna(fetchImpl).fetchResults(NUMBER).catch((caught: unknown) => caught);
      await jest.advanceTimersByTimeAsync(30_001);
      expect(await pending).toBeInstanceOf(ProviderUnavailableError);
      const asked = historials(requests).length;
      expect(asked).toBeLessThan(PRUEBAS.length);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(historials(requests)).toHaveLength(asked);
    });

    it('aborts every request still in flight when the 30 seconds are over', async () => {
      jest.useFakeTimers();
      const inFlight = new Set<AbortSignal | null | undefined>();
      // 9 s per answer: a batch starts at 27 s, so it is in flight at 30 s with its own 10 s timer not yet over.
      const { fetchImpl } = fakeFetch({
        onHistorial: (prueba, signal) => {
          inFlight.add(signal);
          return new Promise((resolve) =>
            setTimeout(() => {
              inFlight.delete(signal);
              resolve(historial(DEFAULT_ROWS, prueba));
            }, 9_000),
          );
        },
      });
      const pending = createCoFecna(fetchImpl).fetchResults(NUMBER).catch((caught: unknown) => caught);
      await jest.advanceTimersByTimeAsync(30_001);
      expect(await pending).toBeInstanceOf(ProviderUnavailableError);
      expect(inFlight.size).toBeGreaterThan(0);
      expect([...inFlight].every((signal) => signal?.aborted)).toBe(true);
    });
  });
});
