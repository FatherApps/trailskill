import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
