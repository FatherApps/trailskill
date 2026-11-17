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
  style?: StyleProp<ViewStyle>;
};

export type VideoCamera = {
  /** Camera, the microphone when the video has sound, and saving videos to the gallery. */
  requestPermissions(audio: boolean): Promise<boolean>;
  /** Free space on the phone in bytes, or null when unknown. */
  freeBytes(): number | null;
  /** Keeps a finished recording in the TrailSkill album of the gallery, under `name`. */
  keep(uri: string, name: string): Promise<void>;
  /** Deletes a finished recording that is not kept. */
  discard(uri: string): void;
  /** The rear camera's live image, with the stopwatch strip drawn in. */
  Preview: ComponentType<CameraPreviewProps & RefAttributes<CameraPreviewHandle>>;
};

/** The gallery album where the videos go. */
export const VIDEO_ALBUM = 'TrailSkill';

type NativeOverlay = { enabled: boolean; event: string; startedAt: string | null; stoppedAt: string | null; splits: string[]; thousandths: boolean };
type NativeRecorderProps = { quality: VideoQuality; audio: boolean; overlay: NativeOverlay; onReady: () => void; style?: StyleProp<ViewStyle> };
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

function nativePreview(): VideoCamera['Preview'] {
  const NativeRecorder = requireNativeViewManager<NativeRecorderProps & RefAttributes<NativeRecorderRef>>('VideoRecorder');
  return forwardRef<CameraPreviewHandle, CameraPreviewProps>(function VideoRecorderPreview({ quality, audio, overlay, onReady, style }, ref) {
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
    return <NativeRecorder ref={native} style={style} quality={quality} audio={audio} overlay={nativeOverlay(overlay)} onReady={onReady} />;
  });
}

async function granted(permission: Parameters<typeof PermissionsAndroid.request>[0]) {
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

function nativeVideoCamera(): VideoCamera {
  return {
    async requestPermissions(audio) {
      if (!(await granted(PermissionsAndroid.PERMISSIONS.CAMERA))) return false;
      if (audio && !(await granted(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO))) return false;
      return (await requestPermissionsAsync(true, ['video'])).granted;
    },
    freeBytes() {
      try {
        return Paths.availableDiskSpace;
      } catch {
        return null;
      }
    },
    async keep(uri, name) {
      // The file is renamed first, so the gallery shows the time's id in its name.
      const recorded = new File(uri);
      const named = new File(Paths.cache, `${name}.mp4`);
      await recorded.move(named);
      const asset = await Asset.create(named.uri);
      const album = await Album.get(VIDEO_ALBUM);
      if (album) await album.add(asset);
      else await Album.create(VIDEO_ALBUM, [asset], true);
      try {
        if (named.exists) named.delete();
      } catch {
        // The gallery already has its copy; a leftover in the cache is cleared by the system.
      }
    },
    discard(uri) {
      try {
        new File(uri).delete();
      } catch {
        // Already gone.
      }
    },
    Preview: nativePreview(),
  };
}

/** The phone's camera with the stopwatch drawn into the video; null where the module is missing (iOS, tests, an old build). */
export const videoCamera: VideoCamera | null = requireOptionalNativeModule('VideoRecorder') ? nativeVideoCamera() : null;

/** A camera the tests drive by hand: finish() ends the recording as the camera would. */
export function createFakeVideoCamera(options: { granted?: boolean; freeBytes?: number | null } = {}) {
  const state = {
    granted: options.granted ?? true,
    free: options.freeBytes === undefined ? 10_000_000_000 : options.freeBytes,
    recordings: 0,
    recording: false,
    stops: 0,
    kept: [] as { uri: string; name: string }[],
    discarded: [] as string[],
    audioAsked: [] as boolean[],
    ready: null as (() => void) | null,
    overlay: null as StopwatchOverlay | null,
    resolve: null as ((uri: string | null) => void) | null,
  };
  const finish = (uri: string | null = `file:///cache/recording-${state.recordings}.mp4`) => {
    const resolve = state.resolve;
    state.resolve = null;
    state.recording = false;
    resolve?.(uri);
  };
  const FakePreview = forwardRef<CameraPreviewHandle, CameraPreviewProps>(function FakePreview({ onReady, overlay }, ref) {
    state.ready = onReady;
    state.overlay = overlay;
    useImperativeHandle(
      ref,
      () => ({
        record() {
          state.recordings += 1;
          state.recording = true;
          return new Promise<string | null>((resolve) => {
            state.resolve = resolve;
          });
        },
        stop() {
          state.stops += 1;
          finish();
        },
      }),
      [],
    );
    return null;
  });
  const camera: VideoCamera = {
    async requestPermissions(audio) {
      state.audioAsked.push(audio);
      return state.granted;
    },
    freeBytes: () => state.free,
    async keep(uri, name) {
      state.kept.push({ uri, name });
    },
    discard(uri) {
      state.discarded.push(uri);
    },
    Preview: FakePreview,
  };
  return { camera, state, finish };
}
