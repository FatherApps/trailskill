import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

const KEEP_AWAKE_TAG = 'timing';

// The screen must not go dark mid-timing: it stays awake while `active` and is released when that ends or the screen is left.
export function useAwakeWhile(active: boolean) {
  useEffect(() => {
    if (!active) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [active]);
}
