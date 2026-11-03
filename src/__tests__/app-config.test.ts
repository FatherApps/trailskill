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
    expect(preview.android?.package).toBe('com.fatherapps.trailskill.preview');
    expect(preview.name).toBe('TrailSkill (prueba)');
    expect(preview.scheme).toBe('trailskill-preview');
  });

  it.each([undefined, '', 'production'])('keeps the usual package, name and scheme when APP_VARIANT is %p', (variant) => {
    const usual = loadConfig(variant);
    expect(usual.android?.package).toBe('com.fatherapps.trailskill');
    expect(usual.name).toBe('TrailSkill');
    expect(usual.scheme).toBe('trailskill');
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

describe('app icon and splash configuration', () => {
  it('registers the trailskill:// scheme so school invitation links open the app', () => {
    expect(config.scheme).toBe('trailskill');
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
