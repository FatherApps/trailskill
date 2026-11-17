import { forwardRef, useEffect, useImperativeHandle } from 'react';

import type { CameraPreviewHandle, CameraPreviewProps, StopwatchOverlay, VideoCamera } from '../data/videoCamera';

// Tests only: this folder is never imported by app code, so it stays out of release bundles (#1173; same idea as #1040).

/** A camera the tests drive by hand: finish() ends the recording as the camera would; failToOpen makes it fail to open, fail() later; failKeep makes the gallery refuse every video. */
export function createFakeVideoCamera(options: { granted?: boolean; freeBytes?: number | null; failToOpen?: boolean; failKeep?: boolean } = {}) {
  const state = {
    granted: options.granted ?? true,
    free: options.freeBytes === undefined ? 10_000_000_000 : options.freeBytes,
    recordings: 0,
    recording: false,
    stops: 0,
    kept: [] as { uri: string; name: string }[],
    keepAttempts: 0,
    discarded: [] as string[],
    audioAsked: [] as boolean[],
    ready: null as (() => void) | null,
    fail: () => {},
    overlay: null as StopwatchOverlay | null,
    resolve: null as ((uri: string | null) => void) | null,
  };
  const finish = (uri: string | null = `file:///cache/recording-${state.recordings}.mp4`) => {
    const resolve = state.resolve;
    state.resolve = null;
    state.recording = false;
    resolve?.(uri);
  };
  const FakePreview = forwardRef<CameraPreviewHandle, CameraPreviewProps>(function FakePreview({ onReady, onError, overlay }, ref) {
    state.ready = onReady;
    state.fail = onError;
    state.overlay = overlay;
    useEffect(() => {
      if (options.failToOpen) onError();
      // The camera opens (or fails) once, when the preview mounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
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
      state.keepAttempts += 1;
      if (options.failKeep) throw new Error('The gallery refused the video');
      state.kept.push({ uri, name });
      return `asset-${state.kept.length}`;
    },
    discard(uri) {
      state.discarded.push(uri);
    },
    Preview: FakePreview,
  };
  return { camera, state, finish };
}
