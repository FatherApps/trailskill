import { useSyncExternalStore } from 'react';

// Whether "Mis tiempos" shows its list, so the phone bar can show there and hide while a time is measured, edited or sent:
// leaving then would lose what is on screen. Without the screen open it is true, so it never hides the bar elsewhere.
let atList = true;
const listeners = new Set<() => void>();

export function setFamilyTimingAtList(next: boolean) {
  if (next === atList) return;
  atList = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while "Mis tiempos" is on its list (or not open). */
export function useFamilyTimingAtList(): boolean {
  return useSyncExternalStore(subscribe, () => atList);
}
