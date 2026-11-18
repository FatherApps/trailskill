import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { versionGate, type AppPlatform, type AppVersions, type AppVersionsCache, type AppVersionsRepository, type VersionGateStatus } from './appVersions';

// After a failed answer the server is asked again at this pace until it answers.
export const RETRY_MS = 60_000;

export type VersionGateInput = {
  repository: AppVersionsRepository;
  cache: AppVersionsCache;
  nativeVersion: string | null;
  platform: AppPlatform;
};

type Answer = { versions: AppVersions | null; online: boolean };

// Decides from the saved value first (never blocking), then from the server. Asks again when the app comes back to the foreground and,
// after a failure, every RETRY_MS: the gate acts as soon as the signal returns. dismiss hides the notice, never the block.
export function useVersionGate({ repository, cache, nativeVersion, platform }: VersionGateInput): { status: VersionGateStatus; dismiss: () => void } {
  const [answer, setAnswer] = useState<Answer>({ versions: null, online: false });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    let answered = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      clearTimeout(retry);
      try {
        const versions = await repository.fetch(platform);
        if (!alive) return;
        answered = true;
        setAnswer({ versions, online: true });
        if (versions) await cache.save(versions).catch(() => {});
      } catch {
        if (alive) retry = setTimeout(check, RETRY_MS);
      }
    };

    cache.load().then((versions) => {
      if (alive && !answered) setAnswer({ versions, online: false });
    });
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    return () => {
      alive = false;
      clearTimeout(retry);
      subscription.remove();
    };
  }, [repository, cache, platform]);

  const status = versionGate(nativeVersion, answer.versions, answer.online);
  const dismiss = useCallback(() => setDismissed(true), []);
  return { status: status === 'update' && dismissed ? 'ok' : status, dismiss };
}
