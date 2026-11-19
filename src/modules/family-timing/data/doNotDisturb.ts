import { requireOptionalNativeModule } from 'expo-modules-core';

// "No molestar" while the individual stopwatch records (#1090). The Android adapter is the local module in
// modules/do-not-disturb; without it (iOS, tests, an old build) the port does nothing and says it is not available.
export type DoNotDisturbPort = {
  available: boolean;
  /** Whether the person gave the app access to "No molestar" in Android's settings. */
  hasAccess(): boolean;
  /** Opens the screen of Android's settings where that access is given. */
  openAccessSettings(): void;
  /** Saves the phone's mode and turns "No molestar" on; false without access. */
  turnOn(): boolean;
  /** Puts the saved mode back; nothing when the app did not change it. */
  restore(): void;
};

type NativeDoNotDisturb = { hasAccess(): boolean; openAccessSettings(): void; turnOn(): boolean; restore(): void };

const unavailable: DoNotDisturbPort = {
  available: false,
  hasAccess: () => false,
  openAccessSettings: () => undefined,
  turnOn: () => false,
  restore: () => undefined,
};

const native = requireOptionalNativeModule<NativeDoNotDisturb>('DoNotDisturb');

/** The phone's "No molestar". */
export const doNotDisturb: DoNotDisturbPort = native
  ? {
      available: true,
      hasAccess: () => native.hasAccess(),
      openAccessSettings: () => native.openAccessSettings(),
      turnOn: () => native.turnOn(),
      restore: () => native.restore(),
    }
  : unavailable;

/** A port the tests drive: `access` says whether the access was given, `on` whether the app turned "No molestar" on. */
export function createFakeDoNotDisturb(access = true) {
  const fake = {
    available: true,
    access,
    on: false,
    turnedOn: 0,
    restored: 0,
    opened: 0,
    hasAccess: () => fake.access,
    openAccessSettings: () => {
      fake.opened += 1;
    },
    turnOn: () => {
      if (!fake.access) return false;
      fake.on = true;
      fake.turnedOn += 1;
      return true;
    },
    restore: () => {
      if (fake.on) fake.restored += 1;
      fake.on = false;
    },
  };
  return fake;
}
