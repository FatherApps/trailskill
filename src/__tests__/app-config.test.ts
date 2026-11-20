import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ExpoConfig } from 'expo/config';

import config from '../../app.config';
import { colors } from '../core/theme';

const root = resolve(__dirname, '../..');

function pngSize(path: string) {
  const file = readFileSync(resolve(root, path));
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

function splashOptions() {
  const entry = (config.plugins ?? []).find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
  return (entry as [string, Record<string, any>] | undefined)?.[1];
}

function imagePickerOptions() {
  const entry = (config.plugins ?? []).find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker');
  return (entry as [string, Record<string, any>] | undefined)?.[1];
}

function mediaLibraryOptions() {
  const entry = (config.plugins ?? []).find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-media-library');
  return (entry as [string, Record<string, any>] | undefined)?.[1];
}

// Expo reads app.config.ts once per process, so each variant is loaded in a fresh module registry.
function loadConfig(variant?: string): ExpoConfig {
  const previous = process.env.APP_VARIANT;
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  try {
    let loaded!: ExpoConfig;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a synchronous load
      loaded = require('../../app.config').default;
    });
    return loaded;
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
  }
}

describe('preview test build variant', () => {
  it('installs next to the demo client with its own package, name and scheme when APP_VARIANT is preview', () => {
    const preview = loadConfig('preview');
    expect(preview.android?.package).toBe('com.fatherapps.swimcro.preview');
    expect(preview.name).toBe('Swimcro (prueba)');
    expect(preview.scheme).toBe('swimcro-preview');
  });

  it.each([undefined, '', 'production'])('keeps the usual package, name and scheme when APP_VARIANT is %p', (variant) => {
    const usual = loadConfig(variant);
    expect(usual.android?.package).toBe('com.fatherapps.swimcro');
    expect(usual.name).toBe('Swimcro');
    expect(usual.scheme).toEqual(['swimcro', 'trailskill']);
  });

  it('changes nothing else in the preview variant', () => {
    const { name, scheme, android, ...preview } = loadConfig('preview');
    const { name: _n, scheme: _s, android: usualAndroid, ...usual } = loadConfig();
    const { package: _p, ...previewAndroid } = android!;
    const { package: _q, ...usualRest } = usualAndroid!;
    expect(preview).toEqual(usual);
    expect(previewAndroid).toEqual(usualRest);
  });
});

describe('EAS project link', () => {
  // The project ID is public (not a secret). The preview variant builds from the same EAS project.
  it.each([undefined, 'preview'])('links the EAS project of fatherapps-teams-co when APP_VARIANT is %p', (variant) => {
    const loaded = loadConfig(variant);
    expect(loaded.owner).toBe('fatherapps-teams-co');
    expect(loaded.extra?.eas?.projectId).toBe('09e9d4f5-fe9e-4c74-a084-aaf9a9cfe9a0');
  });
});

describe('app icon and splash configuration', () => {
  it('builds links with swimcro:// and still opens trailskill:// links sent before the rename', () => {
    // expo-linking builds URLs (auth redirect, invitations) with the first scheme.
    expect(config.scheme).toEqual(['swimcro', 'trailskill']);
  });

  it('uses swimcro as the Expo slug', () => {
    expect(config.slug).toBe('swimcro');
  });

  it('uses a 1024 px square app icon', () => {
    expect(config.icon).toBeDefined();
    expect(existsSync(resolve(root, config.icon!))).toBe(true);
    expect(pngSize(config.icon!)).toEqual({ width: 1024, height: 1024 });
  });

  it('puts the adaptive foreground on the official #141414 background layer', () => {
    const adaptive = config.android?.adaptiveIcon;
    expect(adaptive?.backgroundColor).toBe('#141414');
    expect(existsSync(resolve(root, adaptive!.foregroundImage!))).toBe(true);
    expect(pngSize(adaptive!.foregroundImage!)).toEqual({ width: 1024, height: 1024 });
  });

  it('shows the logo on the splash screen over the canvas of each theme', () => {
    const splash = splashOptions();
    expect(splash).toBeDefined();
    expect(splash!.backgroundColor).toBe(colors.light['surface-0']);
    expect(splash!.dark.backgroundColor).toBe(colors.dark['surface-0']);
    for (const image of [splash!.image, splash!.dark.image]) {
      expect(existsSync(resolve(root, image))).toBe(true);
    }
    expect(splash!.dark.image).not.toBe(splash!.image);
  });

  // Android 12+ crops the splash image to a circle two thirds of its frame: the logo needs transparent margin to survive it.
  it('exports square splash images so the Android 12 circle crop keeps the whole logo', () => {
    const splash = splashOptions();
    for (const image of [splash!.image, splash!.dark.image]) {
      const { width, height } = pngSize(image);
      expect(width).toBe(height);
    }
  });
});

