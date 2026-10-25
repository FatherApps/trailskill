import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'TrailSkill',
  slug: 'trailskill',
  // Opens school invitation links: trailskill://invite/<token>.
  scheme: 'trailskill',
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
    package: 'com.fatherapps.trailskill',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
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
