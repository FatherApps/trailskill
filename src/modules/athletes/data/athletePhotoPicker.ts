// Issue 1222. Where a photo comes from: the camera or the system Photo Picker, cropped square, then re-encoded as a small JPEG.
// The Photo Picker needs no storage permission (it hands over only what the person chooses), so the app never asks for READ_MEDIA_*;
// only the camera asks for its own permission. The re-encoding drops the EXIF block (location, device, time) of a minor's photo.

export const PHOTO_SIZE = 512;
export const PHOTO_QUALITY = 0.8;

export type PhotoSource = 'camera' | 'library';

export type PhotoPickResult =
  /** The JPEG of PHOTO_SIZE pixels, in the app's cache, ready to be kept. */
  | { status: 'picked'; uri: string }
  | { status: 'cancelled' }
  /** The camera permission was refused. */
  | { status: 'denied' };

export interface PhotoPicker {
  pick(source: PhotoSource): Promise<PhotoPickResult>;
}

/** The centre square of an image: some croppers return a rectangle whatever the aspect asked for. */
export function squareCrop(width: number, height: number): { originX: number; originY: number; width: number; height: number } {
  const side = Math.min(width, height);
  return { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side };
}

// The libraries load when a photo is chosen, not when the module is imported: most screens and tests never need them.
/* eslint-disable @typescript-eslint/no-require-imports -- a static import would load two native modules in every screen that imports athletes */
const deleteQuietly = (uri: string) => {
  try {
    const { File } = require('expo-file-system') as typeof import('expo-file-system');
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The system cleans its cache later; nothing to tell the person.
  }
};

export function createExpoPhotoPicker(): PhotoPicker {
  const encode = async (asset: { uri: string; width: number; height: number }): Promise<string> => {
    const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const context = ImageManipulator.manipulate(asset.uri);
    try {
      const image = await context.crop(squareCrop(asset.width, asset.height)).resize({ width: PHOTO_SIZE }).renderAsync();
      try {
        return (await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY })).uri;
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  };

  return {
    async pick(source) {
      const picker = require('expo-image-picker') as typeof import('expo-image-picker');
      if (source === 'camera' && !(await picker.requestCameraPermissionsAsync()).granted) return { status: 'denied' };
      // Full quality here: the one lossy step is the encoding below, so the photo is not compressed twice.
      const options = { mediaTypes: ['images' as const], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 1, exif: false };
      const result = source === 'camera' ? await picker.launchCameraAsync(options) : await picker.launchImageLibraryAsync(options);
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return { status: 'cancelled' };
      try {
        return { status: 'picked', uri: await encode(asset) };
      } finally {
        // The picker leaves its own copy (a full-size capture, maybe with EXIF) in cacheDirectory/ImagePicker: the photo of a minor must not stay there.
        deleteQuietly(asset.uri);
      }
    },
  };
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** Test double: answers what it was given, once per call. */
export function createInMemoryPhotoPicker(results: PhotoPickResult[]): PhotoPicker & { requested: PhotoSource[] } {
  const queue = [...results];
  const requested: PhotoSource[] = [];
  return {
    requested,
    async pick(source) {
      requested.push(source);
      return queue.shift() ?? { status: 'cancelled' };
    },
  };
}
