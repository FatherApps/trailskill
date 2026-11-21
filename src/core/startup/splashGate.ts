import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { msSinceStart } from './startupTiming';

/** The longest the logo stays up from the start of the JavaScript: past it the app shows whatever it has, never trapped on the splash. */
export const SPLASH_CAP_MS = 3000;

let hidden = false;

/** Hides the native splash, once, whoever asks first (a screen, the cap or a font error). Never waits for the network. */
export function markFirstScreenReady(): void {
  if (hidden) return;
  hidden = true;
  SplashScreen.hideAsync();
}

/** Tests only: the gate remembers it hid the splash for the whole run. */
export function __resetSplashGateForTests(): void {
  hidden = false;
}

/** Marks the moment a screen can paint with local data, once. Pass the same condition the screen's startup mark uses. */
export function useFirstScreenReady(when = true): void {
  useEffect(() => {
    if (when) markFirstScreenReady();
  }, [when]);
}

/** Root layout only: hides the splash on a font error, and at the cap when no screen has marked ready by then. */
export function useSplashSafetyNet(fontError: boolean): void {
  useEffect(() => {
    if (fontError) markFirstScreenReady();
  }, [fontError]);
  useEffect(() => {
    const timer = setTimeout(markFirstScreenReady, Math.max(0, SPLASH_CAP_MS - msSinceStart()));
    return () => clearTimeout(timer);
  }, []);
}
