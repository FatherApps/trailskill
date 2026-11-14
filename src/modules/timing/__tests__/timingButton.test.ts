import {
  buttonAction,
  capturedKeys,
  debounce,
  defaultButtonConfig,
  DEBOUNCE_NANOS,
  KEY_VOLUME_DOWN,
  KEY_VOLUME_UP,
  nanosFromSeconds,
} from '../domain/timingButton';

const ms = (n: number) => BigInt(n) * 1_000_000n;
const config = defaultButtonConfig;

describe('buttonAction', () => {
  it('starts with the start key and splits nothing before the start', () => {
    expect(buttonAction({ keyCode: KEY_VOLUME_UP, at: 0n }, config, { status: 'idle' })).toBe('start');
    expect(buttonAction({ keyCode: KEY_VOLUME_DOWN, at: 0n }, config, { status: 'idle' })).toBeNull();
  });

  it('ignores the start key during the lockout, then stops', () => {
    const running = { status: 'running' as const, startedAt: ms(1000) };
    expect(buttonAction({ keyCode: KEY_VOLUME_UP, at: ms(1400) }, config, running)).toBeNull();
    expect(buttonAction({ keyCode: KEY_VOLUME_UP, at: ms(3999) }, config, running)).toBeNull();
    expect(buttonAction({ keyCode: KEY_VOLUME_UP, at: ms(4000) }, config, running)).toBe('stop');
  });

  it('marks splits at any time while running, the lockout included', () => {
    expect(buttonAction({ keyCode: KEY_VOLUME_DOWN, at: ms(1100) }, config, { status: 'running', startedAt: ms(1000) })).toBe('split');
  });

  it('does nothing once stopped, and with keys it does not know', () => {
    expect(buttonAction({ keyCode: KEY_VOLUME_UP, at: ms(9000) }, config, { status: 'stopped' })).toBeNull();
    expect(buttonAction({ keyCode: 164, at: ms(9000) }, config, { status: 'running', startedAt: 0n })).toBeNull();
  });

  it('with no lockout, stops at the next press', () => {
    const noLockout = { ...config, lockoutNanos: 0n };
    expect(buttonAction({ keyCode: KEY_VOLUME_UP, at: ms(1) }, noLockout, { status: 'running', startedAt: 0n })).toBe('stop');
  });

  it('with one key for both, that key only starts and stops', () => {
    const oneKey = { ...config, splitKey: KEY_VOLUME_UP };
    expect(buttonAction({ keyCode: KEY_VOLUME_UP, at: ms(5000) }, oneKey, { status: 'running', startedAt: 0n })).toBe('stop');
    expect(capturedKeys(oneKey)).toEqual([KEY_VOLUME_UP]);
  });
});

describe('debounce', () => {
  it('drops a second press of the same key within 250 ms', () => {
    const first = debounce({}, { keyCode: KEY_VOLUME_UP, at: ms(1000) });
    expect(first.accepted).toBe(true);
    expect(debounce(first.last, { keyCode: KEY_VOLUME_UP, at: ms(1000) + DEBOUNCE_NANOS - 1n }).accepted).toBe(false);
    expect(debounce(first.last, { keyCode: KEY_VOLUME_UP, at: ms(1000) + DEBOUNCE_NANOS }).accepted).toBe(true);
  });

  it('keeps each key apart', () => {
    const first = debounce({}, { keyCode: KEY_VOLUME_UP, at: ms(1000) });
    expect(debounce(first.last, { keyCode: KEY_VOLUME_DOWN, at: ms(1010) }).accepted).toBe(true);
  });
});

it('turns seconds into nanoseconds', () => {
  expect(nanosFromSeconds(3)).toBe(3_000_000_000n);
  expect(nanosFromSeconds(0)).toBe(0n);
});
