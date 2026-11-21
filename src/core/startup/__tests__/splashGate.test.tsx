import { renderHook } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';

import { __resetSplashGateForTests, markFirstScreenReady, SPLASH_CAP_MS, useFirstScreenReady, useSplashSafetyNet } from '../splashGate';
import { msSinceStart } from '../startupTiming';

jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn() }));
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
    await renderHook(() => useSplashSafetyNet(false));

    jest.advanceTimersByTime(SPLASH_CAP_MS - 1);
    expect(hideAsync).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('counts the cap from the start of the JavaScript, not from the layout mount', async () => {
    (msSinceStart as jest.Mock).mockReturnValue(SPLASH_CAP_MS - 500);
    await renderHook(() => useSplashSafetyNet(false));

    jest.advanceTimersByTime(500);

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides the splash on a font error', async () => {
    await renderHook(() => useSplashSafetyNet(true));

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides the splash once however many signals arrive', async () => {
    await renderHook(() => useSplashSafetyNet(true));
    await renderHook(() => useFirstScreenReady());
    markFirstScreenReady();
    jest.advanceTimersByTime(SPLASH_CAP_MS);

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('does not fire the cap after the layout is gone', async () => {
    const { unmount } = await renderHook(() => useSplashSafetyNet(false));
    await unmount();

    jest.advanceTimersByTime(SPLASH_CAP_MS);

    expect(hideAsync).not.toHaveBeenCalled();
  });
});
