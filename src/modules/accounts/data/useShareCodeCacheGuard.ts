import { useEffect, useRef } from 'react';

import { useSession } from '../../../core/session';
import type { ShareCodeCache } from './athleteShareCodeCache';

/**
 * Keeps the saved share codes from outliving the person who saw them: when the session goes from a person to nobody, that person's
 * codes are deleted. Mount it once, in the root layout and outside any route guard: a screen's hook is already unmounted when the
 * session ends. A cold start that begins without a session clears nothing. Nothing here logs an id or a code.
 */
export function useShareCodeCacheGuard(cache: ShareCodeCache): void {
  const { session } = useSession();
  const userId = session?.user.id;
  const signedInAs = useRef(userId);
  useEffect(() => {
    if (signedInAs.current && userId === undefined) void cache.clearUser(signedInAs.current).catch(() => {});
    signedInAs.current = userId;
  }, [userId, cache]);
}
