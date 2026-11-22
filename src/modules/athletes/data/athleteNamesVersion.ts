import { useSyncExternalStore } from 'react';

// A rename is written to the local database, which the screens that list or title a swimmer read once (not live): this counter,
// part of their refresh key, makes them read it again right after a save, without waiting for the next sync.
let version = 0;
const listeners = new Set<() => void>();

export function bumpAthleteNamesVersion(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function useAthleteNamesVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => version,
  );
}
