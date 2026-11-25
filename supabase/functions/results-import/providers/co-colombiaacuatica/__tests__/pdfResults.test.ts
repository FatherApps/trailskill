import { ProviderUnavailableError } from '../../../port.ts';
import { parsePdfResults } from '../pdfResults.ts';
import { COLUMNS, FREE_50, ageGroup, cells, document, event, pageHeader, row } from './pdfFixtures.ts';

const KEY = '20261120';
const parse = (body: string[], header = pageHeader()) => parsePdfResults(document(body, header), KEY);

describe('parsePdfResults', () => {
  it('reads the header, the events, the age groups and the rows', () => {
    const parsed = parse([
      event(1, FREE_50, 'Women'),
      ageGroup('Open 30-34'),
      COLUMNS,
      row({ place: 1, birth: '950811', ht: 6, ln: 3, points: 257, name: 'SINTETICA PRUEBA Ana Maria', prelim: 'NT', time: '35.87' }),
      row({ place: 2, birth: '960102', ht: 5, ln: 1, points: 42, name: 'FICTICIA EJEMPLO Luisa', prelim: '1:05.22', time: '1:05.22' }),
      ageGroup('Open 35-39'),
      COLUMNS,
      row({ place: 1, birth: '901010', ht: 5, ln: 2, name: 'MUESTRA FALSA Carla Ines', time: '28.06' }),
    ]);
    expect(parsed.competition).toBe('Copa Sintetica Ejemplo 2026 - Ciudad Ficticia');
    expect(parsed.swumOn).toBe('2026-11-20');
    expect(parsed.course).toBeNull();
    expect(parsed.rows).toEqual([
      { eventNumber: 1, stroke: 'FR', distance: '50m', gender: 'F', ageGroupIndex: 1, rowIndex: 1, heat: 6, lane: 3, birth: '950811', name: 'SINTETICA PRUEBA Ana Maria', club: 'Club Sintetico', hundredths: 3587 },
      { eventNumber: 1, stroke: 'FR', distance: '50m', gender: 'F', ageGroupIndex: 1, rowIndex: 2, heat: 5, lane: 1, birth: '960102', name: 'FICTICIA EJEMPLO Luisa', club: 'Club Sintetico', hundredths: 6522 },
      { eventNumber: 1, stroke: 'FR', distance: '50m', gender: 'F', ageGroupIndex: 2, rowIndex: 1, heat: 5, lane: 2, birth: '901010', name: 'MUESTRA FALSA Carla Ines', club: 'Club Sintetico', hundredths: 2806 },
    ]);
  });

  it('reads a row without Place and a row without Points', () => {
    const { rows } = parse([
      event(2, FREE_50, 'Men'),
      ageGroup('Open 45-49', 'm'),
      row({ birth: '860103', ht: 4, ln: 4, name: 'SINTETICO RARO Pedro', time: 'NT' }),
      row({ place: 3, birth: '860104', ht: 4, ln: 5, points: null, name: 'SINTETICO RARO Juan', time: '31.25' }),
    ]);
    expect(rows.map(({ birth, hundredths, gender }) => [birth, hundredths, gender])).toEqual([['860103', null, 'M'], ['860104', 3125, 'M']]);
  });

  it('skips a Points cell with decimals («22.00»), as one with none or a whole number', () => {
    const { rows } = parse([
      event(2, FREE_50, 'Men'),
      ageGroup('Open 45-49', 'm'),
      row({ place: 1, birth: '860103', ht: 1, ln: 6, points: '22.00', name: 'SINTETICO RARO Pedro', prelim: 'N.T.', time: '31.25' }),
      row({ place: 2, birth: '860104', ht: 1, ln: 5, points: '8.5', name: 'SINTETICO RARO Juan', time: '1:02.10' }),
    ]);
    expect(rows.map(({ birth, name, hundredths }) => [birth, name, hundredths])).toEqual([['860103', 'SINTETICO RARO Pedro', 3125], ['860104', 'SINTETICO RARO Juan', 6210]]);
  });

  it.each([
    ['N.T.', 'N.T.'], ['NT', 'NT'], ['DQ', 'DQ'], ['No Show', 'No Show'], ['DNF', 'DNF'], ['a zero time', '00.00'],
  ])('gives missing hundredths (never 0) for %s', (_label, time) => {
    const { rows } = parse([event(1, FREE_50, 'Men'), ageGroup('Open 20-24', 'm'), row({ birth: '000101', name: 'SINTETICO RARO Pedro', time })]);
    expect(rows[0].hundredths).toBeNull();
  });

  it('reads times with and without minutes, to the hundredth', () => {
    const times = ['9.05', '59.99', '1:00.01', '12:34.56'];
    const { rows } = parse([event(1, FREE_50, 'Men'), ageGroup('Open 20-24', 'm'), ...times.map((time, index) => row({ birth: '000101', ht: index + 1, name: 'SINTETICO RARO Pedro', time }))]);
    expect(rows.map((r) => r.hundredths)).toEqual([905, 5999, 6001, 75456]);
  });

  it('takes the last time or status of the row as the time, and ignores an observation after it', () => {
    const { rows } = parse([
      event(1, FREE_50, 'Men'),
      ageGroup('Open 20-24', 'm'),
      row({ birth: '000101', ht: 1, name: 'SINTETICO RARO Pedro', prelim: '31.87', time: '31.50', obsv: 'RC' }),
      row({ birth: '000102', ht: 2, name: 'SINTETICO RARO Juan', prelim: 'NT', time: 'DQ' }),
    ]);
    expect(rows.map((r) => r.hundredths)).toEqual([3150, null]);
  });

  it('skips relays, mixed events and strokes or distances it does not know, and the rows under them, whatever their layout', () => {
    const { rows } = parse([
      event(3, '4x50m Libre/4x50m Free', 'Men'),
      ageGroup('Open 80-99', 'm'),
      cells('1', 'ZZA/Club Sintetico', '1:59.99'),
      cells('2', '000101', 'not a row of the individual layout'),
      event(4, '50m Delfin/50m Dolphin', 'Women'),
      ageGroup('Open 20-24'),
      row({ birth: '000101', name: 'SINTETICA PRUEBA Ana', time: '30.00' }),
      event(5, '75m Libre/75m Free', 'Women'),
      row({ birth: '000101', name: 'SINTETICA PRUEBA Ana', time: '30.00' }),
      event(6, '50m Pecho/50m Breast', 'Women'),
      ageGroup('Open 20-24'),
      row({ birth: '000101', name: 'SINTETICA PRUEBA Ana', time: '40.00' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventNumber: 6, stroke: 'BR', hundredths: 4000 });
  });

  it.each([
    ['50m Libre/50m Free', 'FR', '50m'], ['100m Espalda/100m Back', 'BK', '100m'], ['200m Pecho/200m Breast', 'BR', '200m'], ['25m Mariposa/25m Fly', 'FL', '25m'],
    ['400m Combinado/400m IM', 'IM', '400m'], ['200m Combinado Individual/200m Individual Medley', 'IM', '200m'], ['800m Libre/800m Freestyle', 'FR', '800m'],
    ['1500m Libre/1500m Free', 'FR', '1500m'], ['100m Mariposa/100m Butterfly', 'FL', '100m'], ['100m Espalda/100m Backstroke', 'BK', '100m'],
  ])('maps the event «%s» to the sport catalogs', (title, stroke, distance) => {
    const { rows } = parse([event(1, title, 'Men'), ageGroup('Open 20-24', 'm'), row({ birth: '000101', name: 'SINTETICO RARO Pedro', time: '1:00.00' })]);
    expect(rows[0]).toMatchObject({ stroke, distance });
  });

  it('counts a continued event on: the repeated header and age group at the top of the next page change nothing', () => {
    const { rows } = parse([
      event(2, FREE_50, 'Men'),
      ageGroup('Open 45-49', 'm'),
      COLUMNS,
      row({ place: 1, birth: '000101', ht: 1, ln: 1, name: 'SINTETICO RARO Pedro', time: '30.00' }),
      `Continuado... 2 ${FREE_50} Men | ${ageGroup('Open 45-49', 'm')}`,
      COLUMNS,
      row({ place: 2, birth: '000102', ht: 1, ln: 2, name: 'SINTETICO RARO Juan', time: '31.00' }),
      ageGroup('Open 50-54', 'm'),
      row({ place: 1, birth: '000103', ht: 2, ln: 1, name: 'SINTETICO RARO Luis', time: '29.00' }),
    ]);
    expect(rows.map(({ ageGroupIndex, rowIndex }) => [ageGroupIndex, rowIndex])).toEqual([[1, 1], [1, 2], [2, 1]]);
  });

  it('has heat and lane 0 when the row has neither', () => {
    const { rows } = parse([event(1, FREE_50, 'Men'), ageGroup('Open 20-24', 'm'), row({ birth: '000101', ht: null, ln: null, name: 'SINTETICO RARO Pedro', time: '30.00' })]);
    expect(rows[0]).toMatchObject({ heat: 0, lane: 0 });
  });

  it('keeps the club after the league, or the whole team when it has no league', () => {
    const { rows } = parse([
      event(1, FREE_50, 'Men'),
      ageGroup('Open 20-24', 'm'),
      row({ birth: '000101', ht: 1, name: 'SINTETICO RARO Pedro', team: 'ZZA/Club Sintetico Norte', time: '30.00' }),
      row({ birth: '000102', ht: 2, name: 'SINTETICO RARO Juan', team: 'Club Libre', time: '30.00' }),
    ]);
    expect(rows.map((r) => r.club)).toEqual(['Club Sintetico Norte', 'Club Libre']);
  });

  it('keeps a name whose accents the font lost', () => {
    const { rows } = parse([event(1, FREE_50, 'Men'), ageGroup('Open 20-24', 'm'), row({ birth: '000101', name: 'PE?A MU•OZ Mar•a', time: '30.00' })]);
    expect(rows[0].name).toBe('PE?A MU•OZ Mar•a');
  });

  it('leaves out lines that are not rows: covers, column titles, footers', () => {
    const { rows } = parse([event(1, FREE_50, 'Men'), ageGroup('Open 20-24', 'm'), COLUMNS, cells('Page 2/2', 'Documento sintetico', '2026112275201', 'contacto@example.test'), row({ birth: '000101', name: 'SINTETICO RARO Pedro', time: '30.00' })]);
    expect(rows).toHaveLength(1);
  });

  describe('the date', () => {
    it.each([
      ['20 - 21 de noviembre de 2026', '2026-11-20'],
      ['30 de noviembre - 1 de diciembre de 2026', '2026-11-30'],
      ['5 de marzo de 2026', '2026-03-05'],
      ['7 - 8 de Septiembre de 2026', '2026-09-07'],
    ])('takes the first day of «%s»', (days, swumOn) => {
      expect(parse([event(1, FREE_50, 'Men')], pageHeader('Copa 2026', days)).swumOn).toBe(swumOn);
    });

    it.each([['a header with no days', 'Ciudad Ficticia'], ['a day that does not exist', '31 de febrero de 2026'], ['a month it does not know', '5 de brumario de 2026']])('is the day of the tournament key with %s', (_label, days) => {
      expect(parse([event(1, FREE_50, 'Men')], pageHeader('Copa 2026', days)).swumOn).toBe('2026-11-20');
    });
  });

  describe('the pool length', () => {
    it.each([
      ['Copa Sintetica 2026 Piscina de 50 m', 'LCM'],
      ['Copa Sintetica 2026 curso corto', 'SCM'],
      ['Copa Sintetica 2026 SCM', 'SCM'],
    ])('is the one the header says in so many words («%s»)', (name, course) => {
      expect(parse([event(1, FREE_50, 'Men')], pageHeader(name)).course).toBe(course);
    });

    it('is none when the header says none, or says both', () => {
      expect(parse([event(1, FREE_50, 'Men')]).course).toBeNull();
      expect(parse([event(1, FREE_50, 'Men')], pageHeader('Copa 2026 piscina corta y piscina larga')).course).toBeNull();
    });

    it('reads the cover too, but never an address or an e-mail', () => {
      const lines = ['Sede: piscina larga', cells('contacto 25 m @example.test'), ...pageHeader(), event(1, FREE_50, 'Men'), ageGroup('Open 20-24', 'm'), row({ birth: '000101', name: 'SINTETICO RARO Pedro', time: '30.00' })];
      expect(parsePdfResults(lines, KEY).course).toBe('LCM');
    });
  });

  describe('what it cannot read', () => {
    const body = (rowLine: string) => [event(1, FREE_50, 'Men'), ageGroup('Open 20-24', 'm'), rowLine];
    const unreadable = (lines: string[]) => expect(() => parsePdfResults(document(lines), KEY)).toThrow(ProviderUnavailableError);

    it('refuses a PDF with no event', () => {
      expect(() => parsePdfResults(['RESULTADOS', 'nada'], KEY)).toThrow(ProviderUnavailableError);
    });

    it.each([
      ['a month 13 birth date', row({ birth: '991301', name: 'SINTETICO RARO Pedro', time: '30.00' })],
      ['a day 32 birth date', row({ birth: '990132', name: 'SINTETICO RARO Pedro', time: '30.00' })],
      ['a heat without a lane', cells('1', '000101', '4', 'ZZA/Club Sintetico', 'SINTETICO RARO Pedro', 'NT', '30.00')],
      ['no team', cells('1', '000101', '1', '1', 'SINTETICO RARO Pedro', 'NT', '30.00')],
      ['no name', cells('1', '000101', '1', '1', 'ZZA/Club Sintetico', 'NT', '30.00')],
      ['no time and no status', row({ birth: '000101', name: 'SINTETICO RARO Pedro', prelim: '', time: '' })],
      ['a time it does not know', row({ birth: '000101', name: 'SINTETICO RARO Pedro', time: '30,00' })],
      ['seconds over 59', row({ birth: '000101', name: 'SINTETICO RARO Pedro', time: '1:75.00' })],
      ['three times', cells('1', '000101', '1', '1', 'ZZA/Club Sintetico', 'SINTETICO RARO Pedro', '31.00', '30.00', '30.00')],
      ['two observations', cells('1', '000101', '1', '1', 'ZZA/Club Sintetico', 'SINTETICO RARO Pedro', 'NT', '30.00', 'RC', 'RN')],
    ])('refuses a row with %s, never skipping it in silence', (_label, line) => {
      unreadable(body(line));
    });

    it('refuses a row before any age group', () => {
      unreadable([event(1, FREE_50, 'Men'), row({ birth: '000101', name: 'SINTETICO RARO Pedro', time: '30.00' })]);
    });

    it('does not refuse an unreadable row of a relay or an event it skips', () => {
      expect(() => parsePdfResults(document([event(1, '4x50m Libre/4x50m Free', 'Men'), ageGroup('Open 20-24', 'm'), cells('000101', 'x')]), KEY)).not.toThrow();
    });
  });
});
