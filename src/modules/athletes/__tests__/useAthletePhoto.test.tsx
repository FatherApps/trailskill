import { act, renderHook, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createInMemoryAthletePhotoRepository, createInMemoryPhotoCache, useAthletePhoto } from '..';

// Synthetic data only. The hook reads one local answer (the photo row), faked; show_photo comes in as an argument. Sign-out is the guard's job.
const mockQuery = jest.fn();

jest.mock('../../../core/sync', () => ({ useQuery: (...args: unknown[]) => mockQuery(...args), supabase: {} }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '' } }));

const A1 = 'a1';
const PATH_A = 'a1/11111111-1111-4111-8111-111111111111.jpg';
const PATH_B = 'a1/22222222-2222-4222-8222-222222222222.jpg';
const URL_A = 'https://signed.example.test/token-a';
const URL_B = 'https://signed.example.test/token-b';

type State = { authorized: boolean; rows: { storage_path: string }[]; waiting: { local_uri: string }[] };
let state: State;

beforeEach(() => {
  state = { authorized: true, rows: [{ storage_path: PATH_A }], waiting: [] };
  // The queue of photos waiting to go up is a second local read, answered apart from the photo row.
  mockQuery.mockImplementation((sql: string) => ({ data: sql.includes('athlete_photo_uploads') ? state.waiting : state.rows, isLoading: false, isFetching: false }));
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

  it('shows the photo still waiting to go up from its local file, without asking for a URL', async () => {
    state.waiting = [{ local_uri: 'file:///documents/athlete-photo-uploads/a1/new.jpg' }];
    const { photos, cache } = setup();
    const { result } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));

    expect(result.current).toEqual({ status: 'ready', uri: 'file:///documents/athlete-photo-uploads/a1/new.jpg' });
  });

  it('shows the waiting photo even when the athlete has no stored one yet', async () => {
    state.rows = [];
    state.waiting = [{ local_uri: 'file:///documents/athlete-photo-uploads/a1/new.jpg' }];
    const { photos, cache } = setup();
    const { result } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));

    expect(result.current.uri).toBe('file:///documents/athlete-photo-uploads/a1/new.jpg');
  });

  it('never shows the waiting photo without show_photo in force', async () => {
    state.authorized = false;
    state.waiting = [{ local_uri: 'file:///documents/athlete-photo-uploads/a1/new.jpg' }];
    const { photos, cache } = setup();
    const { result } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));

    expect(result.current).toEqual({ status: 'none', uri: null });
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

  it('does not show the failure of one photo as the state of the next one', async () => {
    const logs = [jest.spyOn(console, 'warn')];
    logs.forEach((spy) => spy.mockImplementation(() => {}));
    const cache = createInMemoryPhotoCache();
    const photos = createInMemoryAthletePhotoRepository({ [PATH_B]: URL_B });
    const { result, rerender } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    state.rows = [{ storage_path: PATH_B }];
    await rerender({});

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('removes the image that arrives after show_photo was withdrawn while it was downloading', async () => {
    let finish: () => void = () => {};
    const cache = createInMemoryPhotoCache(() => new Promise<void>((resolve) => (finish = resolve)));
    const photos = createInMemoryAthletePhotoRepository({ [PATH_A]: URL_A });
    const { rerender } = await renderHook(() => useAthletePhoto(A1, state.authorized, { photos, cache }));

    state.authorized = false;
    await rerender({});
    await act(async () => finish());

    await waitFor(() => expect(cache.files()).toEqual([]));
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
  it.each(['athletePhotos.ts', 'useAthletePhoto.ts', 'useAthletePhotoCacheGuard.ts'])('%s has no console call that could carry a path, a URL or a URI', (file) => {
    const source = readFileSync(join(__dirname, '../data', file), 'utf8');
    const calls = source.match(/console\.\w+\([^)]*\)/g) ?? [];
    for (const call of calls) expect(call).not.toMatch(/\b(path|url|uri|storagePath|signedUrl)\b/i);
  });
});
