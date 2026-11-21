import { useEffect, useState } from 'react';

import type { ConflictReviewRepository } from './conflictReview';
import type { KnownPlatformAdminRepository } from './knownPlatformAdmin';

// The server is the only one that knows, so a slow connection must not leave the caller waiting for good.
export const PLATFORM_ADMIN_WAIT_MS = 3000;

// Like usePlatformAdmin, but tells "still asking" apart from "no", for the caller that has to wait for the answer. Fails closed: no user, a
// failed lookup or no answer within PLATFORM_ADMIN_WAIT_MS is "no". The answer is stored with the user who asked.
//
// With `known` (issue 1311) the last answer of the server for this account is used at once and the server is not asked here:
// usePlatformAdminRouteCorrection asks in the background and corrects the route if the answer changed. Only a phone that knows nothing
// yet waits, as before, and remembers the answer for the next start. A failed lookup is never remembered.
export function usePlatformAdminStatus(
  repository: Pick<ConflictReviewRepository, 'isPlatformAdmin'>,
  userId: string | undefined,
  known?: KnownPlatformAdminRepository,
): boolean | 'loading' {
  const [answer, setAnswer] = useState<{ userId: string; admin: boolean }>();
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (userId) {
      const ask = () => {
        timer = setTimeout(() => active && setAnswer((previous) => (previous?.userId === userId ? previous : { userId, admin: false })), PLATFORM_ADMIN_WAIT_MS);
        repository.isPlatformAdmin(userId).then(
          (admin) => {
            if (!active) return;
            setAnswer({ userId, admin });
            known?.write(userId, admin).catch(() => {});
          },
          () => active && setAnswer({ userId, admin: false }),
        );
      };
      if (known) known.read(userId).catch(() => null).then((saved) => (!active ? undefined : saved === null ? ask() : setAnswer({ userId, admin: saved })));
      else ask();
    }
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [repository, userId, known]);
  if (!userId) return false;
  return answer?.userId === userId ? answer.admin : 'loading';
}
