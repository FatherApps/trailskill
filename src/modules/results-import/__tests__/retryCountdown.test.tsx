import { act, renderHook } from '@testing-library/react-native';

import { formatCountdown, useRetryCountdown } from '../retryCountdown';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000).toISOString();

describe('formatCountdown', () => {
  it.each([
    [0, '00:00'],
    [1000, '00:01'],
    [59_000, '00:59'],
    [61_000, '01:01'],
    [600_000, '10:00'],
    // A partial second still counts as a second left, so 00:00 only shows when it is really over.
    [1, '00:01'],
    [60_001, '01:01'],
    // The server may answer with an hour or more: minutes keep counting.
    [3_725_000, '62:05'],
  ])('shows %i ms as %s', (ms, text) => expect(formatCountdown(ms)).toBe(text));

  it.each([[-1], [-90_000], [Number.NaN]])('never shows a negative or unknown time (%p)', (ms) => expect(formatCountdown(ms)).toBe('00:00'));
});

describe('useRetryCountdown', () => {
  // The renderer keeps timers of its own, so the hook is judged by the intervals it starts and clears itself.
  let setIntervalSpy: jest.SpyInstance;
  let clearIntervalSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    setIntervalSpy = jest.spyOn(global, 'setInterval');
    clearIntervalSpy = jest.spyOn(global, 'clearInterval');
  });
  afterEach(() => jest.useRealTimers());

  it('counts down one second at a time and is ready at zero', async () => {
    const { result } = await renderHook(() => useRetryCountdown(at(3)));
    expect(result.current).toEqual({ text: '00:03', ready: false });
    await act(async () => jest.advanceTimersByTime(1000));
    expect(result.current).toEqual({ text: '00:02', ready: false });
    await act(async () => jest.advanceTimersByTime(2000));
    expect(result.current).toEqual({ text: '00:00', ready: true });
    await act(async () => jest.advanceTimersByTime(5000));
    expect(result.current).toEqual({ text: '00:00', ready: true });
  });

  it('stops its timer at zero', async () => {
    await renderHook(() => useRetryCountdown(at(2)));
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1000));
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('shows 00:00 and is ready for a time already past, never a negative number', async () => {
    const { result } = await renderHook(() => useRetryCountdown(at(-90)));
    expect(result.current).toEqual({ text: '00:00', ready: true });
  });

  it('is ready, with no timer, when the time cannot be read', async () => {
    const { result } = await renderHook(() => useRetryCountdown('not a date'));
    expect(result.current).toEqual({ text: '00:00', ready: true });
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('starts over with a new retry time', async () => {
    const { result, rerender } = await renderHook(({ retryAt }: { retryAt: string }) => useRetryCountdown(retryAt), { initialProps: { retryAt: at(1) } });
    await act(async () => jest.advanceTimersByTime(1000));
    expect(result.current.ready).toBe(true);
    await rerender({ retryAt: at(61) });
    expect(result.current).toEqual({ text: '01:00', ready: false });
    await act(async () => jest.advanceTimersByTime(1000));
    expect(result.current.text).toBe('00:59');
  });

  it('keeps no timer while nothing is being limited', async () => {
    const { result } = await renderHook(() => useRetryCountdown(null));
    expect(result.current.ready).toBe(true);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
