import { useEffect, useState } from 'react';

import type { ShareCodeCache } from './athleteShareCodeCache';
import { ShareCodeRefusedError, type AthleteShareCodeRepository } from './athleteShareCodes';

export type ShareCodeState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; code: string };

export type UseAthleteShareCodeOptions = {
  repository: AthleteShareCodeRepository;
  cache: ShareCodeCache;
  // The signed-in user: the saved code is theirs only. Without it nothing is read or saved.
  userId: string | undefined;
  athleteId: string;
  online: boolean;
  // Changing it asks the server again.
  attempt?: number;
};

const loading: ShareCodeState = { status: 'loading' };

/**
 * The swimmer's share code: the saved one at once, then the server's when there is signal (saving it when it differs).
 * A refusal from the server (the user no longer manages the swimmer) forgets the saved code; a missing signal keeps it.
 */
export function useAthleteShareCode({ repository, cache, userId, athleteId, online, attempt = 0 }: UseAthleteShareCodeOptions) {
  const key = `${userId}:${athleteId}:${attempt}`;
  const [result, setResult] = useState<{ key: string; state: ShareCodeState }>();

  useEffect(() => {
    let active = true;
    const show = (state: ShareCodeState) => {
      if (active) setResult({ key, state });
    };
    void (async () => {
      const saved = userId ? await cache.get(userId, athleteId).catch(() => null) : null;
      if (saved) show({ status: 'ready', code: saved });
      if (!online) return;
      try {
        const code = await repository.get(athleteId);
        show({ status: 'ready', code });
        if (userId && code !== saved) await cache.set(userId, athleteId, code).catch(() => {});
      } catch (error) {
        if (error instanceof ShareCodeRefusedError) {
          if (userId) await cache.clear(userId, athleteId).catch(() => {});
          show({ status: 'error' });
        } else if (!saved) show({ status: 'error' });
      }
    })();
    return () => {
      active = false;
    };
  }, [repository, cache, userId, athleteId, online, attempt, key]);

  // The code the person just made (changed on the profile) replaces the shown and the saved one.
  function replace(code: string) {
    setResult({ key, state: { status: 'ready', code } });
    if (userId) void cache.set(userId, athleteId, code).catch(() => {});
  }

  return { state: result?.key === key ? result.state : loading, replace };
}
