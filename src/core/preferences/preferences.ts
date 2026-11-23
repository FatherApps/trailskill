import * as SecureStore from 'expo-secure-store';

import type { ThemeMode } from '../theme';

export type { ThemeMode };
/** How many decimals a time shows where it was measured in milliseconds. Times stored in hundredths always show hundredths. */
export type TimePrecision = 'hundredths' | 'thousandths';

/** The timing buttons (headset or the phone's volume keys): Android key codes, start lockout in seconds, and a vibration per press. */
export type TimingButtonPreferences = { enabled: boolean; startKey: number; splitKey: number; lockoutSeconds: number; vibrate: boolean };

export type VideoQuality = 'low' | 'medium' | 'high';

/**
 * Recording the individual stopwatch on video: quality, sound, the stopwatch drawn into the video, one button for recording
 * and time, how long the video keeps going after the clock stops, and whether "No molestar" goes on while it records (#1090).
 */
export type VideoRecordingPreferences = {
  quality: VideoQuality;
  audio: boolean;
  showStopwatch: boolean;
  startWithTime: boolean;
  stopAfterSeconds: number;
  doNotDisturb: boolean;
};

export type Preferences = {
  themeMode: ThemeMode;
  timePrecision: TimePrecision;
  timingButtons: TimingButtonPreferences;
  videoRecording: VideoRecordingPreferences;
  /** «Cronómetro avanzado» (rule 8): the family stopwatch marks free laps, with no cap and no automatic stop. Local to this phone, never synced. */
  freeLaps: boolean;
};

// Volume up (24) starts and stops, volume down (25) marks a split: the headset's "+" and "−", and the phone's own keys.
export const defaultTimingButtons: TimingButtonPreferences = { enabled: true, startKey: 24, splitKey: 25, lockoutSeconds: 3, vibrate: true };

// 720p plays well on most phones; a person picks 1080p in Ajustes when their phone can take it.
export const defaultVideoRecording: VideoRecordingPreferences = {
  quality: 'medium',
  audio: true,
  showStopwatch: true,
  startWithTime: false,
  stopAfterSeconds: 5,
  doNotDisturb: false,
};

export const defaultPreferences: Preferences = {
  themeMode: 'system',
  timePrecision: 'hundredths',
  timingButtons: defaultTimingButtons,
  videoRecording: defaultVideoRecording,
  freeLaps: false,
};

/** The start lockouts offered, in seconds. */
export const lockoutSeconds: readonly number[] = [0, 1, 2, 3, 5, 10];

export const videoQualities: readonly VideoQuality[] = ['low', 'medium', 'high'];
/** How long the video may keep recording after the clock stops, in seconds: 10 at most. */
export const videoStopAfterSeconds: readonly number[] = [0, 3, 5, 10];

export const themeModes: readonly ThemeMode[] = ['system', 'light', 'dark', 'sun'];
export const timePrecisions: readonly TimePrecision[] = ['hundredths', 'thousandths'];

export type PreferencesRepository = {
  load(): Promise<Preferences>;
  save(preferences: Preferences): Promise<void>;
};

// Unknown or missing values fall back to the default one by one, so a value saved by a newer version never breaks the app.
export function parsePreferences(raw: unknown): Preferences {
  const value = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const themeMode = themeModes.find((m) => m === value.themeMode) ?? defaultPreferences.themeMode;
  const timePrecision = timePrecisions.find((p) => p === value.timePrecision) ?? defaultPreferences.timePrecision;
  return {
    themeMode,
    timePrecision,
    timingButtons: parseTimingButtons(value.timingButtons),
    videoRecording: parseVideoRecording(value.videoRecording),
    freeLaps: typeof value.freeLaps === 'boolean' ? value.freeLaps : defaultPreferences.freeLaps,
  };
}

const isKeyCode = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1000;

function parseTimingButtons(raw: unknown): TimingButtonPreferences {
  const value = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = defaultTimingButtons;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : d.enabled,
    startKey: isKeyCode(value.startKey) ? value.startKey : d.startKey,
    splitKey: isKeyCode(value.splitKey) ? value.splitKey : d.splitKey,
    lockoutSeconds: lockoutSeconds.find((s) => s === value.lockoutSeconds) ?? d.lockoutSeconds,
    vibrate: typeof value.vibrate === 'boolean' ? value.vibrate : d.vibrate,
  };
}

function parseVideoRecording(raw: unknown): VideoRecordingPreferences {
  const value = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = defaultVideoRecording;
  return {
    quality: videoQualities.find((q) => q === value.quality) ?? d.quality,
    audio: typeof value.audio === 'boolean' ? value.audio : d.audio,
    showStopwatch: typeof value.showStopwatch === 'boolean' ? value.showStopwatch : d.showStopwatch,
    startWithTime: typeof value.startWithTime === 'boolean' ? value.startWithTime : d.startWithTime,
    stopAfterSeconds: videoStopAfterSeconds.find((s) => s === value.stopAfterSeconds) ?? d.stopAfterSeconds,
    doNotDisturb: typeof value.doNotDisturb === 'boolean' ? value.doNotDisturb : d.doNotDisturb,
  };
}

export function createInMemoryPreferencesRepository(initial: Preferences = defaultPreferences): PreferencesRepository {
  let stored = initial;
  return {
    async load() {
      return stored;
    },
    async save(next) {
      stored = next;
    },
  };
}

// SecureStore keys allow only letters, digits, ".", "-" and "_".
const PREFERENCES_KEY = 'trailskill-preferences';

// Per device, never synced: a person may want the sun palette on the pool phone and the system one at home.
export function createSecureStorePreferencesRepository(): PreferencesRepository {
  return {
    async load() {
      const raw = await SecureStore.getItemAsync(PREFERENCES_KEY);
      if (raw === null) return defaultPreferences;
      try {
        return parsePreferences(JSON.parse(raw));
      } catch {
        return defaultPreferences;
      }
    },
    async save(preferences) {
      await SecureStore.setItemAsync(PREFERENCES_KEY, JSON.stringify(preferences));
    },
  };
}
