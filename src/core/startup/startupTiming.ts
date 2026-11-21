import { useEffect } from 'react';

// Origin of every time below: the moment this file is first imported, which the root layout does as the app's JavaScript starts.
const origin = Date.now();
const marked = new Set<string>();

/** Milliseconds since the JavaScript started. */
export function msSinceStart(): number {
  return Date.now() - origin;
}

/** The moments of a start that are logged, fixed here so a log line never carries anything but its name and a time. */
export type StartupMark = 'js_loaded' | 'layout_mounted' | 'deletion_gate_done' | 'profile_gate_done' | 'shell_mounted' | 'home_painted' | 'athletes_painted' | 'my_swimmers_painted' | 'splash_hidden';

/**
 * Development only (issue 1311): logs once per run how long after the JavaScript started a moment of the start was reached, to
 * measure how long the first useful screen takes. Writes the name and the time and nothing else: no ids, emails, names or paths.
 */
export function markStartup(mark: StartupMark): void {
  if (!__DEV__ || marked.has(mark)) return;
  marked.add(mark);
  console.log(`[startup] ${mark} +${Date.now() - origin}ms`);
}

/** Marks the moment a screen reaches `when`, once. */
export function useStartupMark(mark: StartupMark, when = true): void {
  useEffect(() => {
    if (when) markStartup(mark);
  }, [mark, when]);
}
