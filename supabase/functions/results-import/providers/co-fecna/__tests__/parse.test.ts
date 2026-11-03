import { AGE, BIRTH_DATE, CATEGORY, GENDER, IDENTITY, PROFILE_LABELS, historyPage, historyRow, option, profileCard, rosterPage } from './fixtures.ts';
import { decodeEntities, cellText } from '../html.ts';
import { normalizeNumber, parseProfile, parseRoster, parseRows } from '../parse.ts';

describe('decodeEntities', () => {
  it('decodes named, decimal and hexadecimal entities', () => {
    expect(decodeEntities('PE&Ntilde;A &aacute;&eacute; &#209; &#xF1;&nbsp;&amp;')).toBe('PEÑA áé Ñ ñ &');
  });
  it('fails on an entity it does not know instead of guessing', () => {
    expect(() => decodeEntities('A&zzzz;B')).toThrow();
  });
  it('decodes the named entities of text: accented letters, cedilla, quotes, dashes and spaces', () => {
    expect(decodeEntities('&ccedil;&Ccedil; &agrave;&Agrave; &ouml;&acirc;&atilde;&iuml; &ldquo;x&rdquo; &lsquo;y&rsquo; &ndash;&mdash; &ensp;&iexcl;&iquest;')).toBe(
      'çÇ àÀ öâãï “x” ‘y’ –— \u2002¡¿',
    );
  });
  it.each(['&#99999999;', '&#xD800;', '&#xDFFF;'])('fails on the numeric reference %s, which is no character, instead of guessing', (reference) => {
    expect(() => decodeEntities(`A${reference}B`)).toThrow();
  });
  it.each(['constructor', 'toString', 'hasOwnProperty'])('does not take &%s; for an entity from the object prototype', (name) => {
    expect(() => decodeEntities(`A&${name};B`)).toThrow();
  });
  it('drops tags and collapses spaces in a cell', () => {
    expect(cellText(' <b>28.45</b>&nbsp; \n ')).toBe('28.45');
  });
});

describe('normalizeNumber', () => {
  it.each([
    ['1234567890', '1234567890'],
    ['123-4', '1234'],
    ['1.234.567', '1234567'],
    [' 1234 ', '1234'],
    ['ab1234', 'AB1234'],
  ])('%j becomes %j', (raw, expected) => {
    expect(normalizeNumber(raw)).toBe(expected);
  });
  it.each(['', '  ', '12/34', 'x'.repeat(21)])('rejects %j', (raw) => {
    expect(() => normalizeNumber(raw)).toThrow();
  });
});

describe('parseRoster', () => {
  it('splits last names and first names on the line break, decodes entities and collapses spaces', () => {
    const page = rosterPage([option('1234567890', 'PE&Ntilde;A  G&Oacute;MEZ ', ' ANA   MARIA'), option(' 1.234-5', 'ruiz', 'juan')]);
    expect(parseRoster(page)).toEqual([
      { value: '1234567890', key: '1234567890', name: 'PEÑA GÓMEZ ANA MARIA' },
      { value: ' 1.234-5', key: '12345', name: 'ruiz juan' },
    ]);
  });

  it('decodes the named entities of Spanish and Portuguese names', () => {
    expect(parseRoster(rosterPage([option('1', 'FRAN&Ccedil;A', 'JOS&eacute; &Agrave;NGEL')]))[0]).toMatchObject({ name: 'FRANÇA JOSé ÀNGEL' });
  });

  it('keeps an entry with an unknown entity in the name as unreadable, with its key and no name', () => {
    const page = rosterPage([option('1', 'A&zzzz;', 'B'), option(' 2.2', 'C', 'D&qqqq;'), option('3', 'RUIZ', 'JUAN')]);
    expect(parseRoster(page)).toEqual([
      { unreadable: true, value: '1', key: '1' },
      { unreadable: true, value: ' 2.2', key: '22' },
      { value: '3', key: '3', name: 'RUIZ JUAN' },
    ]);
  });

  it('keeps an entry with an unknown entity in the value as unreadable and without a key', () => {
    const page = rosterPage([option('1&zzzz;', 'A', 'B'), option('2', 'C', 'D')]);
    expect(parseRoster(page)).toEqual([
      { unreadable: true, value: null, key: null },
      { value: '2', key: '2', name: 'C D' },
    ]);
  });

  it('still reads a list in which every entry is unreadable', () => {
    expect(parseRoster(rosterPage([option('1', 'A&zzzz;', 'B')]))).toEqual([{ unreadable: true, value: '1', key: '1' }]);
  });

  it('has no unreadable entries when every entity is known', () => {
    expect(parseRoster(rosterPage([option('1', 'A&ntilde;', 'B'), option('2', 'C', 'D')])).some((item) => 'unreadable' in item)).toBe(false);
  });

  it('reads only the swimmer selector', () => {
    const other = '<select name="prueba"><option value="1">Todas</option></select>';
    expect(parseRoster(rosterPage([option('1', 'A', 'B')]) + other)).toHaveLength(1);
  });

  it.each([
    ['no swimmer selector', '<html><select name="prueba"><option value="1">x</option></select></html>'],
    ['an empty list', rosterPage([])],
    ['an option with another attribute', rosterPage(['<option value="1" data-x="2">A\n B</option>'])],
    ['an option without a value', rosterPage(['<option>A\n B</option>'])],
    ['an option with a single block', rosterPage(['<option value="1">A B</option>'])],
    ['an option with three blocks', rosterPage(['<option value="1">A\nB\nC</option>'])],
    ['an option with markup inside', rosterPage(['<option value="1">A\n<b>B</b></option>'])],
    ['a number with other characters', rosterPage([option('12/34', 'A', 'B')])],
  ])('is unexpected with %s', (_label, page) => {
    expect(() => parseRoster(page)).toThrow();
  });
});

