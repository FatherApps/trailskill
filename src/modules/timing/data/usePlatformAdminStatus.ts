import { useEffect, useState } from 'react';

import type { ConflictReviewRepository } from './conflictReview';

// The server is the only one that knows, so a slow connection must not leave the caller waiting for good.
export const PLATFORM_ADMIN_WAIT_MS = 3000;

// Like usePlatformAdmin, but tells "still asking" apart from "no", for the caller that has to wait for the answer. Fails closed: no user, a
// failed lookup or no answer within PLATFORM_ADMIN_WAIT_MS is "no". The answer is stored with the user who asked.
export function usePlatformAdminStatus(repository: Pick<ConflictReviewRepository, 'isPlatformAdmin'>, userId: string | undefined): boolean | 'loading' {
  const [answer, setAnswer] = useState<{ userId: string; admin: boolean }>();
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (userId) {
      timer = setTimeout(() => active && setAnswer((previous) => (previous?.userId === userId ? previous : { userId, admin: false })), PLATFORM_ADMIN_WAIT_MS);
      repository
        .isPlatformAdmin(userId)
        .catch(() => false)
        .then((admin) => active && setAnswer({ userId, admin }));
    }
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [repository, userId]);
  if (!userId) return false;
  return answer?.userId === userId ? answer.admin : 'loading';
}
