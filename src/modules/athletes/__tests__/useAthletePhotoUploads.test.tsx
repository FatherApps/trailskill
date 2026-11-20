import { renderHook } from '@testing-library/react-native';

import { useAthletePhotoUploads, type AthletePhotoService } from '..';

// Synthetic data only. The session and the sync summary are faked; the service is a spy, so the test reads when the root layout asks it to work.
const mockSession = jest.fn();
const mockSummary = jest.fn();

jest.mock('../../../core/session', () => ({ useSession: () => mockSession() }));
jest.mock('../../../core/sync', () => ({
  supabase: {},
  db: {},
  useQuery: jest.fn(),
  writeRecord: jest.fn(),
  deleteRecord: jest.fn(),
  useGlobalSyncSummary: () => mockSummary(),
}));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '', document: '' } }));

const service = () =>
  ({
    drain: jest.fn(async () => {}),
    discardAll: jest.fn(async () => {}),
  }) as unknown as AthletePhotoService & { drain: jest.Mock; discardAll: jest.Mock };

const signedIn = { session: { user: { id: 'u1' } } };
const connected = { connection: 'connected', lastSyncedAt: new Date('2026-11-20T10:00:00Z') };

beforeEach(() => {
  mockSession.mockReturnValue(signedIn);
  mockSummary.mockReturnValue(connected);
});

describe('useAthletePhotoUploads', () => {
  it('sends the queue once connected and signed in', async () => {
    const photos = service();

    await renderHook(() => useAthletePhotoUploads(photos));

    expect(photos.drain).toHaveBeenCalledWith('u1');
  });

  it('waits while offline', async () => {
    mockSummary.mockReturnValue({ connection: 'offline', lastSyncedAt: null });
    const photos = service();

    await renderHook(() => useAthletePhotoUploads(photos));

    expect(photos.drain).not.toHaveBeenCalled();
  });

  it('tries again when a sync finishes', async () => {
    const photos = service();
    const { rerender } = await renderHook(() => useAthletePhotoUploads(photos));

    mockSummary.mockReturnValue({ ...connected, lastSyncedAt: new Date('2026-11-20T10:05:00Z') });
    await rerender({});

    expect(photos.drain).toHaveBeenCalledTimes(2);
  });

  it('a failing send is swallowed: the photo stays queued', async () => {
    const photos = service();
    photos.drain.mockRejectedValue(new Error('boom'));

    await expect(renderHook(() => useAthletePhotoUploads(photos))).resolves.toBeDefined();
  });

  it('sign-out deletes every queued photo and kept image', async () => {
    const photos = service();
    const { rerender } = await renderHook(() => useAthletePhotoUploads(photos));

    mockSession.mockReturnValue({ session: null });
    await rerender({});

    expect(photos.discardAll).toHaveBeenCalledTimes(1);
  });

  it('a cold start without a session clears nothing and sends nothing', async () => {
    mockSession.mockReturnValue({ session: null });
    const photos = service();

    await renderHook(() => useAthletePhotoUploads(photos));

    expect(photos.discardAll).not.toHaveBeenCalled();
    expect(photos.drain).not.toHaveBeenCalled();
  });

  it('keeps the queue while a sign-out may still fail, and discards it once the session really ends', async () => {
    const photos = service();
    const { rerender } = await renderHook(() => useAthletePhotoUploads(photos));

    // The session is hidden while the local database may still be emptying: it can come back.
    mockSession.mockReturnValue({ session: null, signingOut: true });
    await rerender({});
    expect(photos.discardAll).not.toHaveBeenCalled();

    mockSession.mockReturnValue({ session: null, signingOut: false });
    await rerender({});
    expect(photos.discardAll).toHaveBeenCalledTimes(1);
  });
});
