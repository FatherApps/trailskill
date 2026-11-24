import { BirthDateRequiredError, NoFileError, ProviderUnavailableError, SourceUnreachableError, type TournamentAthlete } from '../../../port.ts';
import { FILLER_PDF_BYTES, MAX_PDF_BYTES, createTournamentLookup } from '../lookup.ts';
import { MAX_PAGES, MAX_TEXT_BYTES } from '../pdfLines.ts';
import { lenex } from './lenexBuilder.ts';
import { FREE_50, ageGroup, document, event, fakeOpen, pdfBytes, row } from './pdfFixtures.ts';
import { buildZip } from './zipBuilder.ts';

const HOST = 'www.colombiaacuatica.com';
const FOLDER = `https://${HOST}/backtun/torneos/2026/20261120/`;
const ZIP_URL = `https://${HOST}/backtun/torneos/2026/20261120/resultados20261120Lenex.zip`;
const PDF_URL = `https://${HOST}/backtun/torneos/resultados/pdf/2026/20261120resultados.pdf`;

const who = (overrides: Partial<TournamentAthlete> = {}): TournamentAthlete => ({
  identityNumber: '1234567',
  name: { firstName: 'Ana Maria', lastName: 'Sintetica Prueba' },
  birthDate: '1995-08-11',
  gender: null,
  ...overrides,
});

const HER = row({ place: 1, birth: '950811', ht: 6, ln: 3, points: 257, name: 'SINTETICA PRUEBA Ana Maria', time: '35.87' });
const OTHER = row({ place: 2, birth: '960102', ht: 5, ln: 1, name: 'FICTICIA EJEMPLO Luisa', time: '36.10' });
const goodPdf = () => pdfBytes([document([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), HER, OTHER])]);

// The bytes of a fake PDF are a Uint8Array; `Response` takes it as a body at runtime, and the type of this project's `lib` does not say so.
const ok = (body: Uint8Array | string, init: ResponseInit = {}) => new Response(body as BodyInit, { status: 200, ...init });
const missing = () => new Response('not found', { status: 404 });

// Answers the zip address and the PDF address as told; any other address is a test failure.
function platform(answers: { zip?: () => Response; pdf?: () => Response }) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    if (url === ZIP_URL) return (answers.zip ?? missing)();
    if (url === PDF_URL) return (answers.pdf ?? missing)();
    throw new Error(`unexpected request ${url}`);
  };
  return { fetchImpl, requests };
}

