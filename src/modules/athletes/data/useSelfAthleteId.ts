import { useEffect, useState } from 'react';

import type { ManagedAthleteRepository } from '../../accounts';

// The id of the athlete the user is themselves (an adult who swims), or null. `undefined` until it is read and when the read fails: the cards then just carry no "tú" label.
// The answer is stored with the user who asked, so another user never inherits it. Changing `refreshKey` reads again.
export function useSelfAthleteId(managed: ManagedAthleteRepository, userId: string | undefined, refreshKey?: unknown): string | null | undefined {
  const [answer, setAnswer] = useState<{ userId: string; athleteId: string | null }>();
  useEffect(() => {
    if (!userId) return;
    let active = true;
    managed.getSelfAthleteId(userId).then(
      (athleteId) => active && setAnswer({ userId, athleteId }),
      (error: unknown) => {
        if (__DEV__) console.warn('[athletes] Self athlete lookup failed', error);
      },
    );
    return () => {
      active = false;
    };
  }, [managed, userId, refreshKey]);
  return answer?.userId === userId ? answer?.athleteId : undefined;
}
