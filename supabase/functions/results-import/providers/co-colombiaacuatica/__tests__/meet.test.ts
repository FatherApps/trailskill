import { ProviderUnavailableError } from '../../../port.ts';
import { TOURNAMENT_PDF, tournamentFromKey, tournamentPdfUrl } from '../lookup.ts';
import { LENEX_DISCIPLINE, fetchMeetHeader, keysFromUrls, readMeetHeader } from '../meet.ts';
import { normalizeCity, normalizeCityName } from '../tournaments.ts';
import { buildZip } from './zipBuilder.ts';

const HOST = 'www.colombiaacuatica.com';
const bytes = (s: string) => new TextEncoder().encode(s);
const meet = (attrs: string, rest = '') => `<?xml version="1.0"?><LENEX version="3.0"><MEETS><MEET ${attrs}>${rest}</MEET></MEETS></LENEX>`;
const ATHLETE = '<CLUBS><CLUB name="Club Sintético"><ATHLETES><ATHLETE first="Ana" last="Prueba" license="1.234.567"/></ATHLETES></CLUB></CLUBS>';

describe('normalizeCityName', () => {
  it('spells a bare city like the index does, without cutting at a comma', () => {
    expect(normalizeCityName('  BOGOTÁ  d.c. ')).toBe('Bogota D.C.');
    expect(normalizeCityName('Cali, Valle')).toBe('Cali, Valle');
  });

  it('is what normalizeCity does after the department prefix', () => {
    expect(normalizeCity('VAL, Cali')).toBe(normalizeCityName('Cali'));
  });
});

describe('readMeetHeader', () => {
  it('reads the name and the normalized city of the MEET and nothing else', () => {
    expect(readMeetHeader(meet('name="Copa  Sintética &amp; Más" city="BARRANQUILLA" course="LCM"', ATHLETE))).toEqual({ name: 'Copa Sintética & Más', city: 'Barranquilla' });
  });

  it('never parses what follows the MEET tag: a broken body does not matter and no participant is read', () => {
    expect(readMeetHeader('<LENEX><MEETS><MEET name="Copa" city="Cali"><ATHLETE first="Ana" <<broken')).toEqual({ name: 'Copa', city: 'Cali' });
  });

  it('reads a self-closing MEET', () => {
    expect(readMeetHeader('<LENEX><MEETS><MEET name="Copa" city="Cali"/></MEETS></LENEX>')).toEqual({ name: 'Copa', city: 'Cali' });
  });

  it.each([
    ['no MEET', '<LENEX><MEETS/></LENEX>'],
    ['no name', meet('city="Cali"')],
    ['an empty name', meet('name=" " city="Cali"')],
    ['no city', meet('name="Copa"')],
    ['an empty city', meet('name="Copa" city=""')],
    ['an unknown entity', meet('name="Copa &foo;" city="Cali"')],
  ])('is unavailable with %s', (_label, text) => {
    expect(() => readMeetHeader(text)).toThrow(ProviderUnavailableError);
  });
});

describe('fetchMeetHeader', () => {
  it('downloads the zip of the day and reads only the header', async () => {
    const zip = await buildZip([{ name: 'r.lef', data: bytes(meet('name="Copa" city="Cali"', ATHLETE)), method: 8 }]);
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      return new Response(zip, { status: 200 });
    };
    expect(await fetchMeetHeader(fetchImpl, 2025, '20251018')).toEqual({ name: 'Copa', city: 'Cali' });
    expect(urls).toEqual([tournamentFromKey(2025, '20251018').zipUrl]);
  });

  it('is unavailable when the day has no file', async () => {
    await expect(fetchMeetHeader(async () => new Response('', { status: 404 }), 2025, '20251018')).rejects.toThrow(ProviderUnavailableError);
  });

  it('is unavailable when the file is not text', async () => {
    const zip = await buildZip([{ name: 'r.lef', data: new Uint8Array([0xff, 0xfe, 0x00]), method: 0 }]);
    await expect(fetchMeetHeader(async () => new Response(zip, { status: 200 }), 2025, '20251018')).rejects.toThrow(ProviderUnavailableError);
  });
});

describe('tournamentPdfUrl', () => {
  it('is an address the index would list', () => {
    expect(TOURNAMENT_PDF.exec(tournamentPdfUrl(2025, '20251018'))?.slice(1)).toEqual(['2025', '20251018']);
  });

  it('refuses a key that is not a day of that year', () => {
    expect(() => tournamentPdfUrl(2025, '20240230')).toThrow(ProviderUnavailableError);
  });
});

describe('keysFromUrls', () => {
  const folder = (year: number, key: string) => `https://${HOST}/backtun/torneos/${year}/${key}/`;

  it('takes the key of a tournament folder or of its PDF, once, in the order met', () => {
    expect(keysFromUrls([folder(2025, '20251018'), tournamentPdfUrl(2024, '20240316'), `${folder(2025, '20251018')}index.php`])).toEqual([
      { year: 2025, dateKey: '20251018' },
      { year: 2024, dateKey: '20240316' },
    ]);
  });

  it('leaves out other hosts, invalid days and anything that is not an exact tournament address', () => {
    expect(
      keysFromUrls([
        'https://example.invalid/backtun/torneos/2025/20251018/',
        folder(2025, '20250230'),
        folder(2025, '20241018'),
        `${folder(2025, '20251018')}?x=1`,
        'not an address',
      ]),
    ).toEqual([]);
  });
});

it('writes the discipline the platform uses for swimming', () => {
  expect(LENEX_DISCIPLINE).toBe('SW');
});
