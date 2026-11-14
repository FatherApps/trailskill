import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  createInMemoryPreferencesRepository,
  defaultPreferences,
  parsePreferences,
  PreferencesProvider,
  usePreferences,
  type PreferencesRepository,
} from '..';

describe('parsePreferences', () => {
  it('keeps known values', () => {
    expect(parsePreferences({ themeMode: 'sun', timePrecision: 'thousandths' })).toEqual({ themeMode: 'sun', timePrecision: 'thousandths' });
  });

  it('falls back to the default one value at a time', () => {
    expect(parsePreferences({ themeMode: 'neon', timePrecision: 'thousandths' })).toEqual({ themeMode: 'system', timePrecision: 'thousandths' });
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
    const repository = createInMemoryPreferencesRepository({ themeMode: 'dark', timePrecision: 'thousandths' });
    const { result } = await renderHook(() => usePreferences(), { wrapper: wrapperFor(repository) });

    expect(result.current.preferences).toEqual({ themeMode: 'dark', timePrecision: 'thousandths' });
  });

  it('applies a change at once and saves it', async () => {
    const repository = createInMemoryPreferencesRepository();
    const { result } = await renderHook(() => usePreferences(), { wrapper: wrapperFor(repository) });

    await act(async () => result.current.update({ themeMode: 'sun' }));

    expect(result.current.preferences).toEqual({ themeMode: 'sun', timePrecision: 'hundredths' });
    expect(await repository.load()).toEqual({ themeMode: 'sun', timePrecision: 'hundredths' });
  });

  it('keeps the change for this run when saving fails', async () => {
    const repository: PreferencesRepository = { load: async () => defaultPreferences, save: () => Promise.reject(new Error('full')) };
    const { result } = await renderHook(() => usePreferences(), { wrapper: wrapperFor(repository) });

    await act(async () => result.current.update({ timePrecision: 'thousandths' }));

    expect(result.current.preferences.timePrecision).toBe('thousandths');
  });
});
