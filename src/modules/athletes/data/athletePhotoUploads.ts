import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { db, deleteRecord, supabase, writeRecord } from '../../../core/sync';
import { ATHLETE_PHOTOS_BUCKET, createFileSystemPhotoCache, type PhotoCache } from './athletePhotos';

// Issue 1222. A photo is chosen offline as often as online, so it goes through a queue that lives only on this phone:
//   1. the JPEG is kept in documentDirectory/athlete-photo-uploads/<athlete id>/<id>.jpg and a row of athlete_photo_uploads names it;
//   2. when the connection allows, the object goes up to Storage as <athlete id>/<id>.jpg (the queue row's id is the object's uuid, so a retry reuses the path);
//   3. only then athlete_photos is written with writeRecord, which syncs the row to every device;
//   4. the queue row and the local file go.
// Taking a photo away is the other way round: the object first, then the row. A row that points to no object shows the initials; an object that no
// row points to is left only for the cleanup queue (issues 1232 and 1233). Nothing here logs a path, a URL or a file URI.

export type PhotoUpload = { id: string; athleteId: string; localUri: string };

/** The queue of photos waiting to go up: local only, never synced. */
export interface PhotoUploadQueue {
  list(athleteId?: string): Promise<PhotoUpload[]>;
  add(upload: PhotoUpload): Promise<void>;
  remove(id: string): Promise<void>;
}

/** The Storage side. Online only; `upload` throws a PhotoRejectedError when the server refuses the photo for good, any other error when it could not try. */
export interface PhotoObjects {
  upload(storagePath: string, localUri: string): Promise<void>;
  remove(storagePath: string): Promise<void>;
}

export type PhotoRow = { id: string; storagePath: string };

/** The athlete_photos row of an athlete: one at most. Writing it queues it for sync, like any record. */
export interface PhotoRows {
  current(athleteId: string): Promise<PhotoRow | null>;
  save(input: { athleteId: string; storagePath: string; userId: string }): Promise<void>;
  remove(id: string): Promise<void>;
}

/** The image kept on this phone while it waits. */
export interface LocalPhotoFiles {
  /** Moves the picked image into the kept folder and returns the kept file's URI. */
  keep(athleteId: string, id: string, sourceUri: string): string;
  delete(uri: string): void;
  /** Deletes every kept image: nobody is signed in, so none may stay on the phone. */
  clearAll(): void;
}

/** The server refused this photo and will keep refusing it (a policy, a size or a type): retrying would never end. */
export class PhotoRejectedError extends Error {
  constructor() {
    super('The server rejected an athlete photo');
    this.name = 'PhotoRejectedError';
  }
}

export type AthletePhotoService = {
  /** Keeps the picked image, queues it and tries to send it. Resolves once the image is safe on the device, connected or not. */
  add(athleteId: string, pickedUri: string, userId: string): Promise<void>;
  /** Sends every queued photo, one after the other; a photo that cannot go yet stays queued. Safe to call at any time and from several places. */
  drain(userId: string): Promise<void>;
  /** The stored photo of the athlete on this device, if any. A caller that will ask to remove it later keeps this: a withdrawal of show_photo soon takes the row off the device. */
  find(athleteId: string): Promise<PhotoRow | null>;
  /** Whether the athlete has a photo on this device: a stored one or one still waiting in the queue. */
  has(athleteId: string): Promise<boolean>;
  /**
   * Takes the photo away: the queued one, then the stored object, then its row. Rejects (leaving the row) when the object could not be deleted.
   * `row` is the stored photo to remove when the caller found it earlier; without it the athlete's current row is used.
   */
  remove(athleteId: string, row?: PhotoRow | null): Promise<void>;
  /** Drops the photo still waiting in the queue, without touching the stored one: show_photo is no longer in force, so it must not leave the phone. */
  discard(athleteId: string): Promise<void>;
  /** Drops every queued photo: nobody is signed in. */
  discardAll(): Promise<void>;
};

