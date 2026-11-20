import { useEffect, useRef, useState } from 'react';

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
  /** The image could not be fetched (offline, or the server refused): show the avatar. It is tried again when the athlete, the photo or show_photo changes. */
  | { status: 'unavailable'; uri: null }
  | { status: 'ready'; uri: string };

const defaultPhotos = createSupabaseAthletePhotoRepository();
const defaultCache = createFileSystemPhotoCache();

/**
 * The local image of an athlete's photo. It returns the cached file when it has this exact photo; otherwise it asks for a
 * signed URL of about 5 minutes and copies the image into cacheDirectory/athlete-photos/. This athlete's cache is emptied when
 * show_photo stops being in force or the row leaves the device. Signing out and a change of person are handled by
 * useAthletePhotoCacheGuard, which the root layout mounts: a screen's hook is gone by then. Nothing it does logs a path, a URL
 * or a file URI.
 *
 * A photo chosen on this phone that is still waiting in the upload queue (athlete_photo_uploads) shows from its local file, replacing the
 * stored one until it goes up; it needs show_photo like any other.
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
  const storagePath = authorized ? (row.data[0]?.storage_path ?? null) : null;
  // The photo chosen on this phone that has not gone up yet (issue 1222): it shows from the local file, and only while show_photo is in force.
  const waiting = useQuery<{ local_uri: string }>('SELECT local_uri FROM athlete_photo_uploads WHERE athlete_id = ?', [athleteId]);
  const waitingUri = authorized ? (waiting.data[0]?.local_uri ?? null) : null;
  const [fetched, setFetched] = useState<{ athleteId: string; storagePath: string; uri: string | null }>();
  const latestAuthorized = useRef(authorized);
  useEffect(() => {
    latestAuthorized.current = authorized;
  }, [authorized]);

  // show_photo withdrawn (or never given): nothing of this athlete stays on the phone, even before the row leaves by sync.
  useEffect(() => {
    if (!authorized) cache.clearAthlete(athleteId);
  }, [authorized, athleteId, cache]);

  // The row left the device (a withdrawal synced, or the local database was cleared): its image goes too.
  useEffect(() => {
    if (authorized && !row.isLoading && !row.isFetching && row.data.length === 0) cache.clearAthlete(athleteId);
  }, [authorized, row.isLoading, row.isFetching, row.data.length, athleteId, cache]);

  useEffect(() => {
    if (!storagePath) return;
    const photo = { athleteId, storagePath };
    let active = true;
    (async () => {
      try {
        const local = cache.get(photo) ?? (await cache.put(photo, await photos.createSignedUrl(storagePath)));
        if (active) setFetched({ ...photo, uri: local });
        // show_photo was withdrawn while the image was coming: the clear already ran, so this late copy must not stay.
        else if (!latestAuthorized.current) cache.clearAthlete(athleteId);
      } catch {
        // No path, URL or URI in the log: only that it failed.
        if (__DEV__) console.warn('[athletes] An athlete photo could not be loaded');
        if (active) setFetched({ ...photo, uri: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [athleteId, storagePath, photos, cache]);

  if (waitingUri) return { status: 'ready', uri: waitingUri };
  if (!storagePath) return { status: 'none', uri: null };
  if (fetched && fetched.athleteId === athleteId && fetched.storagePath === storagePath) {
    return fetched.uri ? { status: 'ready', uri: fetched.uri } : { status: 'unavailable', uri: null };
  }
  return { status: 'loading', uri: null };
}