describe('createTournamentLookup with a results PDF', () => {
  it('reads the PDF when the zip does not exist, and finds the athlete by name and birth date', async () => {
    const { fetchImpl, requests } = platform({ pdf: () => ok(goodPdf()) });
    const search = await createTournamentLookup(fetchImpl, fakeOpen)(FOLDER, who());
    expect(search).toEqual({
      found: true,
      athlete: { name: 'SINTETICA PRUEBA Ana Maria', club: 'Club Sintetico' },
      results: [{ sourceResultKey: '20261120|pdf|1|6-3', stroke: 'FR', distance: '50m', pool: null, hundredths: 3587, swumOn: '2026-11-20', competition: 'Copa Sintetica Ejemplo 2026 - Ciudad Ficticia' }],
      matchedBy: 'name_and_birth_date',
      course: null,
    });
    // The zip first, then the PDF built from the tournament's own key; neither follows a redirect.
    expect(requests.map((request) => request.url)).toEqual([ZIP_URL, PDF_URL]);
    expect(requests.every((request) => request.init?.redirect === 'manual')).toBe(true);
  });

  it('builds the PDF address the same way for a tournament of the list (its year and key)', async () => {
    const { fetchImpl, requests } = platform({ pdf: () => ok(goodPdf()) });
    const search = await createTournamentLookup(fetchImpl, fakeOpen)(2026, '20261120', who());
    expect(search.found).toBe(true);
    expect(requests.map((request) => request.url)).toEqual([ZIP_URL, PDF_URL]);
  });

  it('is not found, with nobody else leaking, when the PDF does not have the athlete', async () => {
    const { fetchImpl } = platform({ pdf: () => ok(goodPdf()) });
    const search = await createTournamentLookup(fetchImpl, fakeOpen)(FOLDER, who({ birthDate: '1995-08-12' }));
    expect(search).toEqual({ found: false });
  });

  it('never asks the PDF when the zip is there, and the Lenex result is the one it was', async () => {
    const zip = await buildZip([{ name: 'resultados20261120.lef', data: new TextEncoder().encode(lenex()), method: 8 }]);
    const { fetchImpl, requests } = platform({ zip: () => ok(zip) });
    const search = await createTournamentLookup(fetchImpl, fakeOpen)(FOLDER, who({ birthDate: null }));
    expect(search.found).toBe(true);
    expect(search.found && search.matchedBy).toBeUndefined();
    expect(requests.map((request) => request.url)).toEqual([ZIP_URL]);
  });

  it('is no_file when the PDF does not exist either', async () => {
    const { fetchImpl } = platform({});
    await expect(createTournamentLookup(fetchImpl, fakeOpen)(FOLDER, who())).rejects.toBeInstanceOf(NoFileError);
  });

  it('is no_file for the filler document the platform serves for a tournament without results, by its exact size', async () => {
    const { fetchImpl } = platform({ pdf: () => ok(new Uint8Array(FILLER_PDF_BYTES)) });
    const open = jest.fn(fakeOpen);
    await expect(createTournamentLookup(fetchImpl, open)(FOLDER, who())).rejects.toBeInstanceOf(NoFileError);
    expect(open).not.toHaveBeenCalled();
  });

  it('is no_file for a PDF that says the document was not generated, whatever its size', async () => {
    const filler = pdfBytes([['Lo sentimos!', 'El documento solicitado no ha sido generado.']]);
    expect(filler.length).not.toBe(FILLER_PDF_BYTES);
    const { fetchImpl } = platform({ pdf: () => ok(filler) });
    await expect(createTournamentLookup(fetchImpl, fakeOpen)(FOLDER, who())).rejects.toBeInstanceOf(NoFileError);
  });

  it('is no_file for the filler even when the athlete has no birth date', async () => {
    const { fetchImpl } = platform({ pdf: () => ok(new Uint8Array(FILLER_PDF_BYTES)) });
    await expect(createTournamentLookup(fetchImpl, fakeOpen)(FOLDER, who({ birthDate: null }))).rejects.toBeInstanceOf(NoFileError);
  });

  it('needs the birth date of the athlete once there is a real PDF to search, and reads nothing without it', async () => {
    const { fetchImpl } = platform({ pdf: () => ok(goodPdf()) });
    const open = jest.fn(fakeOpen);
    await expect(createTournamentLookup(fetchImpl, open)(FOLDER, who({ birthDate: null }))).rejects.toBeInstanceOf(BirthDateRequiredError);
    expect(open).not.toHaveBeenCalled();
  });

  it('is unavailable for a PDF of more than 5 MB, by its size or by its bytes', async () => {
    const big = new Uint8Array(MAX_PDF_BYTES + 1);
    await expect(createTournamentLookup(platform({ pdf: () => ok(big) }).fetchImpl, fakeOpen)(FOLDER, who())).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
    const declared = ok('x', { headers: { 'content-length': String(MAX_PDF_BYTES + 1) } });
    await expect(createTournamentLookup(platform({ pdf: () => declared }).fetchImpl, fakeOpen)(FOLDER, who())).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
  });

  it('reads a PDF of exactly 5 MB', async () => {
    const edge = new Uint8Array(MAX_PDF_BYTES);
    const open = jest.fn(async () => ({ pages: 1, page: async () => [] }));
    await expect(createTournamentLookup(platform({ pdf: () => ok(edge) }).fetchImpl, open)(FOLDER, who())).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('is unavailable for a PDF with more than 60 pages', async () => {
    const pages = Array.from({ length: MAX_PAGES + 1 }, () => ['x']);
    await expect(createTournamentLookup(platform({ pdf: () => ok(pdfBytes(pages)) }).fetchImpl, fakeOpen)(FOLDER, who())).rejects.toThrow(new ProviderUnavailableError('The tournament file has too many pages'));
  });

  it('is unavailable for a PDF with more than 2 MB of text', async () => {
    const text = pdfBytes([['a'.repeat(MAX_TEXT_BYTES + 1)]]);
    await expect(createTournamentLookup(platform({ pdf: () => ok(text) }).fetchImpl, fakeOpen)(FOLDER, who())).rejects.toThrow(new ProviderUnavailableError('The tournament file has too much text'));
  });

  it.each([301, 302, 307, 308])('is unavailable when the PDF address redirects (%i), and never follows it', async (status) => {
    const { fetchImpl, requests } = platform({ pdf: () => new Response(null, { status, headers: { location: 'https://example.invalid/x.pdf' } }) });
    await expect(createTournamentLookup(fetchImpl, fakeOpen)(FOLDER, who())).rejects.toThrow(new ProviderUnavailableError('The tournament address redirects'));
    expect(requests).toHaveLength(2);
  });

  it('is unavailable for a file that is not a PDF it can open, with no cause', async () => {
    const open = async () => Promise.reject(new Error('secret 1234567'));
    const error = await createTournamentLookup(platform({ pdf: () => ok(goodPdf()) }).fetchImpl, open)(FOLDER, who()).catch((e) => e);
    expect(error).toEqual(new ProviderUnavailableError('The tournament file is not a PDF this reader knows'));
    expect(error.message).not.toContain('1234567');
  });

  it('is unavailable when a row of the PDF cannot be read, never a partial answer', async () => {
    const broken = pdfBytes([document([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), HER, row({ birth: '991399', name: 'FICTICIA EJEMPLO Luisa', time: '36.10' })])]);
    await expect(createTournamentLookup(platform({ pdf: () => ok(broken) }).fetchImpl, fakeOpen)(FOLDER, who())).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('is unavailable when two people fit the athlete', async () => {
    const twins = pdfBytes([document([event(1, FREE_50, 'Women'), ageGroup('Open 30-34'), HER, row({ place: 2, birth: '950811', ht: 5, ln: 1, name: 'SINTETICA PRUEBA Ana Lucia', time: '36.10' })])]);
    await expect(createTournamentLookup(platform({ pdf: () => ok(twins) }).fetchImpl, fakeOpen)(FOLDER, who())).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('is the platform not answering, which the service gives the claim back for, when the PDF server fails', async () => {
    await expect(createTournamentLookup(platform({ pdf: () => new Response(null, { status: 503 }) }).fetchImpl, fakeOpen)(FOLDER, who())).rejects.toBeInstanceOf(SourceUnreachableError);
  });

  it('is unavailable, not a leak, for any other answer of the PDF server', async () => {
    const error = await createTournamentLookup(platform({ pdf: () => new Response(null, { status: 403 }) }).fetchImpl, fakeOpen)(FOLDER, who()).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).not.toBeInstanceOf(NoFileError);
  });

  it('does not put the identity number, the birth date or another swimmer in anything it answers', async () => {
    const { fetchImpl } = platform({ pdf: () => ok(goodPdf()) });
    const json = JSON.stringify(await createTournamentLookup(fetchImpl, fakeOpen)(FOLDER, who()));
    for (const secret of ['1234567', '950811', '1995-08-11', '960102', 'FICTICIA', 'Luisa']) expect(json).not.toContain(secret);
  });
});
