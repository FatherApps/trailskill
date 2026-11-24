import { useLayoutEffect, useState } from 'react';

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
  const [now, setNow] = useState(() => Date.now());
  const remaining = target - now;
  const ready = !(remaining > 0);

  // Layout effect: a new target reads the clock before the first paint, so a stale `now` is never drawn.
  useLayoutEffect(() => {
    if (Number.isNaN(target)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the state with the clock when the target changes, before paint
    setNow(Date.now());
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= target) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return { text: formatCountdown(remaining), ready };
}
