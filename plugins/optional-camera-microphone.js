const { withAndroidManifest } = require('expo/config-plugins');

// Play treats a feature as required when its permission is declared and the manifest says nothing about it (#1291). The camera
// and the microphone only serve the optional video stopwatch (#1088) and the athlete photo (#1222), so tablets and Chromebooks
// without them must still install the app.
const OPTIONAL_FEATURES = [
  'android.hardware.camera',
  'android.hardware.camera.any',
  'android.hardware.camera.autofocus',
  'android.hardware.microphone',
];

/** Sets android:required="false" on each feature of the manifest, replacing a declaration that is already there. */
function markOptional(manifest) {
  const root = manifest.manifest;
  const kept = (root['uses-feature'] ?? []).filter((feature) => !OPTIONAL_FEATURES.includes(feature.$['android:name']));
  root['uses-feature'] = [...kept, ...OPTIONAL_FEATURES.map((name) => ({ $: { 'android:name': name, 'android:required': 'false' } }))];
  return manifest;
}

module.exports = function withOptionalCameraMicrophone(config) {
  return withAndroidManifest(config, (modConfig) => {
    markOptional(modConfig.modResults);
    return modConfig;
  });
};
module.exports.markOptional = markOptional;
module.exports.OPTIONAL_FEATURES = OPTIONAL_FEATURES;
