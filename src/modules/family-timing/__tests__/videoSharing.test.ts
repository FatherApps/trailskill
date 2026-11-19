// The native adapter of the video sharing port (#1201), with the local module, the gallery and the file system mocked.
const mockNative = {
  shareVideo: jest.fn(async () => {}),
  pickVideo: jest.fn(async () => null as { uri: string; name: string | null } | null),
  copyToCache: jest.fn(async () => 'file:///cache/incoming-1.mp4'),
  deleteDocument: jest.fn(async () => true),
};
const mockKeep = jest.fn(async () => 'content://media/video/12');

jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(async () => ({ granted: true })) }));
jest.mock('../data/videoCamera', () => ({ keepInGallery: (...args: unknown[]) => mockKeep(...(args as [])) }));
// jest-expo finds no VideoRecorder module, so the adapter would be null: the module is faked before loading it.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the spy must be in place before the adapter loads
jest.spyOn(require('expo-modules-core'), 'requireOptionalNativeModule').mockReturnValue(mockNative);
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the spy
const { videoSharing } = require('../data/videoSharing') as typeof import('../data/videoSharing');

const picked = { uri: 'content://downloads/41', name: 'Swimcro_x.mp4' };

beforeEach(() => jest.clearAllMocks());

describe('video sharing adapter', () => {
  it('shares the gallery video itself, and says when the menu does not open', async () => {
    expect(await videoSharing!.share('content://media/video/7', 'Compartir')).toBe(true);
    expect(mockNative.shareVideo).toHaveBeenCalledWith('content://media/video/7', 'Compartir');
    mockNative.shareVideo.mockRejectedValueOnce(new Error('no activity'));
    expect(await videoSharing!.share('content://media/video/7', 'Compartir')).toBe(false);
  });

  it('keeps a copy in the gallery under the time’s name, then deletes the original', async () => {
    const result = await videoSharing!.adopt(picked, 'Swimcro_m1');
    expect(mockNative.copyToCache).toHaveBeenCalledWith('content://downloads/41', expect.stringMatching(/^incoming-/));
    expect(mockKeep).toHaveBeenCalledWith('file:///cache/incoming-1.mp4', 'Swimcro_m1');
    expect(mockNative.deleteDocument).toHaveBeenCalledWith('content://downloads/41');
    expect(result).toEqual({ assetId: 'content://media/video/12', originalRemoved: true });
  });

  it('keeps the original when Android does not let it go', async () => {
    mockNative.deleteDocument.mockRejectedValueOnce(new Error('not supported'));
    expect(await videoSharing!.adopt(picked, 'Swimcro_m1')).toEqual({ assetId: 'content://media/video/12', originalRemoved: false });
  });

  it('never deletes the original when the gallery refuses the copy', async () => {
    mockKeep.mockRejectedValueOnce(new Error('full'));
    await expect(videoSharing!.adopt(picked, 'Swimcro_m1')).rejects.toThrow('full');
    expect(mockNative.deleteDocument).not.toHaveBeenCalled();
  });

  it('gives nothing when the picker fails', async () => {
    mockNative.pickVideo.mockRejectedValueOnce(new Error('no activity'));
    expect(await videoSharing!.pick()).toBeNull();
  });
});
