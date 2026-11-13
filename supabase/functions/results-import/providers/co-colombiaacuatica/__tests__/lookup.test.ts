import * as fs from 'fs';
import { ProviderUnavailableError, SourceUnreachableError } from '../../../port.ts';
import { MAX_ZIP_BYTES } from '../zip.ts';
import { PROVIDER_KEY, TOTAL_TIMEOUT_MS, createTournamentLookup, tournamentFromUrl } from '../lookup.ts';
import { ME, lenex } from './lenexBuilder.ts';
import { buildZip } from './zipBuilder.ts';

const HOST = 'www.colombiaacuatica.com';
const FOLDER = `https://${HOST}/backtun/torneos/2025/20251018/`;
const ZIP_URL = `https://${HOST}/backtun/torneos/2025/20251018/resultados20251018Lenex.zip`;
const NUMBER = '1234567';
const bytes = (s: string) => new TextEncoder().encode(s);

const zipOf = (xml: string) => buildZip([{ name: 'resultados20251018.lef', data: bytes(xml), method: 8 }]);
const ok = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe('tournamentFromUrl', () => {
  it('uses this provider key', () => {
    expect(PROVIDER_KEY).toBe('co-colombiaacuatica');
  });

  it.each([FOLDER, `${FOLDER}index.php`])('accepts %s and builds the zip address itself', (url) => {
    expect(tournamentFromUrl(url)).toEqual({ tournament: '20251018', zipUrl: ZIP_URL });
  });

  it('ignores the spaces around a pasted address', () => {
    expect(tournamentFromUrl(`  ${FOLDER}\n`).tournament).toBe('20251018');
  });

  it.each([
    ['another host', 'https://example.invalid/backtun/torneos/2025/20251018/'],
    ['a longer host', `https://${HOST}.example.invalid/backtun/torneos/2025/20251018/`],
    ['a host before an @', `https://${HOST}@example.invalid/backtun/torneos/2025/20251018/`],
    ['another subdomain', 'https://colombiaacuatica.com/backtun/torneos/2025/20251018/'],
    ['http', `http://${HOST}/backtun/torneos/2025/20251018/`],
    ['an IPv4 address', 'https://203.0.113.7/backtun/torneos/2025/20251018/'],
    ['an IPv6 address', 'https://[2001:db8::1]/backtun/torneos/2025/20251018/'],
    ['the default port', `https://${HOST}:443/backtun/torneos/2025/20251018/`],
    ['another port', `https://${HOST}:8443/backtun/torneos/2025/20251018/`],
    ['credentials', `https://user:secret@${HOST}/backtun/torneos/2025/20251018/`],
    ['a user without a password', `https://user@${HOST}/backtun/torneos/2025/20251018/`],
    ['no path', `https://${HOST}/`],
    ['another folder', `https://${HOST}/otro/torneos/2025/20251018/`],
    ['no trailing slash', `https://${HOST}/backtun/torneos/2025/20251018`],
    ['another page', `https://${HOST}/backtun/torneos/2025/20251018/otra.php`],
    ['a deeper path', `https://${HOST}/backtun/torneos/2025/20251018/sub/index.php`],
    ['the zip itself', ZIP_URL],
    ['a query', `${FOLDER}?x=1`],
    ['a query after index.php', `${FOLDER}index.php?x=1`],
    ['a fragment', `${FOLDER}#x`],
    ['a year that is not the date\'s', `https://${HOST}/backtun/torneos/2024/20251018/`],
    ['a short date', `https://${HOST}/backtun/torneos/2025/2025101/`],
    ['an impossible date', `https://${HOST}/backtun/torneos/2025/20251340/`],
    ['a date that does not exist', `https://${HOST}/backtun/torneos/2025/20250230/`],
    ['dots in the path', `https://${HOST}/backtun/torneos/2025/../2025/20251018/`],
    ['an encoded path', `https://${HOST}/backtun/torneos/2025/2025101%38/`],
    ['a backslash', `https://${HOST}\\backtun/torneos/2025/20251018/`],
    ['an upper case scheme', `HTTPS://${HOST}/backtun/torneos/2025/20251018/`],
    ['empty text', ''],
    ['text that is no address', 'torneo de ayer'],
  ])('rejects %s', (_label, url) => {
    expect(() => tournamentFromUrl(url)).toThrow(new ProviderUnavailableError('The tournament address is not one this provider accepts'));
  });
});

