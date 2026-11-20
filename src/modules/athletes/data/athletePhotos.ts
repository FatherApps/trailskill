import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from '../../../core/sync';

// Issue 1221. The photo of an athlete is a private Storage object that only someone who can see the athlete reads, only
// while show_photo is in force. The app never keeps a public URL: it asks for a signed one that lives a few minutes,
// copies the image into the cache and shows the local file. Nothing here logs a path, a URL or a file URI.

export const ATHLETE_PHOTOS_BUCKET = 'athlete-photos';
/** About 5 minutes: enough to download the image, short enough that a withdrawal bites quickly. */
export const SIGNED_URL_SECONDS = 300;

export type AthletePhotoRepository = {
  /** A short-lived signed URL of the object. Online only; throws when the server refuses or there is no network. */
  createSignedUrl(storagePath: string): Promise<string>;
};

export function createSupabaseAthletePhotoRepository(): AthletePhotoRepository {
  return {
    async createSignedUrl(storagePath) {
      const { data, error } = await supabase.storage.from(ATHLETE_PHOTOS_BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
      // The message carries no path: callers may log it.
      if (error || !data?.signedUrl) throw new Error('Could not get a signed URL for an athlete photo');
      return data.signedUrl;
    },
  };
}

/** Test double: answers a URL only for the paths it was given, like the server answers only for what the caller can read. */
export function createInMemoryAthletePhotoRepository(urls: Record<string, string>): AthletePhotoRepository & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    async createSignedUrl(storagePath) {
      requested.push(storagePath);
      const url = urls[storagePath];
      if (!url) throw new Error('Could not get a signed URL for an athlete photo');
      return url;
    },
  };
}

export type PhotoRef = { athleteId: string; storagePath: string };

/** The images copied to this phone: one file per athlete, under cacheDirectory/athlete-photos/<athlete id>/. */
export type PhotoCache = {
  /** The local file of this exact photo, or null when it is not cached. */
  get(photo: PhotoRef): string | null;
  /** Downloads the image from the signed URL into the cache, replacing any other photo of the athlete, and returns its local file. */
  put(photo: PhotoRef, signedUrl: string): Promise<string>;
  /** Takes a local image (the photo just uploaded from this phone) into the cache as this exact photo, so it shows without asking for a signed URL the server may not give yet. */
  adopt(photo: PhotoRef, localUri: string): void;
  clearAthlete(athleteId: string): void;
  clearAll(): void;
  /** Deletes everything not in `keep`: the cache never outlives the rows (sign-out, withdrawal) that justified it. */
  prune(keep: PhotoRef[]): void;
};

const SAFE_ID = /^[\w-]+$/;
const SAFE_FILE = /^[\w-]+[.]jpg$/;

// Defence in depth: the server already forces <athlete id>/<uuid>.jpg, but a name from a synced row never builds a path unchecked.
function locate(photo: PhotoRef): { folder: string; file: string } {
  const [folder, file, ...extra] = photo.storagePath.split('/');
  if (extra.length > 0 || folder !== photo.athleteId || !SAFE_ID.test(photo.athleteId) || !SAFE_FILE.test(file ?? '')) {
    throw new Error('Invalid athlete photo reference');
  }
  return { folder, file };
}

const root = () => new Directory(Paths.cache, ATHLETE_PHOTOS_BUCKET);
const folderOf = (athleteId: string) => new Directory(Paths.cache, ATHLETE_PHOTOS_BUCKET, athleteId);

export function createFileSystemPhotoCache(): PhotoCache {
  const clearAthlete = (athleteId: string) => {
    if (!SAFE_ID.test(athleteId)) return;
    const folder = folderOf(athleteId);
    if (folder.exists) folder.delete();
  };
  return {
    get(photo) {
      const { folder, file } = locate(photo);
      const cached = new File(folderOf(folder), file);
      return cached.exists ? cached.uri : null;
    },
    async put(photo, signedUrl) {
      const { folder, file } = locate(photo);
      clearAthlete(folder);
      const directory = folderOf(folder);
      directory.create({ intermediates: true, idempotent: true });
      try {
        return (await File.downloadFileAsync(signedUrl, new File(directory, file))).uri;
      } catch (error) {
        // A half-written image must never look like a cached one.
        clearAthlete(folder);
        throw error;
      }
    },
    adopt(photo, localUri) {
      const { folder, file } = locate(photo);
      clearAthlete(folder);
      const directory = folderOf(folder);
      directory.create({ intermediates: true, idempotent: true });
      new File(localUri).moveSync(new File(directory, file));
    },
    clearAthlete,
    clearAll() {
      const directory = root();
      if (directory.exists) directory.delete();
    },
    prune(keep) {
      const directory = root();
      if (!directory.exists) return;
      const keepFiles = new Map<string, string>();
      for (const photo of keep) {
        try {
          const { folder, file } = locate(photo);
          keepFiles.set(folder, file);
        } catch {
          // An invalid reference keeps nothing.
        }
      }
      for (const entry of directory.list()) {
        if (!(entry instanceof Directory)) {
          entry.delete();
          continue;
        }
        const keptFile = keepFiles.get(entry.name);
        if (keptFile === undefined) {
          entry.delete();
          continue;
        }
        for (const child of entry.list()) if (child instanceof File && child.name !== keptFile) child.delete();
      }
    },
  };
}

/** Test double with the same contract as the file system cache. */
export function createInMemoryPhotoCache(download: (signedUrl: string) => Promise<void> = async () => {}): PhotoCache & { files(): string[] } {
  const files = new Map<string, string>();
  const key = (photo: PhotoRef) => {
    const { folder, file } = locate(photo);
    return `${folder}/${file}`;
  };
  const clearAthlete = (athleteId: string) => {
    for (const name of [...files.keys()]) if (name.startsWith(`${athleteId}/`)) files.delete(name);
  };
  return {
    files: () => [...files.keys()].sort(),
    get: (photo) => files.get(key(photo)) ?? null,
    async put(photo, signedUrl) {
      const name = key(photo);
      clearAthlete(photo.athleteId);
      await download(signedUrl);
      files.set(name, `file:///cache/athlete-photos/${name}`);
      return files.get(name) as string;
    },
    adopt(photo, localUri) {
      const name = key(photo);
      clearAthlete(photo.athleteId);
      files.set(name, localUri);
    },
    clearAthlete,
    clearAll: () => files.clear(),
    prune(keep) {
      const wanted = new Set(keep.map(key));
      for (const name of [...files.keys()]) if (!wanted.has(name)) files.delete(name);
    },
  };
}
