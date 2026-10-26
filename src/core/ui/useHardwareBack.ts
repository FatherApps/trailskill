import { useEffect } from 'react';
import { BackHandler } from 'react-native';

// The Android back button runs `onBack` instead of leaving. Pass `undefined` to leave it alone. BackHandler stays in here: it is an Android-only API.
export function useHardwareBack(onBack: (() => void) | undefined): void {
  useEffect(() => {
    if (!onBack) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);
}
