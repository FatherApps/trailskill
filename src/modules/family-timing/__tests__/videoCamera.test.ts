// The native adapter of the video camera port, with the gallery and file system mocked (#1169).
const mockAlbum = { get: jest.fn(), create: jest.fn() };

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: jest.fn().mockImplementation((...parts: string[]) => ({
    uri: parts.join('/'),
    exists: false,
    move: jest.fn(async () => {}),
    delete: jest.fn(),
  })),
}));
jest.mock('expo-media-library', () => ({
  Album: mockAlbum,
  Asset: { create: jest.fn(async (uri: string) => ({ uri })) },
  requestPermissionsAsync: jest.fn(),
}));

// jest-expo already mocks expo-modules-core and finds no VideoRecorder, so the adapter would be null: the module is faked before loading it.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the spy must be in place before the adapter loads
jest.spyOn(require('expo-modules-core'), 'requireOptionalNativeModule').mockReturnValue({});
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the spy
const adapter: typeof import('../data/videoCamera') = require('../data/videoCamera');
const { VIDEO_ALBUM, videoCamera } = adapter;

beforeEach(() => {
  mockAlbum.get.mockReset();
  mockAlbum.create.mockReset();
});

describe('video camera gallery album', () => {
  it('names the album after the app, Swimcro', () => {
    expect(VIDEO_ALBUM).toBe('Swimcro');
  });

  it('creates the Swimcro album with the first kept video', async () => {
    mockAlbum.get.mockResolvedValue(null);
    await videoCamera!.keep('file:///cache/recording-1.mp4', 'Swimcro_time-1');
    expect(mockAlbum.get).toHaveBeenCalledWith('Swimcro');
    expect(mockAlbum.create).toHaveBeenCalledWith('Swimcro', [{ uri: 'file:///cache/Swimcro_time-1.mp4' }], true);
  });

  it('adds later videos to the existing Swimcro album', async () => {
    const album = { add: jest.fn(async () => {}) };
    mockAlbum.get.mockResolvedValue(album);
    await videoCamera!.keep('file:///cache/recording-2.mp4', 'Swimcro_time-2');
    expect(mockAlbum.get).toHaveBeenCalledWith('Swimcro');
    expect(album.add).toHaveBeenCalledWith({ uri: 'file:///cache/Swimcro_time-2.mp4' });
    expect(mockAlbum.create).not.toHaveBeenCalled();
  });
});
