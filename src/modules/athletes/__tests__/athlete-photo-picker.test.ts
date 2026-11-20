import { createExpoPhotoPicker, PHOTO_QUALITY, PHOTO_SIZE, squareCrop } from '..';

// Synthetic data only. The two Expo libraries are faked: the tests look at what is asked of them, never at a device.
const mockCamera = jest.fn();
const mockLibrary = jest.fn();
const mockRequestCamera = jest.fn();
const mockRequestMediaLibrary = jest.fn();
const calls: { op: string; arg?: unknown }[] = [];

jest.mock('../../../core/sync', () => ({ supabase: {}, db: {}, useQuery: jest.fn(), writeRecord: jest.fn(), deleteRecord: jest.fn() }));
const mockDeleted: string[] = [];
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  },
  Paths: { cache: '', document: '' },
}));
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: (...args: unknown[]) => mockCamera(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLibrary(...args),
  requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestCamera(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestMediaLibrary(...args),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (uri: string) => {
      calls.push({ op: 'manipulate', arg: uri });
      const context = {
        crop: (rect: unknown) => (calls.push({ op: 'crop', arg: rect }), context),
        resize: (size: unknown) => (calls.push({ op: 'resize', arg: size }), context),
        renderAsync: async () => ({
          saveAsync: async (options: unknown) => (calls.push({ op: 'save', arg: options }), { uri: 'file:///out.jpg', width: 512, height: 512 }),
          release: () => undefined,
        }),
        release: () => undefined,
      };
      return context;
    },
  },
}));

const picked = (width: number, height: number) => ({ canceled: false, assets: [{ uri: 'file:///picked.png', width, height }] });

beforeEach(() => {
  calls.length = 0;
  mockDeleted.length = 0;
  mockCamera.mockReset();
  mockLibrary.mockReset();
  mockRequestCamera.mockReset().mockResolvedValue({ granted: true });
  mockRequestMediaLibrary.mockReset();
});

describe('squareCrop', () => {
  it('takes the centre square of a landscape image', () => {
    expect(squareCrop(4000, 3000)).toEqual({ originX: 500, originY: 0, width: 3000, height: 3000 });
  });

  it('takes the centre square of a portrait image', () => {
    expect(squareCrop(3000, 4000)).toEqual({ originX: 0, originY: 500, width: 3000, height: 3000 });
  });

  it('keeps an image that is already square', () => {
    expect(squareCrop(1000, 1000)).toEqual({ originX: 0, originY: 0, width: 1000, height: 1000 });
  });
});

describe('the photo picker', () => {
  it('the library opens the system Photo Picker with a square crop and asks for no media permission', async () => {
    mockLibrary.mockResolvedValue(picked(1000, 1000));

    const result = await createExpoPhotoPicker().pick('library');

    expect(result).toEqual({ status: 'picked', uri: 'file:///out.jpg' });
    expect(mockLibrary).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], exif: false }));
    expect(mockRequestMediaLibrary).not.toHaveBeenCalled();
  });

  it('the camera asks for the camera permission, then takes a square photo', async () => {
    mockCamera.mockResolvedValue(picked(1000, 1000));

    const result = await createExpoPhotoPicker().pick('camera');

    expect(result.status).toBe('picked');
    expect(mockRequestCamera).toHaveBeenCalledTimes(1);
    expect(mockCamera).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], exif: false }));
  });

  it('a refused camera permission opens nothing and says so', async () => {
    mockRequestCamera.mockResolvedValue({ granted: false });

    expect(await createExpoPhotoPicker().pick('camera')).toEqual({ status: 'denied' });
    expect(mockCamera).not.toHaveBeenCalled();
  });

  it('closing the picker without choosing is not an error', async () => {
    mockLibrary.mockResolvedValue({ canceled: true, assets: null });

    expect(await createExpoPhotoPicker().pick('library')).toEqual({ status: 'cancelled' });
    expect(calls).toEqual([]);
  });

  it('turns the chosen image into a 512 px JPEG at quality 0.8, square even when the cropper returned a rectangle', async () => {
    mockLibrary.mockResolvedValue(picked(4000, 3000));

    await createExpoPhotoPicker().pick('library');

    expect(PHOTO_SIZE).toBe(512);
    expect(PHOTO_QUALITY).toBe(0.8);
    expect(calls).toEqual([
      { op: 'manipulate', arg: 'file:///picked.png' },
      { op: 'crop', arg: { originX: 500, originY: 0, width: 3000, height: 3000 } },
      { op: 'resize', arg: { width: 512 } },
      { op: 'save', arg: { format: 'jpeg', compress: 0.8 } },
    ]);
  });

  it('deletes the picker\'s own full-size copy once the 512 px JPEG exists, and also when the encoding fails', async () => {
    mockLibrary.mockResolvedValue(picked(1000, 1000));
    await createExpoPhotoPicker().pick('library');
    expect(mockDeleted).toEqual(['file:///picked.png']);

    mockDeleted.length = 0;
    mockLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///broken.png', width: 0, height: 0 }] });
    calls.length = 0;
    jest.spyOn(Math, 'min').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(createExpoPhotoPicker().pick('library')).rejects.toThrow('boom');
    expect(mockDeleted).toEqual(['file:///broken.png']);
    jest.restoreAllMocks();
  });
});
