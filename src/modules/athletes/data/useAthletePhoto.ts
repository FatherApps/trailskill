import { useEffect, useRef, useState } from 'react';

import { useSession } from '../../../core/session';
import { useQuery } from '../../../core/sync';
import {
  createFileSystemPhotoCache,
  createSupabaseAthletePhotoRepository,
  type AthletePhotoRepository,
  type PhotoCache,
} from './athletePhotos';

export type AthletePhoto =
  /** The athlete has no photo on this device, or show_photo is not in force: nothing to show. */
  | { status: 'none'; uri: null }
  | { status: 'loading'; uri: null }
  /** The image could not be fetched (offline, or the server refused): show the avatar, try again on the next render. */
  | { status: 'unavailable'; uri: null }
  | { status: 'ready'; uri: string };

const defaultPhotos = createSupabaseAthletePhotoRepository();
const defaultCache = createFileSystemPhotoCache();

/**
 * The local image of an athlete's photo. It returns the cached file when it has this exact photo; otherwise it asks for a
 * signed URL of about 5 minutes and copies the image into cacheDirectory/athlete-photos/. The cache is emptied when show_photo
 * stops being in force for the athlete and when the person signs out, and anything the local rows no longer justify is pruned.
 * Nothing it does logs a path, a URL or a file URI.
 *
 * `showPhotoInForce` is useHasValidAuthorization(athleteId, 'show_photo') from accounts, read by the caller (a route or a
 * container outside this module): accounts already depends on athletes, so this module cannot import that hook without a cycle.
 */
export function useAthletePhoto(
  athleteId: string,
  showPhotoInForce: boolean,
  { photos = defaultPhotos, cache = defaultCache }: { photos?: AthletePhotoRepository; cache?: PhotoCache } = {},
): AthletePhoto {
  const authorized = showPhotoInForce;
  const row = useQuery<{ storage_path: string }>('SELECT storage_path FROM athlete_photos WHERE athlete_id = ?', [athleteId]);
  const { session } = useSession();
  const storagePath = authorized ? (row.data[0]?.storage_path ?? null) : null;
  const [fetched, setFetched] = useState<{ athleteId: string; storagePath: string; uri: string } | 'failed'>();

  // show_photo withdrawn (or never given): nothing of this athlete stays on the phone, even before the row leaves by sync.
  useEffect(() => {
    if (!authorized) cache.clearAthlete(athleteId);
  }, [authorized, athleteId, cache]);

  // The row left the device (a withdrawal synced, or the local database was cleared): its image goes too.
  useEffect(() => {
    if (authorized && !row.isLoading && !row.isFetching && row.data.length === 0) cache.clearAthlete(athleteId);
  }, [authorized, row.isLoading, row.isFetching, row.data.length, athleteId, cache]);

  // Signing out empties the whole cache, not just this athlete's: the next person on a shared phone starts empty.
  const signedIn = useRef(session != null);
  useEffect(() => {
    if (signedIn.current && session == null) cache.clearAll();
    signedIn.current = session != null;
  }, [session, cache]);

  useEffect(() => {
    if (!storagePath) return;
    const photo = { athleteId, storagePath };
    let active = true;
    (async () => {
      try {
        const local = cache.get(photo) ?? (await cache.put(photo, await photos.createSignedUrl(storagePath)));
        if (active) setFetched({ ...photo, uri: local });
      } catch {
        // No path, URL or URI in the log: only that it failed.
        if (__DEV__) console.warn('[athletes] An athlete photo could not be loaded');
        if (active) setFetched('failed');
      }
    })();
    return () => {
      active = false;
    };
  }, [athleteId, storagePath, photos, cache]);

  if (!storagePath) return { status: 'none', uri: null };
  if (fetched === 'failed') return { status: 'unavailable', uri: null };
  if (fetched && fetched.athleteId === athleteId && fetched.storagePath === storagePath) return { status: 'ready', uri: fetched.uri };
  return { status: 'loading', uri: null };
}
