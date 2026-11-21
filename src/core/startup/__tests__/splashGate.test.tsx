import { renderHook } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';

import { __resetSplashGateForTests, markFirstScreenReady, SPLASH_CAP_MS, startSplashCap, useFirstScreenReady, useSplashFontError } from '../splashGate';
import { msSinceStart } from '../startupTiming';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('../startupTiming', () => ({ msSinceStart: jest.fn(), markStartup: jest.fn() }));

const hideAsync = SplashScreen.hideAsync as jest.Mock;

describe('splash gate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    hideAsync.mockClear();
    (msSinceStart as jest.Mock).mockReturnValue(0);
    __resetSplashGateForTests();
  });
  afterEach(() => jest.useRealTimers());

  it('keeps the splash until a screen marks the first screen ready', async () => {
    const { rerender } = await renderHook(({ when }: { when: boolean }) => useFirstScreenReady(when), { initialProps: { when: false } });
    expect(hideAsync).not.toHaveBeenCalled();

    await rerender({ when: true });

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides the splash at the cap when no screen ever marks ready', async () => {
    startSplashCap();

    jest.advanceTimersByTime(SPLASH_CAP_MS - 1);
    expect(hideAsync).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('counts the cap from the start of the JavaScript, not from the layout mount', async () => {
    (msSinceStart as jest.Mock).mockReturnValue(SPLASH_CAP_MS - 500);
    startSplashCap();

    jest.advanceTimersByTime(500);

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides the splash on a font error', async () => {
    await renderHook(() => useSplashFontError(true));

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides the splash once however many signals arrive', async () => {
    startSplashCap();
    await renderHook(() => useSplashFontError(true));
    await renderHook(() => useFirstScreenReady());
    markFirstScreenReady();
    jest.advanceTimersByTime(SPLASH_CAP_MS);

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('runs the cap with no component mounted', () => {
    startSplashCap();
    startSplashCap();

    jest.advanceTimersByTime(SPLASH_CAP_MS);

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('drops the cap timer once the splash is hidden', () => {
    startSplashCap();
    markFirstScreenReady();

    expect(jest.getTimerCount()).toBe(0);
  });

  it('survives a failed hide without an unhandled rejection', async () => {
    hideAsync.mockReturnValueOnce(Promise.reject(new Error('native')));

    expect(() => markFirstScreenReady()).not.toThrow();
    await Promise.resolve();
  });
});
