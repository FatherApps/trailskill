import { requireOptionalNativeModule } from 'expo-modules-core';

// The port to the timing buttons (issue #77): the inline buttons of a USB headset, or the phone's volume keys.
// The Android adapter is the local module in modules/timing-button; without it (iOS, tests, an old build) the port
// reports itself unavailable and the screen buttons keep working alone.

export type NativeKeyPress = { keyCode: number; at: bigint; external: boolean; device: string | null };
export type ExternalKeyboard = { id: number; name: string };

export type TimingButtonPort = {
  readonly available: boolean;
  /** The clock of every mark while the port is available, screen touches included: one time base for all of them. */
  now(): bigint;
  /** Takes these keys from the system and reports their presses until stop(). */
  capture(keyCodes: number[]): void;
  /** Reports the next key pressed, whatever it is, then gives the keys back. */
  learn(): void;
  stop(): void;
  keyboards(): ExternalKeyboard[];
  onKey(listener: (press: NativeKeyPress) => void): () => void;
  onKeyboardsChanged(listener: (keyboards: ExternalKeyboard[]) => void): () => void;
};

type Subscription = { remove(): void };
type NativeTimingButton = {
  now(): string;
  capture(keyCodes: number[]): void;
  learn(): void;
  stop(): void;
  keyboards(): ExternalKeyboard[];
  addListener(event: 'onKey', listener: (event: { keyCode: number; at: string; external: boolean; device: string | null }) => void): Subscription;
  addListener(event: 'onDevicesChanged', listener: (event: { keyboards: ExternalKeyboard[] }) => void): Subscription;
};

/** The screen's clock when there is no native module, in nanoseconds. */
export const screenClock = () => BigInt(Math.round(performance.now() * 1e6));

export const unavailableTimingButton: TimingButtonPort = {
  available: false,
  now: screenClock,
  capture: () => {},
  learn: () => {},
  stop: () => {},
  keyboards: () => [],
  onKey: () => () => {},
  onKeyboardsChanged: () => () => {},
};

function nativeTimingButton(native: NativeTimingButton): TimingButtonPort {
  return {
    available: true,
    now: () => BigInt(native.now()),
    capture: (keyCodes) => native.capture(keyCodes),
    learn: () => native.learn(),
    stop: () => native.stop(),
    keyboards: () => native.keyboards(),
    onKey(listener) {
      const subscription = native.addListener('onKey', (event) =>
        listener({ keyCode: event.keyCode, at: BigInt(event.at), external: event.external, device: event.device }),
      );
      return () => subscription.remove();
    },
    onKeyboardsChanged(listener) {
      const subscription = native.addListener('onDevicesChanged', (event) => listener(event.keyboards));
      return () => subscription.remove();
    },
  };
}

const native = requireOptionalNativeModule<NativeTimingButton>('TimingButton');

/** The device's timing buttons. */
export const timingButton: TimingButtonPort = native ? nativeTimingButton(native) : unavailableTimingButton;

/** A port the tests drive by hand: press() reports a key as the native module would. */
export function createFakeTimingButton(start = 0n) {
  let clock = start;
  let mode: 'off' | 'capture' | 'learn' = 'off';
  let keys = new Set<number>();
  let keyboards: ExternalKeyboard[] = [];
  const keyListeners = new Set<(press: NativeKeyPress) => void>();
  const keyboardListeners = new Set<(keyboards: ExternalKeyboard[]) => void>();
  const port: TimingButtonPort = {
    available: true,
    now: () => clock,
    capture(keyCodes) {
      keys = new Set(keyCodes);
      mode = 'capture';
    },
    learn() {
      mode = 'learn';
    },
    stop() {
      mode = 'off';
    },
    keyboards: () => keyboards,
    onKey(listener) {
      keyListeners.add(listener);
      return () => keyListeners.delete(listener);
    },
    onKeyboardsChanged(listener) {
      keyboardListeners.add(listener);
      return () => keyboardListeners.delete(listener);
    },
  };
  return {
    port,
    advance(nanos: bigint) {
      clock += nanos;
    },
    /** True when the key was taken from the system. */
    press(keyCode: number, external = true): boolean {
      const taken = mode === 'learn' || (mode === 'capture' && keys.has(keyCode));
      if (!taken) return false;
      if (mode === 'learn') mode = 'off';
      for (const listener of keyListeners) listener({ keyCode, at: clock, external, device: external ? 'Headset' : null });
      return true;
    },
    connect(next: ExternalKeyboard[]) {
      keyboards = next;
      for (const listener of keyboardListeners) listener(next);
    },
    get mode() {
      return mode;
    },
    get keys() {
      return [...keys];
    },
  };
}
