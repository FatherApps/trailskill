import { useEffect, useRef } from 'react';

import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import { getAthletePhotoService, type AthletePhotoService } from './athletePhotoUploads';

/**
 * Sends the photos waiting in the queue (issue 1222) and keeps them from outliving the session. Mount it once, in the root layout and
 * outside any route guard: a photo chosen offline must still go up after the profile is closed, and a screen's hook is gone when the session ends.
 * - Connected and signed in: the queue is drained at once, and again each time a sync finishes, so a failed try is retried without a screen open.
 * - The session goes from a person to nobody: every queued photo and every kept image is deleted. A cold start without a session clears nothing.
 * Nothing here logs a path, a URL or a file URI.
 */
export function useAthletePhotoUploads(service: AthletePhotoService = getAthletePhotoService()): void {
  const { session, signingOut } = useSession();
  const userId = session?.user.id;
  const { connection, lastSyncedAt } = useGlobalSyncSummary();
  const syncedAt = lastSyncedAt?.getTime();
  const signedIn = useRef(userId != null);

  useEffect(() => {
    // A sign-out whose local clear may still fail hides the session without ending it: nothing is discarded until it really ends.
    if (signingOut) return;
    if (signedIn.current && userId == null) void service.discardAll().catch(() => {});
    signedIn.current = userId != null;
  }, [userId, signingOut, service]);

  useEffect(() => {
    if (userId == null || connection !== 'connected') return;
    // Never throws to the screen: a photo that cannot go yet simply stays queued.
    void service.drain(userId).catch(() => {});
    // `syncedAt` is not read inside: its change is what asks for another try.
  }, [userId, connection, syncedAt, service]);
}
