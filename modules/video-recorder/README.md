# video-recorder (Expo local module, Android only)

Records the individual stopwatch on video (issue #1088): the rear camera full screen, with the stopwatch strip drawn into the recorded video. It uses CameraX (`androidx.camera` 1.4.2: `camera-core`, `camera2`, `lifecycle`, `video`). The strip is drawn by an `OverlayEffect` on the video only, because the screen shows the stopwatch with its own controls on top of the preview.

Only the camera and the drawing are native. The permissions, the free-space check, saving the video to the gallery album «Swimcro», the stopwatch rules and the screen are TypeScript in `src/modules/family-timing` (`data/videoCamera.tsx` is the adapter; `screens/VideoStopwatchContainer.tsx` is the flow). The screen only sees the `VideoCamera` port, and the tests use the fake in `src/modules/family-timing/testing/fakeVideoCamera.tsx`, which is never imported by app code so it stays out of release bundles.

The view is `VideoRecorder` (`requireNativeViewManager('VideoRecorder')`):

- Props: `quality` (`'low'` = SD, `'medium'` = HD, `'high'` = FHD, with a fallback to a lower quality), `audio` (boolean), `overlay` (`{ enabled, event, startedAt, stoppedAt, splits, thousandths }`; marks are decimal strings of the `SystemClock.elapsedRealtimeNanos()` clock, because bigints do not cross to native code).
- `record()`: starts recording and resolves with the file URI once the recording ends (stop, the 30 minute safety limit, the camera closing, low space), or `null` when nothing was recorded. The file is in the app's private cache (`context.cacheDir`); the adapter moves it to the gallery or deletes it.
- `stop()`: ends the recording.
- Functions: `hasCamera()` (a rear camera exists) and `hasMicrophone()`, from `PackageManager.hasSystemFeature`. The manifest declares both as not required (#1291), so the adapter hides «Grabar» without a camera and records without sound, never asking `RECORD_AUDIO`, without a microphone.
- Events: `onReady` (the camera is bound) and `onError` (the camera could not open).
- `now()`: the same clock as the timing buttons.
- Sharing and linking a time's video (#1201), through the `VideoSharing` port (`src/modules/family-timing/data/videoSharing.ts`):
  - `shareVideo(uri, title)`: opens Android's share menu with the gallery file itself, so it keeps its name (`Swimcro_<time id>.mp4`).
  - `pickVideo()`: the system's file picker limited to videos (`ACTION_OPEN_DOCUMENT`); no permission to read the gallery is needed. Resolves with `{ uri, name }`, or `null` when the person goes back.
  - `copyToCache(uri, name)`: copies the chosen video into the app's cache as `name.mp4` and returns the copy's file URI; the adapter then keeps it in the gallery like a recorded video.
  - `deleteDocument(uri)`: deletes the chosen file once the app has its copy, where its provider allows it; `false` when it stays.

The manifest of this module declares `CAMERA` and `RECORD_AUDIO`, which the build merges into the app's manifest, and `camera.any` as not required. The permissions are asked from JavaScript when the video screen opens (after a first-time explanation screen), and the microphone only when the sound setting is on. See `docs/release/data-safety.md`.

iOS has no counterpart: `"platforms": ["android"]`, so `requireOptionalNativeModule('VideoRecorder')` is `null` there and «Grabar» is not offered.

## How it is tested

CI (`.github/workflows/app-checks.yml`) runs `npm run typecheck`, `npm run lint` and `npm test`. None of them compiles or runs the Kotlin: there is no Gradle build or emulator in CI, so a Kotlin error shows up only in `eas build` or on a phone.

Covered in CI, with the fake camera and with the gallery and file system mocked:

- The whole video flow and its rules, through the `VideoCamera` port (`src/modules/family-timing/__tests__/VideoStopwatchContainer.test.tsx`, `FamilyTimingContainer.test.tsx`).
- The adapter's JavaScript logic that does not touch the phone: the Swimcro album lookup and creation, cleaning the cache, refusals (`__tests__/videoCamera.test.ts`).
- The merged manifest settings in `app.config.ts` (`src/__tests__/app-config.test.ts`).

**Not** covered in CI, so check by hand on a real phone (the emulator camera is not enough for the first two) before a release that touches this module or `expo-media-library`:

1. Camera and microphone permission dialogs, including «Don't ask again» (the screen closes and says how to grant them).
2. The real recording: the preview fills the screen in portrait and landscape, the video has the stopwatch strip in the right clock, with sound when the setting is on, and in the three qualities.
3. Saving: the video appears in the gallery album «Swimcro» with the name `Swimcro_<time id>`, and no copy stays in the cache.
4. Failures: the camera in use by another app, a full phone (the warning and the refusal notice), answering a call or leaving the app while recording (the take is cancelled and its video deleted).
5. The merged Play manifest: `CAMERA`, `RECORD_AUDIO`, and `WRITE_EXTERNAL_STORAGE` only up to API 32, no media read permissions (`docs/release/data-safety.md`).
