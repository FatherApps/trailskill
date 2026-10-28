import { useEffect, useState } from 'react';

import type { AuthorizationStatusRepository } from '../../accounts';

// The ids of the athletes whose authorization to record times is in force on this device, the same answer the profile shows.
// `undefined` until it is read and when the read fails: a card then shows no tag rather than a wrong one. Changing `refreshKey` reads again.
export function useAuthorizedAthletes(authorizations: AuthorizationStatusRepository, refreshKey?: unknown): ReadonlySet<string> | undefined {
  const [granted, setGranted] = useState<ReadonlySet<string>>();
  useEffect(() => {
    let active = true;
    authorizations.listGrantedAthleteIds('record_times').then(
      (ids) => active && setGranted(new Set(ids)),
      (error: unknown) => {
        if (__DEV__) console.warn('[athletes] Authorization lookup failed', error);
      },
    );
    return () => {
      active = false;
    };
  }, [authorizations, refreshKey]);
  return granted;
}
