import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  createInMemoryPreferencesRepository,
  defaultPreferences,
  defaultTimingButtons,
  defaultVideoRecording,
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
      videoRecording: defaultVideoRecording,
      freeLaps: false,
    });
  });

  it('keeps freeLaps and turns a missing or non-boolean value back into false', () => {
    expect(parsePreferences({ freeLaps: true }).freeLaps).toBe(true);
    expect(parsePreferences({ themeMode: 'sun' }).freeLaps).toBe(false);
    for (const bad of ['true', 1, null, {}]) expect(parsePreferences({ freeLaps: bad }).freeLaps).toBe(false);
  });

  it('keeps valid video recording settings and replaces invalid ones', () => {
    const saved = { quality: 'high', audio: false, showStopwatch: false, startWithTime: true, stopAfterSeconds: 10, doNotDisturb: true };
    expect(parsePreferences({ videoRecording: saved }).videoRecording).toEqual(saved);
    expect(parsePreferences({ videoRecording: { quality: '4k', audio: 1, showStopwatch: 'yes', startWithTime: 'no', stopAfterSeconds: 30 } }).videoRecording).toEqual(
      defaultVideoRecording,
    );
  });

  it('loads preferences saved before video recording existed with its defaults', () => {
    const saved = { themeMode: 'dark', timePrecision: 'thousandths', timingButtons: { ...defaultTimingButtons, vibrate: false } };
    expect(parsePreferences(saved)).toEqual({ ...saved, videoRecording: defaultVideoRecording, freeLaps: false });
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
