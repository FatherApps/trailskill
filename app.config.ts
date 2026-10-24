import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'TrailSkill',
  slug: 'trailskill',
  version: '1.0.0',
  userInterfaceStyle: 'automatic',
  android: {
    // Provisional until the maintainer confirms it, before the first Play upload.
    package: 'com.fatherapps.trailskill',
  },
  plugins: ['expo-router'],
};

export default config;