export function createAthletePhotoService({
  queue,
  objects,
  rows,
  files,
  cache,
  newId = randomUUID,
}: {
  queue: PhotoUploadQueue;
  objects: PhotoObjects;
  rows: PhotoRows;
  files: LocalPhotoFiles;
  // Where the photo just sent goes on showing from: the server only signs an object that a row of ITS database points to, and that row has not reached it yet.
  cache?: Pick<PhotoCache, 'adopt'>;
  newId?: () => string;
}): AthletePhotoService {
  const pathOf = (upload: PhotoUpload) => `${upload.athleteId}/${upload.id}.jpg`;
  const drop = async (upload: PhotoUpload) => {
    await queue.remove(upload.id);
    files.delete(upload.localUri);
  };
  const dropAthlete = async (athleteId: string) => {
    for (const upload of await queue.list(athleteId)) await drop(upload);
  };

  // One at a time: a screen, the root layout and a retry can all ask, and a second upload of the same object would only race the first.
  let running: Promise<void> = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = running.then(work, work);
    running = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const sendOne = async (upload: PhotoUpload, userId: string) => {
    const storagePath = pathOf(upload);
    try {
      await objects.upload(storagePath, upload.localUri);
    } catch (error) {
      if (error instanceof PhotoRejectedError) return drop(upload);
      return; // No connection, or the server is busy: it stays queued.
    }
    try {
      await rows.save({ athleteId: upload.athleteId, storagePath, userId });
    } catch {
      return; // The object is up but the row is not written: the retry uploads the same path again and writes the row.
    }
    try {
      // The image moves into the photo cache: the screen keeps showing it while the row travels, instead of the initials of a refused signed URL.
      cache?.adopt({ athleteId: upload.athleteId, storagePath }, upload.localUri);
      await queue.remove(upload.id);
    } catch {
      await drop(upload);
    }
  };

  const drainNow = async (userId: string) => {
    for (const upload of await queue.list()) await sendOne(upload, userId);
  };

  return {
    add: (athleteId, pickedUri, userId) =>
      exclusive(async () => {
        // A newer choice replaces the one still waiting.
        await dropAthlete(athleteId);
        const id = newId();
        const localUri = files.keep(athleteId, id, pickedUri);
        await queue.add({ id, athleteId, localUri });
        await drainNow(userId);
      }),
    drain: (userId) => exclusive(() => drainNow(userId)),
    find: (athleteId) => rows.current(athleteId),
    has: async (athleteId) => (await queue.list(athleteId)).length > 0 || (await rows.current(athleteId)) !== null,
    remove: (athleteId, found) =>
      exclusive(async () => {
        await dropAthlete(athleteId);
        const row = found ?? (await rows.current(athleteId));
        if (!row) return;
        await objects.remove(row.storagePath);
        await rows.remove(row.id);
      }),
    discard: (athleteId) => exclusive(() => dropAthlete(athleteId)),
    discardAll: () =>
      exclusive(async () => {
        for (const upload of await queue.list()) await drop(upload);
        // Also the images no row names any more (the local database was cleared with the session).
        files.clearAll();
      }),
  };
}

let shared: AthletePhotoService | undefined;
/** The one service of the app: a screen and the root layout share it, so two of them never upload the same photo at once. */
export function getAthletePhotoService(): AthletePhotoService {
  shared ??= createAthletePhotoService({
    queue: createPowerSyncPhotoUploadQueue(),
    objects: createSupabasePhotoObjects(),
    rows: createPowerSyncPhotoRows(),
    files: createFileSystemLocalPhotoFiles(),
    cache: createFileSystemPhotoCache(),
  });
  return shared;
}

// ---- Test doubles: every effect goes into one log so a test can read their order. ----

export function createInMemoryPhotoUploadQueue(): PhotoUploadQueue {
  let items: PhotoUpload[] = [];
  return {
    async list(athleteId) {
      return items.filter((item) => athleteId === undefined || item.athleteId === athleteId).map((item) => ({ ...item }));
    },
    async add(upload) {
      items.push({ ...upload });
    },
    async remove(id) {
      items = items.filter((item) => item.id !== id);
    },
  };
}

export function createInMemoryPhotoObjects(log: string[] = []): PhotoObjects & { failUploads(error: Error | null): void; failRemovals(error: Error | null): void } {
  let uploadError: Error | null = null;
  let removalError: Error | null = null;
  return {
    failUploads: (error) => {
      uploadError = error;
    },
    failRemovals: (error) => {
      removalError = error;
    },
    async upload(storagePath) {
      log.push(`upload ${storagePath}`);
      if (uploadError) throw uploadError;
    },
    async remove(storagePath) {
      if (removalError) throw removalError;
      log.push(`object-remove ${storagePath}`);
    },
  };
}

export function createInMemoryPhotoRows(log: string[] = []): PhotoRows & { stored(athleteId: string): PhotoRow | null; failSaves(error: Error | null): void } {
  const stored = new Map<string, PhotoRow>();
  let saveError: Error | null = null;
  let next = 0;
  return {
    failSaves: (error) => {
      saveError = error;
    },
    stored: (athleteId) => stored.get(athleteId) ?? null,
    async current(athleteId) {
      return stored.get(athleteId) ?? null;
    },
    async save({ athleteId, storagePath }) {
      if (saveError) throw saveError;
      log.push(`row-save ${storagePath}`);
      // An athlete has one row: a new photo updates it, the first one inserts it.
      stored.set(athleteId, { id: stored.get(athleteId)?.id ?? `row-${++next}`, storagePath });
    },
    async remove(id) {
      for (const [athleteId, row] of stored) {
        if (row.id !== id) continue;
        log.push(`row-remove ${row.storagePath}`);
        stored.delete(athleteId);
      }
    },
  };
}

export function createInMemoryLocalPhotoFiles(log: string[] = []): LocalPhotoFiles & { kept(): string[]; moveOut(uri: string): void } {
  const kept = new Set<string>();
  const prefix = 'file:///kept/';
  return {
    kept: () => [...kept],
    // The file left by being moved somewhere else: it is no longer here, and that is not a delete.
    moveOut(uri) {
      kept.delete(uri.slice(prefix.length).replace(/[.]jpg$/, ''));
    },
    clearAll() {
      log.push('clear-files');
      kept.clear();
    },
    keep(athleteId, id) {
      log.push(`keep ${athleteId} ${id}`);
      kept.add(`${athleteId}/${id}`);
      return `${prefix}${athleteId}/${id}.jpg`;
    },
    delete(uri) {
      const key = uri.slice(prefix.length).replace(/[.]jpg$/, '');
      log.push(`delete-file ${key}`);
      kept.delete(key);
    },
  };
}

