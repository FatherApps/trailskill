import type { ExpoConfig } from 'expo/config';

// APP_VARIANT=preview builds the test APK (docs/RELEASING.md, Test builds): its own package, name and scheme, so it installs next to the development client without taking over its links.
const preview = process.env.APP_VARIANT === 'preview';

const config: ExpoConfig = {
  name: preview ? 'TrailSkill (prueba)' : 'TrailSkill',
  slug: 'trailskill',
  // Opens school invitation links: trailskill://invite/<token>. The preview variant answers only to trailskill-preview://, so it does not open trailskill:// links.
  scheme: preview ? 'trailskill-preview' : 'trailskill',
  version: '1.0.0',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      // Background layer of the official adaptive icon (design/README.md, Logo files).
      backgroundColor: '#141414',
    },
    // Provisional until the maintainer confirms it, before the first Play upload.
    package: preview ? 'com.fatherapps.trailskill.preview' : 'com.fatherapps.trailskill',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // The individual stopwatch with video (#1088): saving the videos to the gallery. The camera and microphone
    // permissions come with the local module modules/video-recorder.
    [
      'expo-media-library',
      {
        photosPermission: 'TrailSkill revisa si el video de un tiempo sigue en tu galería.',
        savePhotosPermission: 'TrailSkill guarda en tu galería los videos que grabas con el cronómetro.',
        isAccessMediaLocationEnabled: false,
        granularPermissions: ['video'],
      },
    ],
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
