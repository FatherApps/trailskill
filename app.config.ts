import type { ExpoConfig } from 'expo/config';

// APP_VARIANT=preview builds the test APK (docs/RELEASING.md, Test builds): its own package, name and scheme, so it installs next to the development client without taking over its links.
const preview = process.env.APP_VARIANT === 'preview';

// EAS project of the fatherapps-teams-co Expo organization (moved there from the personal fatherapps account on 2026-11-19; the project ID did not change). Public; the update URL below is built from it so the two cannot drift.
const projectId = '09e9d4f5-fe9e-4c74-a084-aaf9a9cfe9a0';

const config: ExpoConfig = {
  name: preview ? 'Swimcro (prueba)' : 'Swimcro',
  slug: 'swimcro',
  // The preview variant builds from the same EAS project, so there is no second ID.
  owner: 'fatherapps-teams-co',
  extra: { eas: { projectId } },
  // Opens school invitation links: swimcro://invite/<token>. The first scheme is the one the app builds links with; trailskill:// stays accepted so links sent before the rename still open.
  // The preview variant answers only to swimcro-preview://, so it does not open swimcro:// or trailskill:// links.
  scheme: preview ? 'swimcro-preview' : ['swimcro', 'trailskill'],
  version: '0.10.0', // x-release-please-version
  // OTA updates (docs/RELEASING.md, Over-the-air updates): the runtime is a hash of the native project, so any native change needs a new Play build. 0.1.0 predates expo-updates and never receives an OTA.
  runtimeVersion: { policy: 'fingerprint' },
  updates: { url: `https://u.expo.dev/${projectId}` },
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      // Themed icon (Android 13+): the single-ink symbol of the official files, tinted by the launcher.
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      // Background layer of the official adaptive icon (design/README.md, Logo files).
      backgroundColor: '#141414',
    },
    // Confirmed by the maintainer before the first Play upload (#1097). Play never lets an app change its package after that upload.
    package: preview ? 'com.fatherapps.swimcro.preview' : 'com.fatherapps.swimcro',
    // The app only writes to the gallery (#1169), but the plugin and the library manifest always add these reads: blocking removes them.
    // The athlete photo (#1222) comes from the camera or the system Photo Picker, which hands over only the chosen image and needs no read permission: the three granular reads are blocked too, whatever a library or plugin adds.
    // WRITE_EXTERNAL_STORAGE stays: Android 7 to 9 (minSdk 24) need it to save a video.
    // SYSTEM_ALERT_WINDOW comes from the Expo template's main manifest and the app never draws over other apps (#1182).
    // Release builds lose it; debug builds (the development client) keep it, because the template's src/debug manifest declares it again for the dev menu's Perf Monitor.
    blockedPermissions: [
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // Removes android:requestLegacyExternalStorage, which expo-media-library adds (#1173); keep it before that plugin.
    './plugins/without-legacy-external-storage',
    // Camera, autofocus and microphone are optional hardware (#1291): without it Play would infer them as required from the permissions.
    './plugins/optional-camera-microphone',
    // The individual stopwatch with video (#1088): saving the videos to the gallery. The camera and microphone
    // permissions come with the local module modules/video-recorder.
    // Write only (#1169): an empty granularPermissions (omitted means photo, video and audio) and no iOS read description.
    [
      'expo-media-library',
      {
        photosPermission: false,
        savePhotosPermission: 'Swimcro guarda en tu galería los videos que grabas con el cronómetro.',
        isAccessMediaLocationEnabled: false,
        granularPermissions: [],
      },
    ],
    // The athlete photo (#1222): the camera, and the system Photo Picker for the gallery, which needs no permission, so no read description is declared (the app reads no library).
    // The microphone stays at its default: the individual stopwatch's local module records audio and declares RECORD_AUDIO itself, and blocking it here would remove it.
    ['expo-image-picker', { photosPermission: false, cameraPermission: 'Swimcro usa la cámara para tomar la foto del deportista.' }],
    [
      'expo-splash-screen',
      {
        // Stacked lockup (light) and reversed lockup (dark) exported from the official SVGs on a square transparent canvas: Android 12+ crops the splash image to a circle two thirds of its frame.
        image: './assets/splash-light.png',
        imageWidth: 288,
        // Canvas of each theme; app-config.test.ts checks them against the theme tokens (Expo does not transpile imports here).
        backgroundColor: '#F4F2EC',
        dark: { image: './assets/splash-dark.png', backgroundColor: '#121210' },
      },
    ],
  ],
};

export default config;
