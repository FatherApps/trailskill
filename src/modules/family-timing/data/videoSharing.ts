import { requireOptionalNativeModule } from 'expo-modules-core';
import { requestPermissionsAsync } from 'expo-media-library';

import { keepInGallery } from './videoCamera';

// The port to share a time's video and to link one received from another family (#1201). The app never uploads a video:
// the person sends it with the app they choose (WhatsApp, for example), and the other family links it on their own phone.
// The adapter below wraps the local module modules/video-recorder; the tests use the fake in testing/.

/** A video the person chose with the system's file picker: its address and the file's name, when the picker gives it. */
export type PickedVideo = { uri: string; name: string | null };

export type VideoSharing = {
  /** Opens Android's share menu (titled `title`) with the gallery video itself, so it keeps its name (the time's id). False when it could not open. */
  share(assetId: string, title: string): Promise<boolean>;
  /** The system's file picker, limited to videos; null when the person goes back without choosing. */
  pick(): Promise<PickedVideo | null>;
  /**
   * Moves the chosen video into the Swimcro album under `name` and returns its id in the gallery. The original is deleted
   * once the copy is kept, where Android allows it (`originalRemoved`); rejects when the gallery refuses it.
   */
  adopt(video: PickedVideo, name: string): Promise<{ assetId: string; originalRemoved: boolean }>;
};

type NativeSharing = {
  shareVideo(uri: string, title: string): Promise<void>;
  pickVideo(): Promise<PickedVideo | null>;
  copyToCache(uri: string, name: string): Promise<string>;
  deleteDocument(uri: string): Promise<boolean>;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Whether a chosen video's file name says it is this time's video. A video keeps the time's id in its name
 * (`Swimcro_<id>.mp4`) when it is sent as a document; other ways of sending rename it, and then nothing can be checked.
 */
export function videoMatchesTime(name: string | null, measurementId: string): 'same' | 'other' | 'unknown' {
  const ids = (name ?? '').match(UUID)?.map((id) => id.toLowerCase()) ?? [];
  if (ids.length === 0) return 'unknown';
  return ids.includes(measurementId.toLowerCase()) ? 'same' : 'other';
}

function nativeVideoSharing(native: NativeSharing): VideoSharing {
  return {
    async share(assetId, title) {
      try {
        await native.shareVideo(assetId, title);
        return true;
      } catch {
        return false;
      }
    },
    async pick() {
      try {
        return await native.pickVideo();
      } catch {
        return null;
      }
    },
    async adopt(video, name) {
      // Android 9 and older ask for the gallery's write permission; newer ones need none to add the app's own video.
      await requestPermissionsAsync(true, ['video']);
      const copy = await native.copyToCache(video.uri, `incoming-${Date.now()}`);
      const assetId = await keepInGallery(copy, name);
      let originalRemoved = false;
      try {
        originalRemoved = await native.deleteDocument(video.uri);
      } catch {
        // The original stays where it was; the person is told.
      }
      return { assetId, originalRemoved };
    },
  };
}

const native = requireOptionalNativeModule<NativeSharing>('VideoRecorder');

/** Sharing and linking videos; null where the module is missing (iOS, tests, an old build). */
export const videoSharing: VideoSharing | null = native?.shareVideo ? nativeVideoSharing(native) : null;
