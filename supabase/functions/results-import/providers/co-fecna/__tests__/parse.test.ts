import { HEADERS, historyPage, option, rosterPage, table } from './fixtures.ts';
import { decodeEntities, cellText } from '../html.ts';
import { normalizeNumber, parseHistory, parseRoster } from '../parse.ts';

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

describe('parseHistory', () => {
  const row = { time: '1:05.30', date: '14/03/2026', pool: '25m', competition: 'Copa&nbsp;Sint&eacute;tica' };

  it('turns each row into a normalized result using the table id for the event', () => {
    const page = historyPage([table('50l', [{}]), table('200e', [row]), table('400c', [{ pool: '50 m' }])]);
    expect(parseHistory(page).results).toEqual([
      { sourceResultKey: '50l|LCM|2026-03-14|28.45|Synthetic Open', stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: 2845, swumOn: '2026-03-14', competition: 'Synthetic Open' },
      { sourceResultKey: '200e|SCM|2026-03-14|1:05.30|Copa Sintética', stroke: 'BK', distance: '200m', pool: 'SCM', hundredths: 6530, swumOn: '2026-03-14', competition: 'Copa Sintética' },
      { sourceResultKey: '400c|LCM|2026-03-14|28.45|Synthetic Open', stroke: 'IM', distance: '400m', pool: 'LCM', hundredths: 2845, swumOn: '2026-03-14', competition: 'Synthetic Open' },
    ]);
  });

  it.each([
    ['50l', 'FR', '50m'],
    ['100e', 'BK', '100m'],
    ['200p', 'BR', '200m'],
    ['100m', 'FL', '100m'],
    ['1500l', 'FR', '1500m'],
  ])('maps table %s to %s %s', (id, stroke, distance) => {
    expect(parseHistory(historyPage([table(id, [{}])])).results[0]).toMatchObject({ stroke, distance });
  });

  it('lists the years with results as the only affiliation, since the page gives no club or league in the known structure', () => {
    const page = historyPage([table('50l', [{ date: '2026-03-14' }, { date: '2024-05-01' }, { date: '2026-06-01' }])]);
    expect(parseHistory(page).affiliations).toEqual([{ club: null, league: null, years: [2024, 2026] }]);
  });

  it('never uses the heading, the category or anything else outside the declared columns', () => {
    const page = historyPage([table('50l', [{ category: 'BIRTH-2014-05' }])], '<h3>ANA PEREZ</h3>');
    expect(JSON.stringify(parseHistory(page))).not.toMatch(/ANA|PEREZ|2014|BIRTH/);
  });

  it('keeps a missing time as null, never 0', () => {
    expect(parseHistory(historyPage([table('50l', [{ time: '' }, { time: '-' }])])).results.map((result) => result.hundredths)).toEqual([null, null]);
  });

  it('gives repeated rows different keys', () => {
    const keys = parseHistory(historyPage([table('50l', [{}, {}])])).results.map((result) => result.sourceResultKey);
    expect(new Set(keys).size).toBe(2);
  });

  it('gives unique keys even when a competition looks like a repeat counter', () => {
    const rows = [{}, {}, { competition: 'Synthetic Open#1' }];
    const keys = parseHistory(historyPage([table('50l', rows)])).results.map((result) => result.sourceResultKey);
    expect(new Set(keys).size).toBe(3);
  });

  it.each([
    ['all tables empty', historyPage([table('50l'), table('100l')])],
    ['no tables at all', historyPage([])],
  ])('treats %s as no results', (_label, page) => {
    expect(parseHistory(page)).toEqual({ affiliations: [], results: [] });
  });

  it('ignores tables it does not recognize by id', () => {
    expect(parseHistory(historyPage(['<table id="other"><tr><td>x</td></tr></table>']))).toEqual({ affiliations: [], results: [] });
  });

  const swapped = [...HEADERS];
  [swapped[1], swapped[4]] = [swapped[4], swapped[1]];
  it.each([
    ['a table without a header', `<table id="50l"><tr><td>x</td></tr></table>`],
    ['columns in another order', historyPage([table('50l', [{}], swapped)])],
    ['a missing column', historyPage([table('50l', [{}], HEADERS.slice(0, 6))])],
    ['an extra column', historyPage([table('50l', [{}], [...HEADERS, 'Extra'])])],
    ['a row with fewer cells', historyPage([table('50l').replace('</table>', '<tr><td>1</td></tr></table>')])],
    ['an event the catalog does not have', historyPage([table('75l', [{}])])],
    ['an unknown stroke letter', historyPage([table('50x', [{}])])],
    ['a repeated table', historyPage([table('50l', [{}]), table('50l', [{}])])],
    ['an upper-case table id', historyPage([table('50L', [{}]), table('50l', [{}])])],
    ['an unclosed table', historyPage([table('50l', [{}]).replace('</table>', '')])],
    ['an unclosed row', historyPage([table('50l', [{}]).replace('</tr></table>', '</table>')])],
    ['an unclosed cell', historyPage([table('50l', [{}]).replace('</td></tr></table>', '</tr></table>')])],
    ['a page without the swimmer list', '<html><h3>Mantenimiento</h3></html>'],
    ['a time in another format', historyPage([table('50l', [{ time: '28 seconds' }])])],
    ['a zero time', historyPage([table('50l', [{ time: '0.00' }])])],
    ['a date in another format', historyPage([table('50l', [{ date: 'March 14' }])])],
    ['a date that does not exist', historyPage([table('50l', [{ date: '31/02/2026' }])])],
    ['a pool in another format', historyPage([table('50l', [{ pool: 'olympic' }])])],
  ])('is unexpected with %s', (_label, page) => {
    expect(() => parseHistory(page)).toThrow();
  });
});
