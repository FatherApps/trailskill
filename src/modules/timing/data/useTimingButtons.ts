import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { TimingButtonPreferences } from '../../../core/preferences';
import {
  buttonAction,
  capturedKeys,
  debounce,
  nanosFromSeconds,
  type ButtonAction,
  type ButtonConfig,
  type ButtonPress,
  type ButtonTarget,
  type Debounce,
} from '../domain/timingButton';
import { timingButton, type ExternalKeyboard, type TimingButtonPort } from './timingButton';

export type UseTimingButtonsOptions = {
  /** Off: the keys stay with the system (the volume changes as always). */
  enabled: boolean;
  config: ButtonConfig;
  /** Read at each press, so a press always acts on the stopwatch as it is now. */
  target: () => ButtonTarget;
  onAction: (action: ButtonAction, at: bigint) => void;
  /** What a press does; by default the stopwatch's start, split and stop. */
  decide?: (press: ButtonPress, config: ButtonConfig, target: ButtonTarget) => ButtonAction | null;
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
export function useTimingButtons({ enabled, config, target, onAction, vibrate, decide = buttonAction, port = timingButton }: UseTimingButtonsOptions) {
  const latest = useRef({ target, onAction, vibrate, decide });
  useEffect(() => {
    latest.current = { target, onAction, vibrate, decide };
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
      const action = latest.current.decide(press, current, latest.current.target());
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

/** The person's timing-button settings, ready for useTimingButtons. */
export function buttonSettingsOf(prefs: TimingButtonPreferences) {
  return {
    enabled: prefs.enabled,
    vibrate: prefs.vibrate,
    config: { startKey: prefs.startKey, splitKey: prefs.splitKey, lockoutNanos: nanosFromSeconds(prefs.lockoutSeconds) } as ButtonConfig,
  };
}

/**
 * True when an external keyboard was connected while `watching` and none is now: the pulsador went away mid-session.
 * The phone's own volume keys never count, so with them there is never a warning. `dismiss` hides it until the next one.
 */
export function useButtonDisconnect(watching: boolean, keyboards: ExternalKeyboard[]) {
  const [seen, setSeen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const connected = keyboards.length > 0;
  // Adjusted while rendering, the way React derives state from what changed.
  if (!watching && (seen || dismissed)) {
    setSeen(false);
    setDismissed(false);
  } else if (watching && connected && (!seen || dismissed)) {
    setSeen(true);
    setDismissed(false);
  }
  return { disconnected: watching && seen && !connected && !dismissed, dismiss: () => setDismissed(true) };
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
