import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

// The Android back button runs `onBack` instead of leaving. Pass `undefined` to leave it alone. BackHandler stays in here: it is an Android-only API.
// Subscribes once while a callback exists and calls the latest one, so an inline callback never re-subscribes or moves this screen above a child that subscribed later (BackHandler runs the newest subscription first).
export function useHardwareBack(onBack: (() => void) | undefined): void {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  const active = onBack !== undefined;
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      latest.current?.();
      return true;
    });
    return () => subscription.remove();
  }, [active]);
}
