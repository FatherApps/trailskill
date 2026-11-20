import { act, renderHook, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createInMemoryAthletePhotoRepository, createInMemoryPhotoCache, useAthletePhoto } from '..';

// Synthetic data only. The hook reads two local answers (the photo row, the session), both faked; show_photo comes in as an argument.
const mockQuery = jest.fn();
const mockSession = jest.fn();

jest.mock('../../../core/sync', () => ({ useQuery: (...args: unknown[]) => mockQuery(...args), supabase: {} }));
jest.mock('../../../core/session', () => ({ useSession: () => mockSession() }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '' } }));

const A1 = 'a1';
const PATH_A = 'a1/11111111-1111-4111-8111-111111111111.jpg';
const PATH_B = 'a1/22222222-2222-4222-8222-222222222222.jpg';
const URL_A = 'https://signed.example.test/token-a';
const URL_B = 'https://signed.example.test/token-b';
const USER = { user: { id: 'guardian-1' } };

type State = { authorized: boolean; rows: { storage_path: string }[]; session: typeof USER | null };
let state: State;

beforeEach(() => {
  state = { authorized: true, rows: [{ storage_path: PATH_A }], session: USER };
  mockQuery.mockImplementation(() => ({ data: state.rows, isLoading: false, isFetching: false }));
  mockSession.mockImplementation(() => ({ session: state.session }));
});

afterEach(() => jest.restoreAllMocks());

const setup = () => {
  const photos = createInMemoryAthletePhotoRepository({ [PATH_A]: URL_A, [PATH_B]: URL_B });
  const cache = createInMemoryPhotoCache();
  return { photos, cache };
};

describe('useAthletePhoto', () => {
  it('fetches a signed URL, copies the image into the cache and returns the local file', async () => {
    const { photos, cache } = setup();
    const { result } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.uri).toBe('file:///cache/athlete-photos/a1/11111111-1111-4111-8111-111111111111.jpg');
    expect(photos.requested).toEqual([PATH_A]);
  });

  it('is loading while the signed URL is on its way', async () => {
    const { result } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos: { createSignedUrl: () => new Promise<string>(() => {}) }, cache: createInMemoryPhotoCache() }));

    expect(result.current).toEqual({ status: 'loading', uri: null });
  });

  it('returns the cached file without asking for another URL', async () => {
    const { photos, cache } = setup();
    await cache.put({ athleteId: A1, storagePath: PATH_A }, URL_A);
    const { result } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(photos.requested).toEqual([]);
  });

  it('replaces the cached file when the row points to a new photo', async () => {
    const { photos, cache } = setup();
    const { result, rerender } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    state.rows = [{ storage_path: PATH_B }];
    await rerender({});

    await waitFor(() => expect(result.current.uri).toContain('22222222'));
    expect(cache.files()).toEqual([PATH_B]);
  });

  it('shows nothing and asks for no URL while show_photo is not in force, and clears that athlete', async () => {
    const { photos, cache } = setup();
    await cache.put({ athleteId: A1, storagePath: PATH_A }, URL_A);
    await cache.put({ athleteId: 'a2', storagePath: 'a2/33333333-3333-4333-8333-333333333333.jpg' }, URL_A);
    state.authorized = false;
    const { result } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));

    expect(result.current).toEqual({ status: 'none', uri: null });
    expect(photos.requested).toEqual([]);
    expect(cache.files()).toEqual(['a2/33333333-3333-4333-8333-333333333333.jpg']);
  });

  it('empties the cache of the athlete when show_photo stops being in force', async () => {
    const { photos, cache } = setup();
    const { result, rerender } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(cache.files()).toEqual([PATH_A]);

    state.authorized = false;
    await rerender({});

    await waitFor(() => expect(cache.files()).toEqual([]));
    expect(result.current).toEqual({ status: 'none', uri: null });
  });

  it('empties the whole cache when the person signs out', async () => {
    const { photos, cache } = setup();
    await cache.put({ athleteId: 'a2', storagePath: 'a2/33333333-3333-4333-8333-333333333333.jpg' }, URL_A);
    const { result, rerender } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(cache.files()).toHaveLength(2);

    state.session = null;
    state.rows = [];
    await rerender({});

    await waitFor(() => expect(cache.files()).toEqual([]));
  });

  it('does not empty the cache on a cold start that begins without a session', async () => {
    const { photos, cache } = setup();
    await cache.put({ athleteId: A1, storagePath: PATH_A }, URL_A);
    state.session = null;
    const { rerender } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));

    state.session = USER;
    await rerender({});

    expect(cache.files()).toEqual([PATH_A]);
  });

  it('removes the image when the row leaves the device (a withdrawal synced)', async () => {
    const { photos, cache } = setup();
    const { result, rerender } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    state.rows = [];
    await rerender({});

    await waitFor(() => expect(cache.files()).toEqual([]));
    expect(result.current).toEqual({ status: 'none', uri: null });
  });

  it('keeps the cache while the local row is still loading', async () => {
    const { photos, cache } = setup();
    await cache.put({ athleteId: A1, storagePath: PATH_A }, URL_A);
    mockQuery.mockImplementation(() => ({ data: [], isLoading: true, isFetching: true }));
    await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));

    expect(cache.files()).toEqual([PATH_A]);
  });

  it('is unavailable, with no path, URL or URI in any log, when the signed URL cannot be had', async () => {
    const logs = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error'), jest.spyOn(console, 'info')];
    logs.forEach((spy) => spy.mockImplementation(() => {}));
    const cache = createInMemoryPhotoCache();
    const refusing = createInMemoryAthletePhotoRepository({});
    const { result } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos: refusing, cache }));

    await waitFor(() => expect(result.current).toEqual({ status: 'unavailable', uri: null }));
    const everything = JSON.stringify(logs.flatMap((spy) => spy.mock.calls));
    for (const secret of [PATH_A, URL_A, 'file://', 'athlete-photos', '11111111']) expect(everything).not.toContain(secret);
  });

  it('logs nothing at all on the happy path', async () => {
    const logs = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error'), jest.spyOn(console, 'info')];
    logs.forEach((spy) => spy.mockImplementation(() => {}));
    const { photos, cache } = setup();
    const { result } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {});

    expect(logs.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });
});

describe('the code of the photo feature', () => {
  it.each(['athletePhotos.ts', 'useAthletePhoto.ts'])('%s has no console call that could carry a path, a URL or a URI', (file) => {
    const source = readFileSync(join(__dirname, '../data', file), 'utf8');
    const calls = source.match(/console\.\w+\([^)]*\)/g) ?? [];
    for (const call of calls) expect(call).not.toMatch(/\b(path|url|uri|storagePath|signedUrl)\b/i);
  });
});
