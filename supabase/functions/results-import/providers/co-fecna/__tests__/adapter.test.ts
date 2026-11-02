import { ProviderUnavailableError } from '../../../port.ts';
import { createCoFecna } from '../index.ts';
import { historyPage, option, rosterPage, table } from './fixtures.ts';

const NUMBER = '1234567890';
const roster = rosterPage([option(NUMBER, 'PEREZ GOMEZ', 'ANA MARIA'), option('9999999999', 'RUIZ', 'JUAN'), option(' 1.234-5', 'PEREZ GOMEZ', 'ANA')]);
const page = (body: string, cookie = 'SESSION=synthetic; HttpOnly; secure') =>
  new Response(body, { status: 200, headers: cookie ? { 'set-cookie': cookie } : {} });

/** A fake source of pages: the form on GET, the history on POST. Records every request. */
function fakeFetch(answerPost: () => Response = () => page(historyPage([table('50l', [{}, { date: '2025-01-02' }])]), '')) {
  const requests: { url: string; method: string; headers: Headers; body: string }[] = [];
  const fetchImpl = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    requests.push({ url, method, headers: new Headers(init.headers), body: String(init.body ?? '') });
    return method === 'GET' ? page(roster) : answerPost();
  });
  return { fetchImpl, requests };
}

const query = { firstName: 'Ana María', lastName: 'Pérez Gómez', identityNumber: null };

describe('co-fecna adapter on synthetic pages', () => {
  it('searching by number reads the list, then posts the form with the session cookie', async () => {
    const { fetchImpl, requests } = fakeFetch();
    const [candidate] = await createCoFecna(fetchImpl).findCandidates({ ...query, identityNumber: '123-456-7890' });
    expect(requests.map(({ method }) => method)).toEqual(['GET', 'POST']);
    const post = requests[1];
    expect(post.url.endsWith('/historialFilter')).toBe(true);
    expect(post.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(post.headers.get('cookie')).toBe('SESSION=synthetic');
    const form = new URLSearchParams(post.body);
    expect(Object.fromEntries(form)).toMatchObject({ nadador: NUMBER, anual: '0', prueba: '1' });
    expect(form.get('inicio')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(form.get('fin')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(candidate).toEqual({
      sourceAthleteKey: NUMBER,
      name: 'PEREZ GOMEZ ANA MARIA',
      affiliations: [{ club: null, league: null, years: [2025, 2026] }],
      resultCount: 2,
    });
  });

  it('a number that is not among the options is no match, and the form is never posted', async () => {
    // The page would answer with someone else's heading for a number it does not list.
    const { fetchImpl, requests } = fakeFetch(() => page(historyPage([table('50l', [{}])], '<h3>ANA PEREZ</h3>')));
    expect(await createCoFecna(fetchImpl).findCandidates({ ...query, identityNumber: '5555555555' })).toEqual([]);
    expect(requests.map(({ method }) => method)).toEqual(['GET']);
  });

  it('takes the name from the list, never from the heading of the history page', async () => {
    const { fetchImpl } = fakeFetch(() => page(historyPage([table('50l', [{}])], '<h3>OTRA PERSONA REAL</h3>'), ''));
    const [candidate] = await createCoFecna(fetchImpl).findCandidates({ ...query, identityNumber: NUMBER });
    expect(JSON.stringify(candidate)).not.toContain('OTRA');
  });

  it('searching by name reads the list once and posts once per match, in order', async () => {
    const { fetchImpl, requests } = fakeFetch();
    const candidates = await createCoFecna(fetchImpl).findCandidates({ firstName: 'ana', lastName: 'pérez gómez', identityNumber: null });
    expect(candidates.map((candidate) => candidate.sourceAthleteKey)).toEqual([NUMBER, '12345']);
    expect(requests.map(({ method }) => method)).toEqual(['GET', 'POST', 'POST']);
    expect(requests.slice(1).map(({ body }) => new URLSearchParams(body).get('nadador'))).toEqual([NUMBER, ' 1.234-5']);
  });

  it('refreshes the results of a reference', async () => {
    const { fetchImpl } = fakeFetch();
    const results = await createCoFecna(fetchImpl).fetchResults(NUMBER);
    expect(results.map((result) => result.swumOn)).toEqual(['2026-03-14', '2025-01-02']);
    expect(JSON.stringify(results)).not.toContain(NUMBER);
  });

  it('a new request starts without the previous cookie', async () => {
    const { fetchImpl, requests } = fakeFetch();
    const adapter = createCoFecna(fetchImpl);
    await adapter.fetchResults(NUMBER);
    await adapter.fetchResults(NUMBER);
    expect(requests.map(({ method }) => method)).toEqual(['GET', 'POST', 'GET', 'POST']);
  });

  it('is unavailable on an HTTP error, after a single request', async () => {
    const fetchImpl = jest.fn(async () => new Response('down', { status: 503 }));
    await expect(createCoFecna(fetchImpl).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('is unavailable when the history page changed shape', async () => {
    const { fetchImpl } = fakeFetch(() => page('<html>maintenance</html><table id="50l"><tr><td>x</td></tr></table>', ''));
    await expect(createCoFecna(fetchImpl).fetchResults(NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('is unavailable when the list changed shape', async () => {
    const fetchImpl = jest.fn(async () => page('<html>no list</html>'));
    await expect(createCoFecna(fetchImpl).findCandidates(query)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
