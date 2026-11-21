import { renderHook } from '@testing-library/react-native';

import { markStartup, useStartupMark } from '../startupTiming';

describe('startup timing', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => log.mockRestore());

  it('logs the name of a moment and the time, once, and nothing else', () => {
    markStartup('shell_mounted');
    markStartup('shell_mounted');

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]).toHaveLength(1);
    expect(log.mock.calls[0][0]).toMatch(/^\[startup\] shell_mounted \+\d+ms$/);
  });

  it('logs nothing outside development', () => {
    const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      markStartup('home_painted');
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    }

    expect(log).not.toHaveBeenCalled();
  });

  it('marks a screen only once its condition holds', async () => {
    const { rerender } = await renderHook(({ when }: { when: boolean }) => useStartupMark('athletes_painted', when), { initialProps: { when: false } });
    expect(log).not.toHaveBeenCalled();

    await rerender({ when: true });

    expect(log).toHaveBeenCalledTimes(1);
  });
});
