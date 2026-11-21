import { tournamentFromKey, tournamentPdfUrl } from '../../../supabase/functions/results-import/providers/co-colombiaacuatica/lookup.ts';
import { buildZip } from '../../../supabase/functions/results-import/providers/co-colombiaacuatica/__tests__/zipBuilder.ts';
import { MIN_GAP_MS, USER_AGENT, buildSeed, type Named } from '../seedBuilder.ts';
import type { TournamentEntry } from '../../../supabase/functions/results-import/port.ts';

const bytes = (s: string) => new TextEncoder().encode(s);
// A synthetic file: made-up names only. The athlete is here to prove it never comes out.
const lef = (name: string, city: string) =>
  `<LENEX version="3.0"><MEETS><MEET name="${name}" city="${city}"><CLUBS><CLUB name="Club Sintético"><ATHLETES><ATHLETE first="Ana" last="Prueba" license="1.234.567"/></ATHLETES></CLUB></CLUBS></MEET></MEETS></LENEX>`;
const zipOf = (text: string) => buildZip([{ name: 'r.lef', data: bytes(text), method: 8 }]);

const url = (dateKey: string) => tournamentFromKey(Number(dateKey.slice(0, 4)), dateKey).zipUrl;
const pdf = (dateKey: string) => tournamentPdfUrl(Number(dateKey.slice(0, 4)), dateKey);
const named = (dateKey: string, name: string, city: string, discipline = 'SW'): Named => ({ url: pdf(dateKey), name, city, discipline });
const entry = (dateKey: string, name: string, city: string): TournamentEntry => ({ dateKey, year: Number(dateKey.slice(0, 4)), name, city, discipline: 'SW', course: null, sourceUrl: pdf(dateKey) });

// A clock that only moves when the builder waits or a request takes its time: nothing here sleeps for real.
function harness(files: Record<string, string | number>) {
  let clock = 1_000_000;
  const requests: { dateKey: string; at: number; userAgent: string | null; running: number }[] = [];
  const logs: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const fetchImpl = async (address: string, init?: RequestInit) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    const dateKey = /(\d{8})Lenex\.zip$/.exec(address)![1];
    requests.push({ dateKey, at: clock, userAgent: new Headers(init?.headers).get('user-agent'), running });
    clock += 300; // a request takes time
    running -= 1;
    const file = files[address];
    if (typeof file === 'number') return new Response('', { status: file });
    return new Response(file === undefined ? '' : await zipOf(file), { status: file === undefined ? 404 : 200 });
  };
  return {
    requests,
    logs,
    maxRunning: () => maxRunning,
    deps: { fetchImpl, now: () => clock, sleep: async (ms: number) => void (clock += ms), log: (line: string) => void logs.push(line) },
  };
}