describe('the synthetic fixtures', () => {
  it('have the keys of the real shape, with invented values', () => {
    expect(Object.keys(historyRow()).sort()).toEqual(
      ['0', '1', '2', '3', '4', '5', '6', 'prueba_id', 'tiempo', 'torneo', 'fecha_torneo', 'piscina', 'diferencia', 'segundos', 'puntos', 'genero', 'fecha_nac', 'edad', 'categoria'].sort(),
    );
    expect(historyRow()).toMatchObject({ 1: '00:00:28.45', tiempo: '00:00:28.45', fecha_torneo: '2026-03-14', piscina: 'LC', segundos: 28.45 });
  });
});

describe('parseProfile', () => {
  it('reads the club and the league, and nothing else of the card', () => {
    const profile = parseProfile(historyPage());
    expect(profile).toEqual({ club: 'Club Sintético', league: 'Liga Sintética' });
    expect(JSON.stringify(profile)).not.toMatch(new RegExp(`${IDENTITY}|${GENDER}|${BIRTH_DATE}`));
  });

  it('keeps an empty club or league badge as null, without failing', () => {
    expect(parseProfile(historyPage(profileCard([...PROFILE_LABELS.slice(0, 3), ['Club', ' '], ['Liga', '']])))).toEqual({ club: null, league: null });
  });

  it('is unexpected when the whole card is missing', () => {
    expect(() => parseProfile(historyPage(''))).toThrow();
  });

  it.each([
    ['a card without the league', PROFILE_LABELS.filter(([label]) => label !== 'Liga')],
    ['a card without the club', PROFILE_LABELS.filter(([label]) => label !== 'Club')],
    ['a repeated club', [...PROFILE_LABELS, ['Club', 'Otro Club']] as [string, string][]],
  ])('is unexpected with %s', (_label, entries) => {
    expect(() => parseProfile(historyPage(profileCard(entries)))).toThrow();
  });

  it('is unexpected when the card links are not inside a `ul.nav`', () => {
    const outside = historyPage(profileCard().replace(/<\/?ul[^>]*>/g, ''));
    expect(() => parseProfile(outside)).toThrow();
    expect(() => parseProfile(historyPage(profileCard().replace('class="nav nav-pills flex-column"', 'class="navbar-nav"')))).toThrow();
  });

  it('ignores a nav-link with a club label outside the card', () => {
    const menu = '<div><a class="nav-link" href="#">Club <span class="badge">Otro Club</span></a></div>';
    expect(parseProfile(historyPage(menu + profileCard()))).toEqual({ club: 'Club Sintético', league: 'Liga Sintética' });
  });

  it('is unexpected on a page without the swimmer list, even with a card', () => {
    expect(() => parseProfile(`<html><h3>Mantenimiento</h3>${profileCard()}</html>`)).toThrow();
  });
});

