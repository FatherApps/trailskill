import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import { buttonAction, capturedKeys, debounce, type ButtonAction, type ButtonConfig, type ButtonTarget, type Debounce } from '../domain/timingButton';
import { timingButton, type ExternalKeyboard, type TimingButtonPort } from './timingButton';

export type UseTimingButtonsOptions = {
  /** Off: the keys stay with the system (the volume changes as always). */
  enabled: boolean;
  config: ButtonConfig;
  /** Read at each press, so a press always acts on the stopwatch as it is now. */
  target: () => ButtonTarget;
  onAction: (action: ButtonAction, at: bigint) => void;
  /** A short vibration for every press that did something. */
  vibrate: boolean;
  port?: TimingButtonPort;
};

/** The external keyboards connected right now, kept up to date. */
export function useExternalKeyboards(port: TimingButtonPort = timingButton): ExternalKeyboard[] {
  const [keyboards, setKeyboards] = useState<ExternalKeyboard[]>(() => (port.available ? port.keyboards() : []));
  useEffect(() => port.onKeyboardsChanged(setKeyboards), [port]);
  return keyboards;
}

// Takes the timing keys while the screen that uses them is shown, and gives them back when it closes.
export function useTimingButtons({ enabled, config, target, onAction, vibrate, port = timingButton }: UseTimingButtonsOptions) {
  const latest = useRef({ target, onAction, vibrate });
  useEffect(() => {
    latest.current = { target, onAction, vibrate };
  });
  const { startKey, splitKey, lockoutNanos } = config;
  const active = enabled && port.available;

  useEffect(() => {
    if (!active) return;
    const current: ButtonConfig = { startKey, splitKey, lockoutNanos };
    port.capture(capturedKeys(current));
    let last: Debounce = {};
    const unsubscribe = port.onKey(({ keyCode, at }) => {
      const press = { keyCode, at };
      const filtered = debounce(last, press);
      last = filtered.last;
      if (!filtered.accepted) return;
      const action = buttonAction(press, current, latest.current.target());
      if (!action) return;
      latest.current.onAction(action, at);
      if (latest.current.vibrate) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    });
    return () => {
      unsubscribe();
      port.stop();
    };
  }, [active, port, startKey, splitKey, lockoutNanos]);

  return { active, keyboards: useExternalKeyboards(port) };
}

/** Waits for the next key press, to choose a timing key in Ajustes. */
export function useLearnKey(port: TimingButtonPort = timingButton) {
  const [learning, setLearning] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    pending.current?.();
    pending.current = null;
    port.stop();
    setLearning(false);
  }, [port]);

  const learn = useCallback(
    (onKey: (keyCode: number) => void) => {
      if (!port.available) return;
      pending.current?.();
      const unsubscribe = port.onKey(({ keyCode }) => {
        unsubscribe();
        pending.current = null;
        setLearning(false);
        onKey(keyCode);
      });
      pending.current = unsubscribe;
      setLearning(true);
      port.learn();
    },
    [port],
  );

  useEffect(() => () => pending.current?.(), []);
  return { available: port.available, learning, learn, cancel };
}
