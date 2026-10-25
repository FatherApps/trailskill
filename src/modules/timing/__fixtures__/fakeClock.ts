import { useEffect, useState } from 'react';

import type { Hundredths } from '../../../core/time';

const TICK_MS = 50;

// Stands in for the real clock (tasks 3.2 and 3.4a) so the gallery can animate the stopwatch.
// Only the gallery imports it: screens and components draw whatever `elapsedHundredths` they receive.
export function useFakeClock(running: boolean, startAt: Hundredths = 0): Hundredths {
  const [elapsed, setElapsed] = useState(startAt);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setElapsed((current) => current + TICK_MS / 10), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  return elapsed;
}
