import { ProviderUnavailableError, type TournamentAthlete } from '../../../port.ts';
import { searchPdf } from '../pdfMatch.ts';
import { parsePdfResults } from '../pdfResults.ts';
import { FREE_50, ageGroup, document, event, pageHeader, row } from './pdfFixtures.ts';

const KEY = '20261120';
const athlete = (overrides: Partial<TournamentAthlete> = {}) =>
  ({ identityNumber: '0000000-synthetic', name: { firstName: 'Ana Maria', lastName: 'Sintetica Prueba' }, birthDate: '1995-08-11', gender: null, ...overrides }) as TournamentAthlete & { birthDate: string };
const search = (body: string[], who = athlete(), header = pageHeader()) => searchPdf(parsePdfResults(document(body, header), KEY), KEY, who);

const OTHER_PEOPLE = [
  row({ place: 1, birth: '950812', ht: 1, ln: 1, name: 'SINTETICA PRUEBA Ana Maria', time: '36.00' }), // one day off
  row({ place: 2, birth: '950811', ht: 1, ln: 2, name: 'FICTICIA EJEMPLO Luisa', time: '37.00' }), // same date, other person
  row({ place: 3, birth: '010101', ht: 1, ln: 3, name: 'MUESTRA FALSA Carla', time: '38.00' }),
];
const HER = row({ place: 4, birth: '950811', ht: 6, ln: 3, points: 257, name: 'SINTETICA PRUEBA Ana Maria', prelim: 'NT', time: '35.87' });

