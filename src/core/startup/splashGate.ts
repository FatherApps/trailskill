import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { markStartup, msSinceStart } from './startupTiming';

/** The longest the logo stays up from the start of the JavaScript: past it the app shows whatever it has, never trapped on the splash. */
export const SPLASH_CAP_MS = 3000;

let hidden = false;
let capTimer: ReturnType<typeof setTimeout> | undefined;

/** Hides the native splash, once, whoever asks first (a screen, the cap or a font error). Never waits for the network. */
export function markFirstScreenReady(): void {
  if (hidden) return;
  hidden = true;
  clearTimeout(capTimer);
  markStartup('splash_hidden');
  // A failed hide must not surface as an unhandled rejection: the screen is already there.
  SplashScreen.hideAsync().catch(() => {});
}

/** Tests only: the gate remembers it hid the splash for the whole run. */
export function __resetSplashGateForTests(): void {
  hidden = false;
  clearTimeout(capTimer);
  capTimer = undefined;
}

/** Root module scope, next to `preventAutoHideAsync`: the cap runs whether or not any component is mounted. */
export function startSplashCap(): void {
  if (hidden || capTimer !== undefined) return;
  capTimer = setTimeout(markFirstScreenReady, Math.max(0, SPLASH_CAP_MS - msSinceStart()));
}

/** Marks the moment a screen can paint with local data, once. Pass the same condition the screen's startup mark uses. */
export function useFirstScreenReady(when = true): void {
  useEffect(() => {
    if (when) markFirstScreenReady();
  }, [when]);
}

/** Root layout only: a font error hides the splash, and the app falls back to the system font. */
export function useSplashFontError(fontError: boolean): void {
  useEffect(() => {
    if (fontError) markFirstScreenReady();
  }, [fontError]);
}
