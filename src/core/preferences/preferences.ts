import * as SecureStore from 'expo-secure-store';

import type { ThemeMode } from '../theme';

export type { ThemeMode };
/** How many decimals a time shows where it was measured in milliseconds. Times stored in hundredths always show hundredths. */
export type TimePrecision = 'hundredths' | 'thousandths';

export type Preferences = { themeMode: ThemeMode; timePrecision: TimePrecision };

export const defaultPreferences: Preferences = { themeMode: 'system', timePrecision: 'hundredths' };

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
  return { themeMode, timePrecision };
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
