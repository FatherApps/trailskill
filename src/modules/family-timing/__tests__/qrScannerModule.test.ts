import { loadQrScanner } from '../data/qrScanner';

jest.mock('../../../core/sync', () => ({ db: {}, supabase: {}, useRecordSyncStates: () => new Map() }));

// A client built before expo-camera joined the app (every earlier dev client) has no ExpoCamera native module, and importing
// expo-camera there throws at once. The module's index is loaded at startup, so it must survive that and offer no scanner.
const missing = () => {
  throw new Error("Cannot find native module 'ExpoCamera'");
};

type ExpoCamera = ReturnType<Parameters<typeof loadQrScanner>[1]>;

// CameraView.isAvailableAsync is web-only: on Android and iOS expo-camera throws UnavailabilityError (issue 1411).
const camera = (granted: boolean) =>
  ({
    Camera: { requestCameraPermissionsAsync: async () => ({ granted }) },
    CameraView: Object.assign(() => null, {
      isAvailableAsync: async () => {
        throw new Error('The method or property CameraView.isAvailableAsync is not available on android');
      },
    }),
  }) as unknown as ExpoCamera;

describe('the QR scanner of a build without the camera module (issue 1322)', () => {
  it('loads the module index without throwing when requiring expo-camera throws, and offers no scanner', () => {
    jest.isolateModules(() => {
      jest.doMock('expo-camera', missing);
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the module must be loaded inside the isolated registry, after the mock
      const index = require('../index');
      expect(index.qrScanner).toBeNull();
    });
  });

  it('never loads expo-camera when the native module is not installed', () => {
    const load = jest.fn(missing);
    expect(loadQrScanner(false, load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('offers no scanner when the library fails to load', () => {
    expect(loadQrScanner(true, missing)).toBeNull();
  });

  it('asks for the permission and resolves true when it is granted, even though isAvailableAsync throws (issue 1411)', async () => {
    expect(await loadQrScanner(true, () => camera(true))!.requestPermission()).toBe(true);
  });

  it('resolves false when the person denies the camera permission', async () => {
    expect(await loadQrScanner(true, () => camera(false))!.requestPermission()).toBe(false);
  });
});
