import { isPool } from '../../../../../../src/core/sport/catalogs.ts';
import { ProviderUnavailableError, SourceUnreachableError } from '../../../port.ts';
import { createCoColombiaacuatica } from '../index.ts';
import { COURSE_MARKERS, EXCLUDED_DISCIPLINE_MARKERS, courseFromTitle, normalizeCity, parseCalendar } from '../tournaments.ts';

const HOST = 'https://www.colombiaacuatica.com';
const INDEX_URL = `${HOST}/seccion/resultados`;
const CALENDAR_URL = `${HOST}/seccion/calendario`;
const PDF = `${HOST}/backtun/torneos/resultados/pdf`;
const ok = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

// A calendar as the platform writes it: a FullCalendar call whose `events` is a JavaScript literal (bare keys, single quotes, comments),
// with an event of another kind (a holiday with no title or link) and one that links to a page, all synthetic.
const event = (fields: { title?: string; url?: string; start?: string }) =>
  `{ id:'', ${fields.title === undefined ? '' : `title:'${fields.title.replaceAll("'", "\\'")}',`}
     start:'${fields.start ?? '2000-01-01 09:00:00'}',
     ${fields.url === undefined ? '' : `url:'${fields.url}',`}
     className:'Any', },`;
const pdf = (dateKey: string, year = dateKey.slice(0, 4), host = 'www.ColombiaAcuatica.com') => `https://${host}/backtun/torneos/resultados/pdf/${year}/${dateKey}resultados.pdf`;
const calendar = (...events: string[]) => `<html><script>
  $('#calendar').fullCalendar({
    eventClick: function(event) { if (event.url) { window.open(event.url, "_blank"); return false; } },
    // Inicia los eventos
    events:
    [ { id:'18', start:'2020-01-01', //textColor:'#990000',
        rendering: 'background', color: '#ffcccc' },
      ${events.join('\n')} ]
  });
</script></html>`;
const one = (title: string, url = pdf('20261120')) => parseCalendar(calendar(event({ title, url })));

