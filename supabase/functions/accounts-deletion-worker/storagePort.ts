/** An object some deleted photo left behind, leased by the database for this run. */
export type QueuedObject = { queueId: string; bucket: string; path: string };

/** An object of athlete-photos that no photo row references and that is older than the grace period. */
export type OrphanObject = { bucket: string; path: string };

/** The database side of the Storage drain. Every call receives the `now` of the run, so tests drive time. */
export interface StorageDrainStore {
  /** Leases queued objects: a leased one is not returned again for 15 minutes. Paths a photo row still references are never returned. */
  claim(now: Date, limit: number): Promise<QueuedObject[]>;
  /** The object is gone: the queue row is done. */
  finish(queueId: string): Promise<void>;
  /** The Storage API failed: the row stays queued with the attempt recorded. */
  fail(queueId: string, now: Date): Promise<void>;
  listOrphans(now: Date, graceHours: number, limit: number): Promise<OrphanObject[]>;
}

/**
 * The Storage API, the only thing that deletes files. Resolves when the object is gone, an object that no longer exists included;
 * rejects with `Storage delete failed (network)` or `Storage delete failed (HTTP <status>)` and nothing else.
 */
export interface StorageApi {
  remove(bucket: string, path: string): Promise<void>;
}
