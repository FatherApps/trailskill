import { useEffect, useRef } from 'react';

import { useSession } from '../../../core/session';
import { createSecureStoreKnownDeletionStatusRepository, type KnownDeletionStatusRepository } from './knownDeletionStatus';

const defaultKnown = createSecureStoreKnownDeletionStatusRepository();

/**
 * Forgets the deletion status kept on the phone (issue 1311) when the session ends, so the next person who signs in never starts
 * from it. The root layout mounts it outside the guarded screens, like the photo cache guard: their hooks are gone by then.
 */
export function useKnownDeletionStatusGuard(known: KnownDeletionStatusRepository = defaultKnown): void {
  const { session } = useSession();
  const signedIn = useRef(session != null);
  useEffect(() => {
    if (signedIn.current && session == null) known.clear().catch(() => {});
    signedIn.current = session != null;
  }, [session, known]);
}
