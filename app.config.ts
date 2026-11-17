import type { ExpoConfig } from 'expo/config';

// APP_VARIANT=preview builds the test APK (docs/RELEASING.md, Test builds): its own package, name and scheme, so it installs next to the development client without taking over its links.
const preview = process.env.APP_VARIANT === 'preview';

const config: ExpoConfig = {
  name: preview ? 'Swimcro (prueba)' : 'Swimcro',
  slug: 'swimcro',
  // EAS project of the fatherapps account. Both values are public. The preview variant builds from the same project, so there is no second ID.
  owner: 'fatherapps',
  extra: { eas: { projectId: '09e9d4f5-fe9e-4c74-a084-aaf9a9cfe9a0' } },
  // Opens school invitation links: swimcro://invite/<token>. The first scheme is the one the app builds links with; trailskill:// stays accepted so links sent before the rename still open.
  // The preview variant answers only to swimcro-preview://, so it does not open swimcro:// or trailskill:// links.
  scheme: preview ? 'swimcro-preview' : ['swimcro', 'trailskill'],
  version: '0.1.0',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      // Background layer of the official adaptive icon (design/README.md, Logo files).
      backgroundColor: '#141414',
    },
    // Confirmed by the maintainer before the first Play upload (#1097). Play never lets an app change its package after that upload.
    package: preview ? 'com.fatherapps.swimcro.preview' : 'com.fatherapps.swimcro',
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
