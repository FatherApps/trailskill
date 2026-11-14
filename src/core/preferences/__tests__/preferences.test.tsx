import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  createInMemoryPreferencesRepository,
  defaultPreferences,
  defaultTimingButtons,
  parsePreferences,
  PreferencesProvider,
  usePreferences,
  type PreferencesRepository,
} from '..';

describe('parsePreferences', () => {
  it('keeps known values', () => {
    expect(parsePreferences({ themeMode: 'sun', timePrecision: 'thousandths' })).toEqual({
      themeMode: 'sun',
      timePrecision: 'thousandths',
      timingButtons: defaultTimingButtons,
    });
  });

  it('keeps valid timing button settings and replaces invalid ones', () => {
    const saved = { enabled: false, startKey: 79, splitKey: 25, lockoutSeconds: 5, vibrate: false };
    expect(parsePreferences({ timingButtons: saved }).timingButtons).toEqual(saved);
    expect(parsePreferences({ timingButtons: { enabled: 'yes', startKey: -1, splitKey: 2.5, lockoutSeconds: 4, vibrate: null } }).timingButtons).toEqual(
      defaultTimingButtons,
    );
  });

  it('falls back to the default one value at a time', () => {
    expect(parsePreferences({ themeMode: 'neon', timePrecision: 'thousandths' })).toEqual({ ...defaultPreferences, timePrecision: 'thousandths' });
    expect(parsePreferences(null)).toEqual(defaultPreferences);
    expect(parsePreferences('sun')).toEqual(defaultPreferences);
  });
});

describe('PreferencesProvider', () => {
  function wrapperFor(repository: PreferencesRepository) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <PreferencesProvider repository={repository}>{children}</PreferencesProvider>;
    };
  }

  it('starts with the defaults and then shows what the device saved', async () => {
    const repository = createInMemoryPreferencesRepository({ ...defaultPreferences, themeMode: 'dark', timePrecision: 'thousandths' });
    const { result } = await renderHook(() => usePreferences(), { wrapper: wrapperFor(repository) });

    expect(result.current.preferences).toEqual({ ...defaultPreferences, themeMode: 'dark', timePrecision: 'thousandths' });
  });

  it('applies a change at once and saves it', async () => {
    const repository = createInMemoryPreferencesRepository();
    const { result } = await renderHook(() => usePreferences(), { wrapper: wrapperFor(repository) });

    await act(async () => result.current.update({ themeMode: 'sun' }));

    expect(result.current.preferences).toEqual({ ...defaultPreferences, themeMode: 'sun' });
    expect(await repository.load()).toEqual({ ...defaultPreferences, themeMode: 'sun' });
  });

  it('keeps the change for this run when saving fails', async () => {
    const repository: PreferencesRepository = { load: async () => defaultPreferences, save: () => Promise.reject(new Error('full')) };
    const { result } = await renderHook(() => usePreferences(), { wrapper: wrapperFor(repository) });

    await act(async () => result.current.update({ timePrecision: 'thousandths' }));

    expect(result.current.preferences.timePrecision).toBe('thousandths');
  });
});