describe('parseCalendar', () => {
  it('returns each swimming event with the day and year of its link (never of its start), the name after « | » and the organizer before', () => {
    const html = calendar(
      event({ title: 'Liga Ejemplo de Natación | I Copa Sol de Natación', start: '2026-11-01 09:00:00', url: pdf('20261120') }),
      event({ title: 'Club Ejemplo | Festival de Verano', start: '2025-12-30 09:00:00', url: pdf('20250214') }),
    );
    expect(parseCalendar(html)).toEqual([
      { dateKey: '20261120', year: 2026, name: 'I Copa Sol de Natación', city: normalizeCity('Liga Ejemplo de Natación'), discipline: 'SW', course: null, sourceUrl: `${PDF}/2026/20261120resultados.pdf` },
      { dateKey: '20250214', year: 2025, name: 'Festival de Verano', city: 'Club Ejemplo', discipline: 'SW', course: null, sourceUrl: `${PDF}/2025/20250214resultados.pdf` },
    ]);
  });

  it('reads a name that has « | » of its own, apostrophes and braces, and the text of a comment is never an event', () => {
    const html = calendar(
      event({ title: "Liga | Copa D'Ejemplo {A | B} 2026", url: pdf('20261120') }),
      "// { title:'Liga | Comentado', url:'" + pdf('20261121') + "' },",
      `/* { title:'Liga | Bloque', url:'${pdf('20261122')}' }, */`,
    );
    expect(parseCalendar(html).map((entry) => [entry.dateKey, entry.name])).toEqual([['20261120', "Copa D'Ejemplo {A | B} 2026"]]);
  });

  it('leaves out the events that are not a tournament: a page link, no link, a bad day, another host, another year and a title with no organizer', () => {
    const html = calendar(
      event({ title: 'Liga | Evento de una página', url: `${HOST}/c/123456` }),
      event({ title: 'Liga | Sin enlace' }),
      event({ title: 'Liga | Mes trece', url: pdf('20261320') }),
      event({ title: 'Liga | 30 de febrero', url: pdf('20260230') }),
      event({ title: 'Liga | Año distinto', url: pdf('20261120', '2025') }),
      event({ title: 'Liga | Otro sitio', url: pdf('20261120', '2026', 'example.invalid') }),
      event({ title: 'Torneo sin organizador', url: pdf('20261121') }),
      event({ title: 'Liga | Bueno', url: pdf('20261122') }),
    );
    expect(parseCalendar(html).map((entry) => entry.dateKey)).toEqual(['20261122']);
  });

  it('keeps the first event of a day: the day is the key of the tournament', () => {
    const html = calendar(event({ title: 'Liga | Primero', url: pdf('20261120') }), event({ title: 'Club | Segundo', url: pdf('20261120') }));
    expect(parseCalendar(html).map((entry) => entry.name)).toEqual(['Primero']);
  });

  it.each(EXCLUDED_DISCIPLINE_MARKERS)('leaves out an event whose title has the marker %j, in the name or in the organizer', (marker) => {
    const html = calendar(
      event({ title: `Liga | Torneo ${marker} 2026`, url: pdf('20261120') }),
      event({ title: `Liga ${marker.toUpperCase()} | Torneo`, url: pdf('20261121') }),
      event({ title: 'Liga | Torneo de natación', url: pdf('20261122') }),
    );
    expect(parseCalendar(html).map((entry) => entry.dateKey)).toEqual(['20261122']);
  });

  it('matches a marker without accents or capital letters, and only at the start of a word', () => {
    const html = calendar(
      event({ title: 'Liga | NACIONAL DE CLAVADOS', url: pdf('20261120') }),
      event({ title: 'Liga | Actividades Subacuáticas', url: pdf('20261121') }),
      event({ title: 'Liga | Copa Apolo de Natación', url: pdf('20261122') }),
    );
    expect(parseCalendar(html).map((entry) => entry.dateKey)).toEqual(['20261122']);
  });

  it('reads keys written as text, as JavaScript allows', () => {
    const html = `<script>x({ events: [ { "title": "Liga | Con clave de texto", 'url': '${pdf('20261120')}' } ] })</script>`;
    expect(parseCalendar(html).map((entry) => [entry.dateKey, entry.name])).toEqual([['20261120', 'Con clave de texto']]);
  });

  it('keeps a masters swimming event: it is swimming', () => {
    expect(one('Liga | Campeonato Internacional Máster de Natación').map((entry) => entry.name)).toEqual(['Campeonato Internacional Máster de Natación']);
  });

  it('never runs the script of the page', () => {
    const marker = '__calendarScriptRan';
    const html = `<script>
      globalThis.${marker} = true;
      $('#c').fullCalendar({ events: [
        { title: (globalThis.${marker} = true, 'Liga | Evaluado'), url: '${pdf('20261120')}' },
        { title: 'Liga | Texto', url: '${pdf('20261121')}' },
      ] });
    </script>`;
    // An event that is not a plain literal makes the page a shape this does not read: it is refused, and nothing was run.
    expect(() => parseCalendar(html)).toThrow(ProviderUnavailableError);
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
    const safe = html.replace(`(globalThis.${marker} = true, 'Liga | Evaluado')`, "'Liga | Evaluado'");
    expect(parseCalendar(safe).map((entry) => entry.dateKey)).toEqual(['20261120', '20261121']);
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
  });

  it.each([
    ['no events at all', '<html><body>mantenimiento</body></html>'],
    ['an empty list of events', '<script>x({ events: [ ] })</script>'],
    ['events that are not a list', '<script>x({ events: "no" })</script>'],
    ['events that never close', "<script>x({ events: [ { title:'Liga | Torneo', url:'" + pdf('20261120') + "' }, "],
    ['an event that is not an object', "<script>x({ events: [ 'texto' ] })</script>"],
    ['a string that never closes', "<script>x({ events: [ { title:'Liga | Torneo } ] })</script>"],
    ['no tournament among the events', calendar(event({ title: 'Liga | Página', url: `${HOST}/c/1` }))],
    ['no readable tournament, only excluded ones', calendar(event({ title: 'Liga | Clavados', url: pdf('20261120') }))],
  ])('is unavailable, never an empty list, with %s', (_label, html) => {
    expect(() => parseCalendar(html)).toThrow(ProviderUnavailableError);
  });
});

describe('the pool length of a calendar title', () => {
  it.each([
    ['Liga | Copa 25 m', 'SCM'],
    ['Liga | Copa 25M', 'SCM'],
    ['Liga | Copa 50 m', 'LCM'],
    ['Liga | Copa 50m', 'LCM'],
    ['Liga | Torneo de Piscina Corta', 'SCM'],
    ['Liga | Torneo de piscina larga', 'LCM'],
    ['Liga | Torneo de Curso Corto', 'SCM'],
    ['Liga | Torneo de Curso Largo', 'LCM'],
    ['Liga | Copa SC', 'SCM'],
    ['Liga | Copa LC', 'LCM'],
    ['Liga | Copa SCM', 'SCM'],
    ['Liga | Copa LCM', 'LCM'],
    ['Liga | Chequeo Piscina 50M', 'LCM'],
    ['Liga | Torneo de Natación', null],
    ['Liga | Torneo 250 m Open', null],
    ['Liga | Copa Sacos', null],
    ['Liga | Torneo 25 m y 50 m', null],
    ['Liga | Torneo de piscina corta y piscina larga', null],
  ])('reads %j as %j', (title, course) => {
    expect(one(title)[0].course).toBe(course);
  });

  it('lists the markers it reads, each one a pool of the catalog, so the results of a PDF can reuse them', () => {
    expect(COURSE_MARKERS.length).toBeGreaterThan(0);
    expect(COURSE_MARKERS.every(([, pool]) => isPool(pool))).toBe(true);
    expect(courseFromTitle('Copa Sol 50 m')).toBe('LCM');
    expect(courseFromTitle('Copa Sol')).toBeNull();
  });

  it('takes it from the organizer too: the whole title is read', () => {
    expect(one('Liga 25 m | Torneo')[0].course).toBe('SCM');
  });
});

