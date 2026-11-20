import { useEffect, useRef } from 'react';

import { useSession } from '../../../core/session';
import { useQuery } from '../../../core/sync';
import { createFileSystemPhotoCache, type PhotoCache } from './athletePhotos';

const defaultCache = createFileSystemPhotoCache();

/**
 * Keeps the photo cache from outliving the person who earned it. Mount it once, in the root layout and outside any route
 * guard: a screen's hook is already unmounted when the session ends.
 * - The session goes from a person to nobody: the whole cache is emptied, so the next person on a shared phone starts empty.
 * - The local rows are read (the app was killed before the sign-out, or another person signed in and the local database
 *   was cleared): whatever no local row justifies is pruned. A cold start that begins without a session clears nothing.
 * Nothing here logs a path, a URL or a file URI.
 */
export function useAthletePhotoCacheGuard(cache: PhotoCache = defaultCache): void {
  const { session } = useSession();
  const signedIn = useRef(session != null);
  useEffect(() => {
    if (signedIn.current && session == null) cache.clearAll();
    signedIn.current = session != null;
  }, [session, cache]);

  const rows = useQuery<{ athlete_id: string; storage_path: string }>('SELECT athlete_id, storage_path FROM athlete_photos');
  useEffect(() => {
    if (session == null || rows.isLoading || rows.isFetching) return;
    try {
      cache.prune(rows.data.map((row) => ({ athleteId: row.athlete_id, storagePath: row.storage_path })));
    } catch {
      // A bad row must not break the app; its cache entry goes at the next prune.
    }
  }, [session, rows.isLoading, rows.isFetching, rows.data, cache]);
}