describe('parseRows', () => {
  const body = (...rows: Record<string, unknown>[]) => JSON.stringify(rows);

  it('turns each row into a normalized result, with the event from the event number', () => {
    expect(parseRows(2, body(historyRow(), historyRow({ tiempo: '00:01:05.30', piscina: 'SC', torneo: 'Copa Sint?tica' })))).toEqual([
      { sourceResultKey: '2|LCM|2026-03-14|Synthetic Open|2845', stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: 2845, swumOn: '2026-03-14', competition: 'Synthetic Open' },
      { sourceResultKey: '2|SCM|2026-03-14|Copa Sint?tica|6530', stroke: 'FR', distance: '50m', pool: 'SCM', hundredths: 6530, swumOn: '2026-03-14', competition: 'Copa Sint?tica' },
    ]);
  });

  it.each([
    [2, 'FR', '50m'],
    [7, 'FR', '1500m'],
    [9, 'BK', '50m'],
    [11, 'BK', '200m'],
    [13, 'BR', '50m'],
    [15, 'BR', '200m'],
    [17, 'FL', '50m'],
    [19, 'FL', '200m'],
    [21, 'IM', '200m'],
    [22, 'IM', '400m'],
  ])('maps event number %i to %s %s', (prueba, stroke, distance) => {
    expect(parseRows(prueba, body(historyRow({}, prueba)))[0]).toMatchObject({ stroke, distance });
  });

  it.each([0, 1, 8, 12, 16, 20, 23])('does not know event number %i', (prueba) => {
    expect(() => parseRows(prueba, body(historyRow({}, prueba)))).toThrow();
  });

  it('accepts the event number as a string or a number in the row', () => {
    expect(parseRows(3, body(historyRow({}, '3')))).toHaveLength(1);
    expect(parseRows(3, body(historyRow({}, 3)))).toHaveLength(1);
  });

  it('is unexpected when a row belongs to another event than the one asked for', () => {
    expect(() => parseRows(2, body(historyRow({}, 3)))).toThrow();
  });

  it('turns an empty answer into no results', () => {
    expect(parseRows(2, '[]')).toEqual([]);
  });

  it.each([
    ['00:00:28.45', 2845],
    ['00:01:05.30', 6530],
    ['01:02:03.04', 372304],
    ['00:59:59.99', 359999],
  ])('reads the time %s as %i hundredths', (tiempo, hundredths) => {
    expect(parseRows(2, body(historyRow({ tiempo })))[0].hundredths).toBe(hundredths);
  });

  it.each([null, '', '  '])('keeps a missing time (%j) as null, never 0', (tiempo) => {
    expect(parseRows(2, body(historyRow({ tiempo })))[0].hundredths).toBeNull();
  });

  it.each(['28.45', '1:05.30', '00:60:00.00', '00:00:60.00', '00:00:28.4', 'abc', '00:00:00.00', 2845])('is unexpected with the time %j', (tiempo) => {
    expect(() => parseRows(2, body(historyRow({ tiempo })))).toThrow();
  });

  it.each([
    ['LC', 'LCM'],
    ['SC', 'SCM'],
  ])('maps the pool %s to the catalog value %s', (piscina, pool) => {
    expect(parseRows(2, body(historyRow({ piscina })))[0].pool).toBe(pool);
  });

  it.each(['XX', 'lc', '25', '50', 'LCM', '', null])('rejects the pool %j instead of guessing', (piscina) => {
    expect(() => parseRows(2, body(historyRow({ piscina })))).toThrow();
  });

  it.each(['14/03/2026', '2026-02-31', '2026-3-14', 'March 14', '', null])('is unexpected with the date %j', (fecha_torneo) => {
    expect(() => parseRows(2, body(historyRow({ fecha_torneo })))).toThrow();
  });

  it('keeps the tournament as the source writes it, and an empty one as null', () => {
    const [named, empty, absent] = parseRows(2, body(historyRow({ torneo: '  Copa  Sint?tica ' }), historyRow({ torneo: '', tiempo: '00:00:29.00' }), historyRow({ torneo: null, tiempo: '00:00:30.00' })));
    expect([named.competition, empty.competition, absent.competition]).toEqual(['Copa Sint?tica', null, null]);
  });

  it('never copies the gender, the birth date, the age, the category or anything outside the declared fields', () => {
    const [result] = parseRows(2, body(historyRow()));
    expect(Object.keys(result).sort()).toEqual(['competition', 'distance', 'hundredths', 'pool', 'sourceResultKey', 'stroke', 'swumOn']);
    expect(JSON.stringify(result)).not.toMatch(new RegExp(`${GENDER}|${BIRTH_DATE}|${AGE}|${CATEGORY}|segundos|text-success`));
  });

  it('does not import the age category (a number like 10 or 11) or the difference, which derive from personal data', () => {
    const rows = [historyRow({ categoria: 10, 0: 10, diferencia: '<span>DIFF-SENTINEL</span>', 2: '<span>DIFF-SENTINEL</span>' }), historyRow({ categoria: 11 })];
    const output = JSON.stringify(parseRows(2, body(...rows)));
    expect(output).not.toMatch(/DIFF-SENTINEL|categoria|diferencia/);
    expect(output).not.toMatch(/"(10|11)"|:(10|11)[,}]/);
  });

  it('keeps tournament names cut at about 40 characters and with ? for accents exactly as they arrive', () => {
    const torneo = 'Campeonato Sint?tico Departamental de Na';
    expect(parseRows(2, body(historyRow({ torneo })))[0].competition).toBe(torneo);
  });

  it('imports once, without error, two rows that differ only in the difference', () => {
    const results = parseRows(2, body(historyRow({ diferencia: '<span>-0.10</span>' }), historyRow({ diferencia: '<span>-0.20</span>' })));
    expect(results.map((result) => result.sourceResultKey)).toEqual(['2|LCM|2026-03-14|Synthetic Open|2845']);
  });

  it('keeps several rows of one year in one event, and does not depend on the order of the rows', () => {
    const rows = [
      historyRow({ tiempo: '00:01:05.52', fecha_torneo: '2026-06-01' }),
      historyRow({ tiempo: '00:01:06.10', fecha_torneo: '2026-01-10' }),
      historyRow({ tiempo: '00:01:07.00', fecha_torneo: '2026-09-09' }),
    ];
    const byTime = parseRows(2, body(...rows));
    const byDate = parseRows(2, body(...[...rows].sort((a, b) => String(a.fecha_torneo).localeCompare(String(b.fecha_torneo)))));
    expect(byTime).toHaveLength(3);
    expect(byTime[0].hundredths).toBe(6552);
    const key = (result: { sourceResultKey: string }) => result.sourceResultKey;
    expect(byDate.map(key).sort()).toEqual(byTime.map(key).sort());
  });

  it('builds the key from event, pool, date, tournament and time, whatever order the rows come in', () => {
    const rows = [historyRow({ tiempo: '00:01:05.52', fecha_torneo: '2026-06-01' }), historyRow({ tiempo: '00:01:06.10', fecha_torneo: '2026-01-10' })];
    const keys = (list: Record<string, unknown>[]) => parseRows(2, body(...list)).map((result) => result.sourceResultKey);
    expect(keys(rows)).toEqual(['2|LCM|2026-06-01|Synthetic Open|6552', '2|LCM|2026-01-10|Synthetic Open|6610']);
    expect(keys([...rows].reverse()).sort()).toEqual(keys(rows).sort());
  });

  it('keeps two rows that differ only in the pool as two results, whatever order they come in', () => {
    const rows = [historyRow({ piscina: 'LC' }), historyRow({ piscina: 'SC' })];
    const forward = parseRows(2, body(...rows));
    const backward = parseRows(2, body(...[...rows].reverse()));
    expect(forward.map((result) => result.sourceResultKey)).toEqual(['2|LCM|2026-03-14|Synthetic Open|2845', '2|SCM|2026-03-14|Synthetic Open|2845']);
    const byKey = (list: typeof forward) => Object.fromEntries(list.map((result) => [result.sourceResultKey, result.pool]));
    expect(byKey(backward)).toEqual(byKey(forward));
    expect(backward).toHaveLength(2);
  });

  it('re-importing the same rows in reverse order gives the same key for the same pool', () => {
    const rows = [historyRow({ piscina: 'LC', tiempo: '00:01:05.30' }), historyRow({ piscina: 'SC', tiempo: '00:01:05.30' }), historyRow({ piscina: 'SC' })];
    const byKey = (list: Record<string, unknown>[]) => Object.fromEntries(parseRows(2, body(...list)).map((result) => [result.sourceResultKey, result.pool]));
    expect(byKey([...rows].reverse())).toEqual(byKey(rows));
    expect(Object.keys(byKey(rows))).toHaveLength(3);
  });

  it('treats an empty or null time, and an empty, null or blank tournament, each as one value in the key', () => {
    const noTime = parseRows(2, body(historyRow({ tiempo: '' }), historyRow({ tiempo: null }), historyRow({ tiempo: '  ' })));
    expect(noTime.map((result) => [result.sourceResultKey, result.hundredths])).toEqual([['2|LCM|2026-03-14|Synthetic Open|', null]]);
    const noTournament = parseRows(2, body(historyRow({ torneo: '' }), historyRow({ torneo: null }), historyRow({ torneo: '   ' })));
    expect(noTournament.map((result) => [result.sourceResultKey, result.competition])).toEqual([['2|LCM|2026-03-14||2845', null]]);
    const otherPool = parseRows(2, body(historyRow({ tiempo: '' }), historyRow({ tiempo: null, piscina: 'SC' })));
    expect(otherPool.map((result) => result.sourceResultKey)).toEqual(['2|LCM|2026-03-14|Synthetic Open|', '2|SCM|2026-03-14|Synthetic Open|']);
  });

  it('keeps an HTML entity in the tournament as it arrives, without decoding it', () => {
    expect(parseRows(2, body(historyRow({ torneo: 'Copa &amp; Sint&eacute;tica' })))[0].sourceResultKey).toBe('2|LCM|2026-03-14|Copa &amp; Sint&eacute;tica|2845');
  });

  it('gives a cut tournament with ? the same key every time, using the text as it arrives', () => {
    const torneo = 'Campeonato Sint?tico Departamental de Na';
    const first = parseRows(2, body(historyRow({ torneo })))[0].sourceResultKey;
    expect(parseRows(2, body(historyRow({ torneo })))[0].sourceResultKey).toBe(first);
    expect(first).toBe(`2|LCM|2026-03-14|${torneo}|2845`);
  });

  it('gives tournaments that differ only in spaces (repeated, at the edge) the same key, as one result', () => {
    const results = parseRows(2, body(historyRow({ torneo: 'Copa Sint?tica' }), historyRow({ torneo: '  Copa   Sint?tica ' })));
    expect(results.map((result) => result.sourceResultKey)).toEqual(['2|LCM|2026-03-14|Copa Sint?tica|2845']);
  });

  it('joins exact duplicate rows into one result and one key, with no #n counter', () => {
    const results = parseRows(2, body(historyRow(), historyRow(), historyRow(), historyRow()));
    expect(results).toHaveLength(1);
    expect(results[0].sourceResultKey).toBe('2|LCM|2026-03-14|Synthetic Open|2845');
  });

  it('leaves no #n counter in any key, and a tournament that looks like one stays its own result', () => {
    const results = parseRows(2, body(historyRow(), historyRow(), historyRow({ torneo: 'Synthetic Open#1' })));
    expect(results.map((result) => result.sourceResultKey)).toEqual(['2|LCM|2026-03-14|Synthetic Open|2845', '2|LCM|2026-03-14|Synthetic Open#1|2845']);
  });

  it('importing the same answer twice yields the same keys, so it is still one row each', () => {
    const answer = body(historyRow(), historyRow(), historyRow({ tiempo: '00:01:05.30' }));
    const keys = [...parseRows(2, answer), ...parseRows(2, answer)].map((result) => result.sourceResultKey);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(2);
  });

  it('reads a valid JSON array whatever the page called it: the content type is never looked at', () => {
    expect(parseRows(2, ` \n${body(historyRow())}\n`)).toHaveLength(1);
  });

  it.each([
    ['text that is not JSON', '<html>maintenance</html>'],
    ['an empty body', ''],
    ['a JSON object', '{"0":1}'],
    ['a JSON string', '"[]"'],
    ['null', 'null'],
    ['a row that is not an object', '[1]'],
    ['a row that is null', '[null]'],
    ['a row that is an array', '[[]]'],
    ['a row without the event number', body(Object.fromEntries(Object.entries(historyRow()).filter(([key]) => key !== 'prueba_id')))],
    ['a row without the date', body(Object.fromEntries(Object.entries(historyRow()).filter(([key]) => key !== 'fecha_torneo')))],
    ['a row without the pool', body(Object.fromEntries(Object.entries(historyRow()).filter(([key]) => key !== 'piscina')))],
  ])('is unexpected with %s', (_label, text) => {
    expect(() => parseRows(2, text)).toThrow();
  });
});