// The platform answers its two pages by address: the index of results and the calendar.
const serve = (index: BodyInit | null, calendarBody: BodyInit | null) => jest.fn(async (url: string) => ok(url === CALENDAR_URL ? calendarBody : index));
const row = (dateKey: string, city = 'VAL, Cali', title = 'Torneo del índice') => `
  <tr><th scope="row">1</th>
    <td><a href="${PDF}/${dateKey.slice(0, 4)}/${dateKey}resultados.pdf" title="${title}" target="_blank">Liga | ${title}</a></td>
    <td>${city}</td><td>Nov-20</td><td>SW</td></tr>`;
const page = (...rows: string[]) => `<table><tbody>${rows.join('')}</tbody></table>`;

describe('listTournaments with the calendar', () => {
  it('reads the index and then the calendar, once each, and returns the index rows first and the calendar rows after', async () => {
    const fetchImpl = serve(page(row('20261120')), calendar(event({ title: 'Liga Ejemplo | Copa del calendario', url: pdf('20260314') })));
    const entries = await createCoColombiaacuatica(fetchImpl).listTournaments([2026]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([INDEX_URL, CALENDAR_URL]);
    expect(fetchImpl).toHaveBeenLastCalledWith(CALENDAR_URL, expect.objectContaining({ redirect: 'manual' }));
    expect(entries.map((entry) => [entry.dateKey, entry.name, entry.city])).toEqual([
      ['20261120', 'Torneo del índice', 'Cali'],
      ['20260314', 'Copa del calendario', 'Liga Ejemplo'],
    ]);
  });

  it('keeps one row for a day that both pages list: the index wins, with the real city of the venue', async () => {
    const fetchImpl = serve(page(row('20261120', 'ATL, Barranquilla', 'Nombre del índice')), calendar(event({ title: 'Liga del Atlántico | Nombre del calendario', url: pdf('20261120') })));
    expect(await createCoColombiaacuatica(fetchImpl).listTournaments([2026])).toEqual([
      { dateKey: '20261120', year: 2026, name: 'Nombre del índice', city: 'Barranquilla', discipline: 'SW', course: null, sourceUrl: `${PDF}/2026/20261120resultados.pdf` },
    ]);
  });

  it('keeps the pool length the calendar title gives to a day the index also lists, which the index never says', async () => {
    const fetchImpl = serve(page(row('20261120')), calendar(event({ title: 'Liga | Copa Piscina Larga', url: pdf('20261120') })));
    const [entry] = await createCoColombiaacuatica(fetchImpl).listTournaments([2026]);
    expect([entry.city, entry.course]).toEqual(['Cali', 'LCM']);
  });

  it('gives a day only the calendar has the organizer as city, spelled as the cities of the index, so a picker groups them', async () => {
    const fetchImpl = serve(page(row('20261120', 'BOG, Bogotá D.C.')), calendar(event({ title: 'BOGOTÁ D.C. | Copa de 2026', url: pdf('20260314') })));
    const entries = await createCoColombiaacuatica(fetchImpl).listTournaments([2026]);
    expect(entries.map((entry) => entry.city)).toEqual(['Bogota D.C.', 'Bogota D.C.']);
  });

  it('lists only the years asked, from both pages', async () => {
    const fetchImpl = serve(
      page(row('20261120'), row('20241120')),
      calendar(event({ title: 'Liga | Copa 2021', url: pdf('20210314') }), event({ title: 'Liga | Copa 2025', url: pdf('20250314') }), event({ title: 'Liga | Copa 2024', url: pdf('20240601') })),
    );
    const entries = await createCoColombiaacuatica(fetchImpl).listTournaments([2026, 2025, 2021]);
    expect(entries.map((entry) => entry.dateKey)).toEqual(['20261120', '20210314', '20250314']);
  });

  it('is unavailable when the calendar has a shape it does not know, even with a good index: never a partial list', async () => {
    const fetchImpl = serve(page(row('20261120')), '<html><body>mantenimiento</body></html>');
    await expect(createCoColombiaacuatica(fetchImpl).listTournaments([2026])).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('is unavailable when the calendar is over 2 MB, announced or not, and the stream is cut', async () => {
    const cancel = jest.fn();
    const big = jest.fn(async (url: string) => (url === CALENDAR_URL ? ok(new ReadableStream({ pull: (c) => c.enqueue(new Uint8Array(1024 * 1024)), cancel })) : ok(page(row('20261120')))));
    await expect(createCoColombiaacuatica(big).listTournaments([2026])).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
    expect(cancel).toHaveBeenCalled();
    const header = jest.fn(async (url: string) => (url === CALENDAR_URL ? ok('x', { headers: { 'content-length': String(3 * 1024 * 1024) } }) : ok(page(row('20261120')))));
    await expect(createCoColombiaacuatica(header).listTournaments([2026])).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
  });

  it('is unreachable, so its claim is given back, when the calendar does not answer', async () => {
    const fetchImpl = jest.fn(async (url: string) => (url === CALENDAR_URL ? ok('x', { status: 503 }) : ok(page(row('20261120')))));
    await expect(createCoColombiaacuatica(fetchImpl).listTournaments([2026])).rejects.toBeInstanceOf(SourceUnreachableError);
  });
});
