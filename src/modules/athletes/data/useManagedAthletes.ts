import { useEffect, useState } from 'react';

import type { ManagedAthleteRepository } from '../../accounts';
import type { SchoolAthlete, SchoolAthleteRepository } from './schoolAthletes';

export type ManagedAthletesResult = { status: 'loading' } | { status: 'ready'; athletes: SchoolAthlete[] };

// The athletes a guardian (or an adult athlete) manages. A failed lookup shows nobody: the backend decides who sees what.
// The answer is stored with the user who asked, so another user never inherits it. Changing `refreshKey` looks again.
export function useManagedAthletes(
  managed: ManagedAthleteRepository,
  athletes: SchoolAthleteRepository,
  userId: string | undefined,
  refreshKey?: unknown,
): ManagedAthletesResult {
  const [answer, setAnswer] = useState<{ userId: string; athletes: SchoolAthlete[] }>();
  useEffect(() => {
    let active = true;
    if (userId) {
      managed
        .listManagedAthleteIds(userId)
        .then((ids) => athletes.listByIds(ids))
        .catch(() => [])
        .then((found) => active && setAnswer({ userId, athletes: found }));
    }
    return () => {
      active = false;
    };
  }, [managed, athletes, userId, refreshKey]);
  if (!userId) return { status: 'ready', athletes: [] };
  return answer?.userId === userId ? { status: 'ready', athletes: answer.athletes } : { status: 'loading' };
}
