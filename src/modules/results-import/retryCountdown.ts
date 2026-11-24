import { useEffect, useReducer } from 'react';

const pad = (value: number) => String(value).padStart(2, '0');

/** "mm:ss" for the time left; a partial second counts as a second, and nothing is ever negative. Minutes keep counting past 59. */
export function formatCountdown(ms: number): string {
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/**
 * Counts down to the `retryAt` the server answered with, once a second; the server stays the authority.
 * `ready` is true at zero (or for a time already past or unreadable) and the timer stops there. Pass null while nothing is limited.
 */
export function useRetryCountdown(retryAt: string | null): { text: string; ready: boolean } {
  const target = retryAt === null ? Number.NaN : Date.parse(retryAt);
  const [, tick] = useReducer((count: number) => count + 1, 0);
  const remaining = target - Date.now();
  const ready = !(remaining > 0);

  useEffect(() => {
    if (Number.isNaN(target)) return;
    const timer = setInterval(() => {
      tick();
      if (Date.now() >= target) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return { text: formatCountdown(remaining), ready };
}
