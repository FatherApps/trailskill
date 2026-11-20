import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { File, Paths } from 'expo-file-system';
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import { forwardRef, useImperativeHandle, useRef, type ComponentType, type RefAttributes } from 'react';
import { PermissionsAndroid, type StyleProp, type ViewStyle } from 'react-native';

import type { VideoQuality } from '../../../core/preferences';

// The port to the phone's camera and gallery for the stopwatch with video (#1088). The screen only sees this port;
// the adapter below wraps the local module modules/video-recorder (CameraX), and the tests use a fake.

export type CameraPreviewHandle = {
  /** Starts recording; resolves with the file once the recording ends (stop, the time limit, or the camera closing), or null. */
  record(): Promise<string | null>;
  stop(): void;
};

/** The stopwatch strip drawn into the video: marks in the clock of the timing buttons. */
export type StopwatchOverlay = {
  enabled: boolean;
  event: string;
  startedAt: bigint | null;
  stoppedAt: bigint | null;
  splits: readonly bigint[];
  thousandths: boolean;
};

export type CameraPreviewProps = {
  quality: VideoQuality;
  audio: boolean;
  overlay: StopwatchOverlay;
  onReady: () => void;
  /** The camera could not open (another app has it, the provider failed, no rear camera). */
  onError: () => void;
  style?: StyleProp<ViewStyle>;
};

export type VideoCamera = {
  /** Camera, the microphone when the video has sound, and saving videos to the gallery. */
  requestPermissions(audio: boolean): Promise<boolean>;
  /** Free space on the phone in bytes, or null when unknown. */
  freeBytes(): number | null;
  /**
   * Keeps a finished recording in the Swimcro album of the gallery, under `name`, and returns its id in the gallery; rejects
   * when the gallery refuses it, and the file is deleted either way.
   */
  keep(uri: string, name: string): Promise<string>;
  /** Deletes a finished recording that is not kept. */
  discard(uri: string): void;
  /** The rear camera's live image, with the stopwatch strip drawn in. */
  Preview: ComponentType<CameraPreviewProps & RefAttributes<CameraPreviewHandle>>;
};

/** The gallery album where the videos go. */
export const VIDEO_ALBUM = 'Swimcro';

type NativeOverlay = { enabled: boolean; event: string; startedAt: string | null; stoppedAt: string | null; splits: string[]; thousandths: boolean };
type NativeRecorderProps = { quality: VideoQuality; audio: boolean; overlay: NativeOverlay; onReady: () => void; onError: () => void; style?: StyleProp<ViewStyle> };
type NativeRecorderRef = { record(): Promise<string | null>; stop(): Promise<void> };

// Bigints do not cross to native code: marks go as decimal strings, like the timing buttons' clock.
const nativeOverlay = (o: StopwatchOverlay): NativeOverlay => ({
  enabled: o.enabled,
  event: o.event,
  startedAt: o.startedAt?.toString() ?? null,
  stoppedAt: o.stoppedAt?.toString() ?? null,
  splits: o.splits.map(String),
  thousandths: o.thousandths,
});

/** What the local module says about the phone's hardware; a build without these functions assumes both are there. */
export type VideoRecorderModule = { hasCamera?: () => boolean; hasMicrophone?: () => boolean };

function nativePreview(hearing: boolean): VideoCamera['Preview'] {
  const NativeRecorder = requireNativeViewManager<NativeRecorderProps & RefAttributes<NativeRecorderRef>>('VideoRecorder');
  return forwardRef<CameraPreviewHandle, CameraPreviewProps>(function VideoRecorderPreview({ quality, audio, overlay, onReady, onError, style }, ref) {
    const native = useRef<NativeRecorderRef>(null);
    useImperativeHandle(
      ref,
      () => ({
        async record() {
          try {
            return (await native.current?.record()) ?? null;
          } catch {
            return null;
          }
        },
        stop() {
          native.current?.stop().catch(() => {});
        },
      }),
      [],
    );
    return <NativeRecorder ref={native} style={style} quality={quality} audio={audio && hearing} overlay={nativeOverlay(overlay)} onReady={onReady} onError={onError} />;
  });
}

/**
 * Moves a video file of the app's cache into the Swimcro album of the gallery, under `name`, and returns its id in the gallery.
 * Shared by recorded videos (#1088) and videos linked to a received time (#1201); rejects when the gallery refuses it, and the
 * file is deleted either way.
 */
export async function keepInGallery(uri: string, name: string): Promise<string> {
  // The file is renamed first, so the gallery shows the time's id in its name.
  const recorded = new File(uri);
  const named = new File(Paths.cache, `${name}.mp4`);
  let assetId: string;
  try {
    await recorded.move(named);
    const asset = await Asset.create(named.uri);
    assetId = asset.id;
    const album = await Album.get(VIDEO_ALBUM);
    if (album) await album.add(asset);
    else await Album.create(VIDEO_ALBUM, [asset], true);
  } finally {
    // Kept or refused, no copy stays in the cache: a refusal is often a full phone, and retrying is not offered (#1172).
    for (const file of [named, recorded]) {
      try {
        if (file.exists) file.delete();
      } catch {
        // The gallery already has its copy, or the file is gone; a leftover in the cache is cleared by the system.
      }
    }
  }
  return assetId;
}

async function granted(permission: Parameters<typeof PermissionsAndroid.request>[0]) {
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

function nativeVideoCamera(hearing: boolean): VideoCamera {
  return {
    async requestPermissions(audio) {
      if (!(await granted(PermissionsAndroid.PERMISSIONS.CAMERA))) return false;
      if (audio && hearing && !(await granted(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO))) return false;
      return (await requestPermissionsAsync(true, ['video'])).granted;
    },
    freeBytes() {
      try {
        return Paths.availableDiskSpace;
      } catch {
        return null;
      }
    },
    keep: keepInGallery,
    discard(uri) {
      try {
        new File(uri).delete();
      } catch {
        // Already gone.
      }
    },
    Preview: nativePreview(hearing),
  };
}

/**
 * The phone's camera with the stopwatch drawn into the video; null where the module is missing (iOS, tests, an old build) or the
 * phone has no rear camera, so «Grabar» is not offered (#1291). Without a microphone the video is recorded without sound and
 * RECORD_AUDIO is never asked.
 */
export function videoCameraFor(module: VideoRecorderModule | null): VideoCamera | null {
  if (!module || module.hasCamera?.() === false) return null;
  return nativeVideoCamera(module.hasMicrophone?.() !== false);
}

export const videoCamera: VideoCamera | null = videoCameraFor(requireOptionalNativeModule<VideoRecorderModule>('VideoRecorder'));
