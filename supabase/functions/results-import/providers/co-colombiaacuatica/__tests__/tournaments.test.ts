import * as fs from 'fs';
import * as path from 'path';
import { ProviderUnavailableError, SourceUnreachableError } from '../../../port.ts';
import { createCoColombiaacuatica } from '../index.ts';
import { TOTAL_TIMEOUT_MS } from '../lookup.ts';
import { normalizeCity } from '../tournaments.ts';

const INDEX_URL = 'https://www.colombiaacuatica.com/seccion/resultados';
const PDF = 'https://www.colombiaacuatica.com/backtun/torneos/resultados/pdf';
// A real capture of the index, cut down to a few rows: tournament names, cities, dates and disciplines only.
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'index2026.html'), 'utf8');
const ok = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });
// The calendar of the platform, quiet: one old swimming event that no test asks for, so the index is what these tests read.
const CALENDAR_URL = 'https://www.colombiaacuatica.com/seccion/calendario';
const QUIET_CALENDAR = `<script>$('#c').fullCalendar({ events: [ { id:'', title:'Liga | Torneo de 2019', start:'2019-01-01', url:'${PDF}/2019/20190101resultados.pdf' } ] });</script>`;
const serve = (index: BodyInit | null, calendar: BodyInit | null = QUIET_CALENDAR) => async (url: string) => ok(url === CALENDAR_URL ? calendar : index);
const list = (html: string, years = [2026]) => createCoColombiaacuatica(serve(html)).listTournaments(years);

const row = (href: string, title = 'Torneo de prueba', city = 'VAL, Cali', discipline = 'SW') => `
  <tr><th scope="row">1</th>
    <td><a href="${href}" title="${title}" target="_blank">Liga | ${title}</a></td>
    <td>${city}</td><td>Nov-20</td><td>${discipline}</td></tr>`;
