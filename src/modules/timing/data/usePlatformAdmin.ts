import { useEffect, useState } from 'react';

import type { ConflictReviewRepository } from './conflictReview';

// Whether the signed-in user is a platform admin. Fails closed: no user, no answer yet or a failed lookup is "no".
// The answer is stored with the user who asked, so another user never inherits it while their own lookup runs.
export function usePlatformAdmin(repository: Pick<ConflictReviewRepository, 'isPlatformAdmin'>, userId: string | undefined): boolean {
  const [answer, setAnswer] = useState<{ userId: string; admin: boolean }>();
  useEffect(() => {
    let active = true;
    if (userId) {
      repository
        .isPlatformAdmin(userId)
        .catch(() => false)
        .then((admin) => active && setAnswer({ userId, admin }));
    }
    return () => {
      active = false;
    };
  }, [repository, userId]);
  return userId !== undefined && answer?.userId === userId && answer.admin;
}