// ---- Adapters. ----

type QueueRow = { id: string; athlete_id: string; local_uri: string };

export function createPowerSyncPhotoUploadQueue(): PhotoUploadQueue {
  const toUpload = (row: QueueRow): PhotoUpload => ({ id: row.id, athleteId: row.athlete_id, localUri: row.local_uri });
  return {
    async list(athleteId) {
      const rows =
        athleteId === undefined
          ? await db.getAll<QueueRow>('SELECT id, athlete_id, local_uri FROM athlete_photo_uploads ORDER BY id')
          : await db.getAll<QueueRow>('SELECT id, athlete_id, local_uri FROM athlete_photo_uploads WHERE athlete_id = ? ORDER BY id', [athleteId]);
      return rows.map(toUpload);
    },
    async add(upload) {
      await db.execute('INSERT INTO athlete_photo_uploads (id, athlete_id, local_uri) VALUES (?, ?, ?)', [upload.id, upload.athleteId, upload.localUri]);
    },
    async remove(id) {
      await db.execute('DELETE FROM athlete_photo_uploads WHERE id = ?', [id]);
    },
  };
}

// 400 bad request, 413 too large, 415 wrong type: none of them gets better by waiting. 401 and 403 are NOT in the list: a token about to refresh, or a show_photo acceptance
// still on its way to the server (the photo was taken offline), is refused today and accepted a moment later, and dropping the photo then would lose it for good.
const REFUSED_FOR_GOOD = new Set([400, 413, 415]);
// What storage-js reports: a StorageApiError carries the HTTP status (as a number or a string, depending on the version).
const statusOf = (error: unknown): number => Number((error as { status?: unknown; statusCode?: unknown }).statusCode ?? (error as { status?: unknown }).status);

export function createSupabasePhotoObjects(): PhotoObjects {
  return {
    async upload(storagePath, localUri) {
      const bytes = await new File(localUri).bytes();
      const { error } = await supabase.storage.from(ATHLETE_PHOTOS_BUCKET).upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
      if (!error) return;
      // The same object already there: an earlier try went up and only the row is missing.
      if (statusOf(error) === 409) return;
      if (REFUSED_FOR_GOOD.has(statusOf(error))) throw new PhotoRejectedError();
      // No path in the message: callers may log it.
      throw new Error('An athlete photo could not be uploaded');
    },
    async remove(storagePath) {
      // Storage answers a delete its policy filters out with an empty list and no error: only a list that names the object proves it is gone.
      const { data, error } = await supabase.storage.from(ATHLETE_PHOTOS_BUCKET).remove([storagePath]);
      if (error || !data?.some((object) => object.name === storagePath)) throw new Error('An athlete photo could not be deleted');
    },
  };
}

export function createPowerSyncPhotoRows(): PhotoRows {
  const current = async (athleteId: string): Promise<PhotoRow | null> => {
    const [row] = await db.getAll<{ id: string; storage_path: string }>('SELECT id, storage_path FROM athlete_photos WHERE athlete_id = ?', [athleteId]);
    return row ? { id: row.id, storagePath: row.storage_path } : null;
  };
  return {
    current,
    async save({ athleteId, storagePath, userId }) {
      const existing = await current(athleteId);
      const updatedAt = new Date().toISOString();
      // The same row points to the new object: the athlete keeps one row, and the old object goes to the cleanup queue on the server.
      if (existing) await writeRecord('athlete_photos', { id: existing.id, storage_path: storagePath, updated_at: updatedAt });
      else await writeRecord('athlete_photos', { athlete_id: athleteId, storage_path: storagePath, created_by: userId, updated_at: updatedAt });
    },
    async remove(id) {
      await deleteRecord('athlete_photos', id);
    },
  };
}

const SAFE_ID = /^[\w-]+$/;
const uploadsRoot = () => new Directory(Paths.document, 'athlete-photo-uploads');

export function createFileSystemLocalPhotoFiles(): LocalPhotoFiles {
  return {
    keep(athleteId, id, sourceUri) {
      // The ids come from the app, but a name never builds a path unchecked.
      if (!SAFE_ID.test(athleteId) || !SAFE_ID.test(id)) throw new Error('Invalid athlete photo reference');
      const directory = new Directory(uploadsRoot(), athleteId);
      directory.create({ intermediates: true, idempotent: true });
      const target = new File(directory, `${id}.jpg`);
      // Moved, not copied: the encoded JPEG in the cache is a photo of a minor, and it must not stay there as well.
      new File(sourceUri).moveSync(target);
      return target.uri;
    },
    delete(uri) {
      const file = new File(uri);
      if (file.exists) file.delete();
    },
    clearAll() {
      const directory = uploadsRoot();
      if (directory.exists) directory.delete();
    },
  };
}