const page = (...rows: string[]) => `<table><thead><tr><th>Id</th><th>Torneo</th><th>Sede</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
const GOOD = row(`${PDF}/2026/20261120resultados.pdf`);

describe('listTournaments', () => {
  it('returns one entry per row of the captured index, with the city normalized and no pool length', async () => {
    const fetchImpl = jest.fn(serve(FIXTURE));
    const entries = await createCoColombiaacuatica(fetchImpl).listTournaments([2026]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([INDEX_URL, CALENDAR_URL]);
    expect(fetchImpl).toHaveBeenCalledWith(INDEX_URL, expect.objectContaining({ redirect: 'manual' }));
    expect(entries).toEqual([
      { dateKey: '20261120', year: 2026, name: 'I Máster de Natación Country Club 2026 - Edición Centenario', city: 'Barranquilla', discipline: 'SW', course: null, sourceUrl: `${PDF}/2026/20261120resultados.pdf` },
      { dateKey: '20261117', year: 2026, name: 'Juegos Intercolegiados Nacionales - Paranatación', city: 'Bogota D.C.', discipline: 'PO', course: null, sourceUrl: `${PDF}/2026/20261117resultados.pdf` },
      { dateKey: '20260726', year: 2026, name: 'Copa Mesitas - Festival', city: 'Mesitas Del Colegio', discipline: 'SW', course: null, sourceUrl: `${PDF}/2026/20260726resultados.pdf` },
      { dateKey: '20260426', year: 2026, name: 'Selectivo de Clavados al Nacional Interligas 2026', city: 'Cali', discipline: 'D', course: null, sourceUrl: `${PDF}/2026/20260426resultados.pdf` },
    ]);
  });

  it('lists only the year asked: the index of the current year has nothing for another one', async () => {
    expect(await list(FIXTURE, [2025])).toEqual([]);
  });

  it('returns the tournaments of every year asked, each with its own year, from one read of the index', async () => {
    const html = page(GOOD, row(`${PDF}/2025/20251205resultados.pdf`), row(`${PDF}/2024/20241020resultados.pdf`));
    const fetchImpl = jest.fn(serve(html));
    const entries = await createCoColombiaacuatica(fetchImpl).listTournaments([2026, 2025]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(entries.map((entry) => [entry.dateKey, entry.year])).toEqual([['20261120', 2026], ['20251205', 2025]]);
  });

  it('collapses the spaces and decodes the entities of a name', async () => {
    const [entry] = await list(page(row(`${PDF}/2026/20261120resultados.pdf`, 'I  Chequeo &amp; Copa &quot;Sol&quot;  de   Natación')));
    expect(entry.name).toBe('I Chequeo & Copa "Sol" de Natación');
  });

  it.each([
    ['an impossible day', `${PDF}/2026/20261340resultados.pdf`],
    ['a day that does not exist', `${PDF}/2026/20260230resultados.pdf`],
    ['a year that is not the date\'s', `${PDF}/2025/20261120resultados.pdf`],
    ['no date at all', `${PDF}/2026/resultados.pdf`],
    ['a short date', `${PDF}/2026/2026112resultados.pdf`],
    ['another host', 'https://example.invalid/backtun/torneos/resultados/pdf/2026/20261121resultados.pdf'],
    ['another file', `${PDF}/2026/20261121otro.pdf`],
  ])('leaves out a row with %s, and keeps the others', async (_label, href) => {
    const entries = await list(page(row(href), GOOD));
    expect(entries.map((entry) => entry.dateKey)).toEqual(['20261120']);
  });

  it('is unavailable, never an empty list, when the markup has no tournament rows', async () => {
    for (const html of ['', '<html><body>mantenimiento</body></html>', page(), page(row(`${PDF}/2026/20261340resultados.pdf`))]) {
      await expect(list(html)).rejects.toBeInstanceOf(ProviderUnavailableError);
    }
  });

  it('is unavailable when the index is not found (404), without asking twice', async () => {
    const fetchImpl = jest.fn(async () => ok('x', { status: 404 }));
    await expect(createCoColombiaacuatica(fetchImpl).listTournaments([2026])).rejects.toThrow(new ProviderUnavailableError('The tournament has no published results file'));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([301, 302, 307, 308])('is unavailable on a redirect (%i), and never follows it', async (status) => {
    const fetchImpl = jest.fn(async () => new Response(null, { status, headers: { location: 'https://example.invalid/' } }));
    await expect(createCoColombiaacuatica(fetchImpl).listTournaments([2026])).rejects.toThrow(new ProviderUnavailableError('The tournament address redirects'));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('is unreachable when the request fails or the platform answers 5xx, and plain unavailable on another status', async () => {
    const failing = createCoColombiaacuatica(async () => Promise.reject(new Error('boom')));
    await expect(failing.listTournaments([2026])).rejects.toBeInstanceOf(SourceUnreachableError);
    await expect(createCoColombiaacuatica(async () => ok('x', { status: 503 })).listTournaments([2026])).rejects.toBeInstanceOf(SourceUnreachableError);
    const error = await createCoColombiaacuatica(async () => ok('x', { status: 403 })).listTournaments([2026]).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).not.toBeInstanceOf(SourceUnreachableError);
  });

  it('refuses an index that announces more than the size limit, and cuts one that does not announce it', async () => {
    const cancel = jest.fn();
    const announced = ok(new ReadableStream({ pull: (c) => c.enqueue(new Uint8Array(1024)), cancel }), { headers: { 'content-length': String(64 * 1024 * 1024) } });
    await expect(createCoColombiaacuatica(async () => announced).listTournaments([2026])).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
    expect(cancel).toHaveBeenCalled();
    const unannounced = ok(new ReadableStream({ pull: (c) => c.enqueue(new Uint8Array(1024 * 1024)), cancel }));
    await expect(createCoColombiaacuatica(async () => unannounced).listTournaments([2026])).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
  });

  describe('with a platform that stalls', () => {
    afterEach(() => jest.useRealTimers());

    it('gives up after 30 seconds in all', async () => {
      jest.useFakeTimers();
      const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) =>
        ok(new ReadableStream({ start: (c) => init?.signal?.addEventListener('abort', () => c.error(new Error('aborted'))) })),
      );
      const pending = createCoColombiaacuatica(fetchImpl).listTournaments([2026]).catch((e) => e);
      await jest.advanceTimersByTimeAsync(TOTAL_TIMEOUT_MS + 1);
      expect(await pending).toBeInstanceOf(SourceUnreachableError);
    });
  });
});

describe('normalizeCity', () => {
  it.each([
    ['ATL, Barranquilla', 'Barranquilla'],
    ['  VAL ,   cali  ', 'Cali'],
    ['BOG, Bogota D.c.', 'Bogota D.C.'],
    ['BOG, Bogotá D.C.', 'Bogota D.C.'],
    ['CUN, MESITAS DEL COLEGIO', 'Mesitas Del Colegio'],
    ['NOR, Cúcuta', 'Cucuta'],
    ['Cúcuta', 'Cucuta'],
    ['SANT,Poima', 'Poima'],
    ['', ''],
  ])('turns %j into %j', (raw, expected) => {
    expect(normalizeCity(raw)).toBe(expected);
  });

  it('gives the same city for the spellings of the platform and of the catalog', () => {
    expect(normalizeCity('Bogotá D.C.')).toBe(normalizeCity('BOG, Bogota D.c.'));
  });
});