describe('buildSeed', () => {
  const files = { [url('20250315')]: lef('Copa Sintética Uno', 'BOGOTÁ D.C.'), [url('20240316')]: lef('Copa Sintética Dos', 'cali') };

  it('reads each tournament of the keys it has: sorted, with only the header and the shape of the adapter', async () => {
    const h = harness(files);
    const result = await buildSeed({ urls: [pdf('20250315'), pdf('20240316')] }, [], h.deps);
    expect(result.rows).toEqual([
      { dateKey: '20240316', year: 2024, name: 'Copa Sintética Dos', city: 'Cali', discipline: 'SW', course: null, sourceUrl: pdf('20240316') },
      { dateKey: '20250315', year: 2025, name: 'Copa Sintética Uno', city: 'Bogota D.C.', discipline: 'SW', course: null, sourceUrl: pdf('20250315') },
    ]);
    expect(result.added).toEqual(result.rows);
    expect(JSON.stringify(result)).not.toMatch(/Ana|Prueba|1\.234\.567|Club Sint/);
  });

  it('asks one at a time, at least 2 s apart, with the fixed User-Agent', async () => {
    const h = harness(files);
    await buildSeed({ urls: [pdf('20250315'), pdf('20240316'), pdf('20240317')] }, [], h.deps);
    expect(h.requests).toHaveLength(3);
    expect(h.maxRunning()).toBe(1);
    expect(MIN_GAP_MS).toBeGreaterThanOrEqual(2000);
    h.requests.slice(1).forEach((request, i) => expect(request.at - (h.requests[i].at + 300)).toBeGreaterThanOrEqual(2000));
    expect(h.requests.every((request) => request.userAgent === USER_AGENT)).toBe(true);
    expect(USER_AGENT).not.toMatch(/@|\/Users\/|http/);
  });

  it('logs only the key and the HTTP status of each request', async () => {
    const h = harness({ ...files, [url('20240317')]: 503 });
    await buildSeed({ urls: [pdf('20250315'), pdf('20240316'), pdf('20240317'), pdf('20240318')] }, [], h.deps);
    expect(h.logs).toEqual(['20250315 200', '20240316 200', '20240317 503', '20240318 404']);
    h.logs.forEach((line) => expect(line).toMatch(/^\d{8} (\d{3}|error)$/));
  });

  it('leaves out a key it cannot resolve and says so, never guessing a row', async () => {
    const h = harness({ ...files, [url('20240317')]: 503 });
    const result = await buildSeed({ urls: [pdf('20250315'), pdf('20240317'), pdf('20240318')] }, [], h.deps);
    expect(result.rows.map((row) => row.dateKey)).toEqual(['20250315']);
    expect(result.unresolved).toEqual([
      { dateKey: '20240317', reason: 'no_header' },
      { dateKey: '20240318', reason: 'no_header' },
    ]);
    expect(result.coverage).toEqual({ 2024: { resolved: 0, unresolved: 2 }, 2025: { resolved: 1, unresolved: 0 } });
  });

  it('prefers the name and city of a source without athletes and downloads nothing for them', async () => {
    const h = harness({});
    const result = await buildSeed({ urls: [], named: [named('20250315', ' Copa  Nombrada ', 'MEDELLÍN')] }, [], h.deps);
    expect(result.rows).toEqual([entry('20250315', 'Copa Nombrada', 'Medellin')]);
    expect(h.requests).toEqual([]);
  });

  it('downloads when a named source is incomplete', async () => {
    const h = harness(files);
    const result = await buildSeed({ urls: [], named: [{ ...named('20250315', 'Copa', 'Cali'), discipline: '' }] }, [], h.deps);
    expect(h.requests.map((request) => request.dateKey)).toEqual(['20250315']);
    expect(result.rows[0].name).toBe('Copa Sintética Uno');
  });

  it('is unresolved when two sources disagree on the same day, and agrees silently when they say the same', async () => {
    const h = harness({});
    const result = await buildSeed(
      { urls: [], named: [named('20250315', 'Copa A', 'Cali'), named('20250315', 'Copa B', 'Cali'), named('20250316', 'Copa C', 'Cali'), named('20250316', 'copa c', 'cali')] },
      [],
      h.deps,
    );
    expect(result.rows.map((row) => row.dateKey)).toEqual(['20250316']);
    expect(result.unresolved).toEqual([{ dateKey: '20250315', reason: 'conflict' }]);
    expect(h.requests).toEqual([]);
  });

  it('ignores years outside 2024 and 2025 and addresses that are not tournaments', async () => {
    const h = harness(files);
    const result = await buildSeed({ urls: [pdf('20230315'), pdf('20260315'), 'https://example.invalid/x', pdf('20250315')] }, [], h.deps);
    expect(result.rows.map((row) => row.dateKey)).toEqual(['20250315']);
    expect(h.requests).toHaveLength(1);
  });

  it('keeps the rows it already has without asking again, and reports only what is new or changed', async () => {
    const h = harness(files);
    const had = [entry('20240316', 'Copa Revisada', 'Cali'), entry('20240101', 'Copa Vieja', 'Pasto')];
    const result = await buildSeed({ urls: [pdf('20250315'), pdf('20240316')], named: [named('20240101', 'Copa Vieja Corregida', 'Pasto')] }, had, h.deps);
    expect(h.requests.map((request) => request.dateKey)).toEqual(['20250315']);
    expect(result.rows.map((row) => [row.dateKey, row.name])).toEqual([
      ['20240101', 'Copa Vieja Corregida'],
      ['20240316', 'Copa Revisada'],
      ['20250315', 'Copa Sintética Uno'],
    ]);
    expect(result.added.map((row) => row.dateKey)).toEqual(['20250315']);
    expect(result.changed.map((row) => row.dateKey)).toEqual(['20240101']);
  });
});