describe('searchPdf', () => {
  it('finds the athlete by birth date and by the first name and first surname among the words of the printed name', () => {
    const found = search([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), ...OTHER_PEOPLE, HER]);
    expect(found).toEqual({
      found: true,
      athlete: { name: 'SINTETICA PRUEBA Ana Maria', club: 'Club Sintetico' },
      results: [{ sourceResultKey: '20261120|pdf|1|6-3', stroke: 'FR', distance: '50m', pool: null, hundredths: 3587, swumOn: '2026-11-20', competition: 'Copa Sintetica Ejemplo 2026 - Ciudad Ficticia' }],
      matchedBy: 'name_and_birth_date',
      course: null,
    });
  });

  it('is not found when no row has the birth date, or none with the birth date has the words', () => {
    expect(search([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), ...OTHER_PEOPLE])).toEqual({ found: false });
    expect(search([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), HER], athlete({ birthDate: '1995-08-12' }))).toEqual({ found: false });
    expect(search([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), HER], athlete({ name: { firstName: 'Ana', lastName: 'Otra' } }))).toEqual({ found: false });
    expect(search([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), HER], athlete({ name: { firstName: 'Otra', lastName: 'Sintetica' } }))).toEqual({ found: false });
  });

  it('is not found for an athlete with no first name or no surname to look for', () => {
    expect(search([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), HER], athlete({ name: { firstName: ' ', lastName: 'Sintetica' } }))).toEqual({ found: false });
    expect(search([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), HER], athlete({ name: { firstName: 'Ana', lastName: '' } }))).toEqual({ found: false });
  });

  it('matches without accents or capitals, and takes only the first word of each name', () => {
    const body = [event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), row({ birth: '950811', name: 'MUNOZ PENA Jose Maria', time: '30.00' })];
    expect(search(body, athlete({ name: { firstName: 'JOSÉ Luis', lastName: 'Muñoz Otro' } })).found).toBe(true);
    expect(search(body, athlete({ name: { firstName: 'Luis José', lastName: 'Muñoz' } })).found).toBe(false);
  });

  it.each(['?', '•'])('matches a letter the font of the PDF could not draw (%s)', (lost) => {
    const body = [event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), row({ birth: '950811', name: `PE${lost}A MU${lost}OZ Mar${lost}a`, time: '30.00' })];
    expect(search(body, athlete({ name: { firstName: 'María', lastName: 'Peña' } })).found).toBe(true);
    // One lost letter stands for one letter, nothing else.
    expect(search(body, athlete({ name: { firstName: 'Mara', lastName: 'Peña' } })).found).toBe(false);
  });

  it('uses the sex of the athlete, when known, to leave out the events of the other sex', () => {
    const body = [
      event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), row({ birth: '950811', ht: 1, name: 'SINTETICA PRUEBA Ana Maria', time: '30.00' }),
      event(2, FREE_50, 'Men'), ageGroup('Open 30-34', 'm'), row({ birth: '950811', ht: 1, name: 'SINTETICA PRUEBA Ana Maria', time: '29.00' }),
    ];
    const keysOf = (gender: 'F' | 'M' | null) => {
      const found = search(body, athlete({ gender }));
      return found.found ? found.results.map((r) => r.sourceResultKey) : [];
    };
    expect(keysOf('F')).toEqual(['20261120|pdf|1|1-1']);
    expect(keysOf('M')).toEqual(['20261120|pdf|2|1-1']);
    expect(keysOf(null)).toEqual(['20261120|pdf|1|1-1', '20261120|pdf|2|1-1']);
  });

  it('is unavailable when two different printed names fit the birth date and the words: it cannot be known who is the athlete', () => {
    const body = [
      event(1, FREE_50, 'Women'), ageGroup('Open 30-34'),
      row({ birth: '950811', ht: 1, name: 'SINTETICA PRUEBA Ana Maria', time: '30.00' }),
      row({ birth: '950811', ht: 2, name: 'SINTETICA PRUEBA Ana Lucia', time: '31.00' }),
    ];
    expect(() => search(body)).toThrow(new ProviderUnavailableError('More than one person of the tournament PDF fits the athlete'));
  });

  it('is one person when the same printed name swims several events, and offers each row once', () => {
    const body = [
      event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), row({ birth: '950811', ht: 6, ln: 3, name: 'SINTETICA PRUEBA Ana Maria', time: '35.87' }),
      event(5, '50m Espalda/50m Back', 'Women'), ageGroup('Open 30-34'), row({ birth: '950811', ht: 2, ln: 4, name: 'SINTETICA PRUEBA Ana Maria', time: '40.10' }),
    ];
    const found = search(body);
    expect(found.found && found.results.map((r) => [r.sourceResultKey, r.stroke])).toEqual([['20261120|pdf|1|6-3', 'FR'], ['20261120|pdf|5|2-4', 'BK']]);
  });

  it('uses the age group and the row position in the key when the row has no heat and no lane', () => {
    const body = [
      event(1, FREE_50, 'Women'),
      ageGroup('Open 30-34'),
      row({ birth: '000101', ht: null, ln: null, name: 'FICTICIA EJEMPLO Luisa', time: '30.00' }),
      ageGroup('Open 35-39'),
      row({ birth: '000102', ht: null, ln: null, name: 'MUESTRA FALSA Carla', time: '30.00' }),
      row({ birth: '950811', ht: null, ln: null, name: 'SINTETICA PRUEBA Ana Maria', time: '35.87' }),
    ];
    const found = search(body);
    expect(found.found && found.results.map((r) => r.sourceResultKey)).toEqual(['20261120|pdf|1|0-0|2|2']);
  });

  it('is unavailable when two rows of the athlete have the same key', () => {
    const body = [
      event(1, FREE_50, 'Women'), ageGroup('Open 30-34'),
      row({ birth: '950811', ht: 1, ln: 1, name: 'SINTETICA PRUEBA Ana Maria', time: '35.00' }),
      row({ birth: '950811', ht: 1, ln: 1, name: 'SINTETICA PRUEBA Ana Maria', time: '36.00' }),
    ];
    expect(() => search(body)).toThrow(ProviderUnavailableError);
  });

  it('fills the pool length of every row when the header states it', () => {
    const found = search([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), HER], athlete(), pageHeader('Copa Sintetica 2026 piscina de 25 m'));
    expect(found.found && [found.course, found.results.map((r) => r.pool)]).toEqual(['SCM', ['SCM']]);
  });

  it('gives out only the name, the club and the athlete\'s rows: no birth date, no other swimmer, no number', () => {
    const found = search([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), ...OTHER_PEOPLE, HER]);
    const json = JSON.stringify(found);
    for (const secret of ['950811', '950812', '010101', 'FICTICIA', 'MUESTRA', 'Luisa', 'Carla', '0000000-synthetic', '1995-08-11', 'ZZA']) expect(json).not.toContain(secret);
    expect(Object.keys(found.found ? found.athlete : {}).sort()).toEqual(['club', 'name']);
  });
});
