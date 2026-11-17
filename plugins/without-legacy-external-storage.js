const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

// expo-media-library's plugin always sets android:requestLegacyExternalStorage on the application. It has no effect with
// targetSdk 36 and the app only writes to the gallery (#1173). Expo runs mods last-registered first, so app.config.ts lists
// this plugin before expo-media-library for its mod to run after the library's.
module.exports = function withoutLegacyExternalStorage(config) {
  return withAndroidManifest(config, (modConfig) => {
    delete AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults).$['android:requestLegacyExternalStorage'];
    return modConfig;
  });
};