// The app only writes videos to the gallery (#1169): no read permission may reach the manifest or Info.plist.
describe('gallery permissions', () => {
  it('asks for no READ_MEDIA_* permission: an empty granular list, because a missing one means photo, video and audio', () => {
    expect(mediaLibraryOptions()!.granularPermissions).toEqual([]);
  });

  it('drops the unused iOS photo library read description until the gallery check (#1089) brings it back', () => {
    expect(mediaLibraryOptions()!.photosPermission).toBe(false);
  });

  it('keeps the description of saving videos to the gallery', () => {
    const { savePhotosPermission } = mediaLibraryOptions()!;
    expect(savePhotosPermission).toBe('Swimcro guarda en tu galería los videos que grabas con el cronómetro.');
  });

  it('removes the reads the plugin and the library manifest always add, and keeps WRITE_EXTERNAL_STORAGE for Android 7 to 9', () => {
    const blocked = config.android?.blockedPermissions;
    expect(blocked).toEqual(
      expect.arrayContaining(['android.permission.READ_MEDIA_VISUAL_USER_SELECTED', 'android.permission.READ_EXTERNAL_STORAGE']),
    );
    expect(blocked).toHaveLength(6);
    expect(blocked).not.toContain('android.permission.WRITE_EXTERNAL_STORAGE');
  });

  // The athlete photo (#1222) uses the camera and the system Photo Picker: no READ_MEDIA_* may reach the combined manifest, whatever the picker's plugin or library adds.
  it('blocks every READ_MEDIA_* permission', () => {
    expect(config.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      ]),
    );
  });

  it('the image picker declares no photo library read description and keeps the microphone the stopwatch video needs', () => {
    expect(imagePickerOptions()!.photosPermission).toBe(false);
    expect(imagePickerOptions()!.cameraPermission).toEqual(expect.any(String));
    expect(imagePickerOptions()!.microphonePermission).not.toBe(false);
  });

  // The Expo template's main manifest declares "display over other apps" (#1182); the app never uses it and Play treats it as sensitive.
  it('removes SYSTEM_ALERT_WINDOW from the main manifest', () => {
    expect(config.android?.blockedPermissions).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  });
});

describe('Android manifest', () => {
  // expo-media-library's plugin sets android:requestLegacyExternalStorage; Expo runs mods last-registered first, so the plugin that removes it must be listed before the library (#1173).
  // Whether the flag is really gone is checked with `npx expo config --type introspect`.
  it('lists the plugin that removes requestLegacyExternalStorage before expo-media-library', () => {
    const plugins = config.plugins ?? [];
    const remover = plugins.indexOf('./plugins/without-legacy-external-storage');
    const library = plugins.findIndex((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-media-library');
    expect(existsSync(resolve(root, 'plugins/without-legacy-external-storage.js'))).toBe(true);
    expect(remover).toBeGreaterThanOrEqual(0);
    expect(remover).toBeLessThan(library);
  });
});

// OTA updates (#1188): an update reaches only builds whose native fingerprint matches, and only on the channel of their build profile.
describe('over-the-air updates', () => {
  const eas = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'));

  it.each([undefined, 'preview'])('derives the runtime version from the native fingerprint when APP_VARIANT is %p', (variant) => {
    expect(loadConfig(variant).runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('downloads updates from the EAS Update URL of the linked project', () => {
    expect(config.updates?.url).toBe(`https://u.expo.dev/${config.extra?.eas?.projectId}`);
  });

  it.each([
    ['preview', 'preview'],
    ['qa', 'qa'],
    ['production', 'production'],
  ])('builds the %s profile on the %s channel', (profile, channel) => {
    expect(eas.build[profile].channel).toBe(channel);
  });

  it('builds the qa profile as an internal APK like preview', () => {
    expect(eas.build.qa.extends).toBe('preview');
  });

  it('keeps the development client off every update channel', () => {
    expect(eas.build.development.channel).toBeUndefined();
  });
});