describe('createTournamentLookup', () => {
  afterEach(() => jest.useRealTimers());

  it('rejects a wrong address before any request', async () => {
    const fetchImpl = jest.fn();
    await expect(createTournamentLookup(fetchImpl)('http://example.invalid/', NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks once for the zip the server builds, without following redirects, and reads it in memory', async () => {
    const writes = [jest.spyOn(fs, 'writeFileSync'), jest.spyOn(fs, 'writeFile'), jest.spyOn(fs, 'createWriteStream'), jest.spyOn(fs, 'appendFileSync')];
    const zip = await zipOf(lenex());
    const fetchImpl = jest.fn(async () => ok(zip));
    const search = await createTournamentLookup(fetchImpl)(`${FOLDER}index.php`, NUMBER);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(ZIP_URL, expect.objectContaining({ redirect: 'manual' }));
    expect(search.found && search.results.map((r) => r.sourceResultKey)).toEqual(['20251018|1|101', '20251018|2|102', '20251018|3|103']);
    for (const spy of writes) expect(spy).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('says "no matches" when the tournament has no one with that license', async () => {
    const zip = await zipOf(lenex({ athletes: [{ ...ME, license: '999' }] }));
    expect(await createTournamentLookup(async () => ok(zip))(FOLDER, NUMBER)).toEqual({ found: false });
  });

  it('keeps the birth date and the others out of the output (checked on the JSON)', async () => {
    const zip = await zipOf(lenex());
    const json = JSON.stringify(await createTournamentLookup(async () => ok(zip))(FOLDER, NUMBER));
    for (const secret of ['2012-03-04', '2011-09-09', 'Bruno', 'Otro Club', '7654321', NUMBER]) expect(json).not.toContain(secret);
  });

  it('is unavailable, with its message, when the zip does not exist (404)', async () => {
    const fetchImpl = jest.fn(async () => ok('not found', { status: 404 }));
    await expect(createTournamentLookup(fetchImpl)(FOLDER, NUMBER)).rejects.toThrow(new ProviderUnavailableError('The tournament has no published results file'));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([301, 302, 307, 308])('is unavailable on a redirect (%i), and never follows it', async (status) => {
    const fetchImpl = jest.fn(async () => new Response(null, { status, headers: { location: 'https://example.invalid/' } }));
    await expect(createTournamentLookup(fetchImpl)(FOLDER, NUMBER)).rejects.toThrow(new ProviderUnavailableError('The tournament address redirects'));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('is unavailable on the opaque redirect a browser-like fetch gives', async () => {
    const opaque = { ok: false, status: 0, type: 'opaqueredirect', headers: new Headers(), body: null } as unknown as Response;
    await expect(createTournamentLookup(async () => opaque)(FOLDER, NUMBER)).rejects.toThrow(new ProviderUnavailableError('The tournament address redirects'));
  });

  // Issue #888: only a platform that did not answer (network, timeout, 5xx) is `SourceUnreachableError`; the rest is plain unavailable.
  it.each([500, 503, 599])('is unreachable when the platform answers %i', async (status) => {
    const error = await createTournamentLookup(async () => ok('x', { status }))(FOLDER, NUMBER).catch((e) => e);
    expect(error).toBeInstanceOf(SourceUnreachableError);
  });

  it.each([400, 403, 410])('is unavailable, but not unreachable, when the platform answers %i', async (status) => {
    const error = await createTournamentLookup(async () => ok('x', { status }))(FOLDER, NUMBER).catch((e) => e);
    expect(error).toEqual(new ProviderUnavailableError('The platform did not answer'));
    expect(error).not.toBeInstanceOf(SourceUnreachableError);
  });

  it('is unreachable when the request fails, without the cause', async () => {
    const error = await createTournamentLookup(async () => Promise.reject(new Error(`secret ${NUMBER}`)))(FOLDER, NUMBER).catch((e) => e);
    expect(error).toBeInstanceOf(SourceUnreachableError);
    expect(error.message).not.toContain(NUMBER);
    expect(error.cause).toBeUndefined();
  });

  it.each([404, 301])('is not unreachable when the platform answered %i', async (status) => {
    const error = await createTournamentLookup(async () => new Response(null, { status }))(FOLDER, NUMBER).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).not.toBeInstanceOf(SourceUnreachableError);
  });

  it('is unavailable, not unreachable, on a corrupt zip and on a LENEX of another shape: the platform answered', async () => {
    const corrupt = await createTournamentLookup(async () => ok('<html>not a zip</html>'))(FOLDER, NUMBER).catch((e) => e);
    expect(corrupt).toBeInstanceOf(ProviderUnavailableError);
    expect(corrupt).not.toBeInstanceOf(SourceUnreachableError);
    const zip = await zipOf('<html>not lenex</html>');
    const other = await createTournamentLookup(async () => ok(zip))(FOLDER, NUMBER).catch((e) => e);
    expect(other).toBeInstanceOf(ProviderUnavailableError);
    expect(other).not.toBeInstanceOf(SourceUnreachableError);
  });

  it('is unavailable on a LENEX that is not UTF-8', async () => {
    const zip = await buildZip([{ name: 'a.lef', data: Uint8Array.from([0x3c, 0xff, 0xfe, 0x3e]) }]);
    await expect(createTournamentLookup(async () => ok(zip))(FOLDER, NUMBER)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('refuses a zip that announces more than 10 MB, without reading it', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream({ pull: (c) => c.enqueue(new Uint8Array(1024)), cancel });
    const response = ok(body, { headers: { 'content-length': String(MAX_ZIP_BYTES + 1) } });
    await expect(createTournamentLookup(async () => response)(FOLDER, NUMBER)).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
    expect(cancel).toHaveBeenCalled();
  });

  it('cuts the download at 10 MB when the platform does not announce its size', async () => {
    const cancel = jest.fn();
    let sent = 0;
    const body = new ReadableStream({
      pull(controller) {
        sent += 1024 * 1024;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel,
    });
    await expect(createTournamentLookup(async () => ok(body))(FOLDER, NUMBER)).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
    expect(cancel).toHaveBeenCalled();
    expect(sent).toBeLessThanOrEqual(MAX_ZIP_BYTES + 4 * 1024 * 1024);
  });

  it('allows 30 seconds in all, and aborts a download that stalls', async () => {
    expect(TOTAL_TIMEOUT_MS).toBe(30_000);
    jest.useFakeTimers();
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
        },
      });
      return ok(body);
    });
    const pending = createTournamentLookup(fetchImpl)(FOLDER, NUMBER).catch((e) => e);
    await jest.advanceTimersByTimeAsync(TOTAL_TIMEOUT_MS + 1);
    expect(await pending).toBeInstanceOf(SourceUnreachableError);
  });
});
