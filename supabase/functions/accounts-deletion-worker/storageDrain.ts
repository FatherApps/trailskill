import type { Clock } from './port.ts';
import type { StorageApi, StorageDrainStore } from './storagePort.ts';

/** Queued objects one claim takes; a run keeps claiming until a claim comes back short, at most MAX_ROUNDS times. */
export const DRAIN_BATCH = 50;
export const MAX_ROUNDS = 20;
/** Orphans one run sweeps; the rest waits for the next run. */
export const ORPHAN_BATCH = 200;
export const DEFAULT_GRACE_HOURS = 24;

export type StorageSummary = { deleted: number; failed: number; orphansDeleted: number; orphansFailed: number };

/** STORAGE_ORPHAN_GRACE_HOURS as a whole number of hours, 24 when it is missing or not a positive integer. */
export function graceHoursFrom(value: string | undefined): number {
  return value !== undefined && /^[1-9][0-9]{0,5}$/.test(value) ? Number(value) : DEFAULT_GRACE_HOURS;
}

// Only the fixed message of the Storage adapter reaches the log, never a path or an id of an athlete.
const LOGGABLE = /^(Calling [a-z_]+ failed \(\w+\)|Storage delete failed \((network|HTTP \d{3})\))$/;
const loggable = (error: unknown) => (error instanceof Error && LOGGABLE.test(error.message) ? error.message : 'unknown');

/**
 * Deletes, through the Storage API only, the objects the database queued and the athlete-photos objects no photo row references
 * after the grace period. A queue row is finished only after the object is gone; a failure records the attempt and the row comes
 * back in a later run. A failure on one object does not stop the others. Logs carry the queue row id and the failure kind, never a path.
 */
export function createStorageDrain({ store, storage, clock, graceHours = DEFAULT_GRACE_HOURS }: { store: StorageDrainStore; storage: StorageApi; clock: Clock; graceHours?: number }) {
  return async function drain(): Promise<StorageSummary> {
    const now = clock.now();
    const summary: StorageSummary = { deleted: 0, failed: 0, orphansDeleted: 0, orphansFailed: 0 };

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const batch = await store.claim(now, DRAIN_BATCH);
      for (const object of batch) {
        try {
          await storage.remove(object.bucket, object.path);
          await store.finish(object.queueId);
          summary.deleted++;
        } catch (error) {
          summary.failed++;
          console.error(`accounts-deletion-worker storage delete failed for queue row ${object.queueId}: ${loggable(error)}`);
          try {
            await store.fail(object.queueId, now);
          } catch (recordError) {
            console.error(`accounts-deletion-worker recording the attempt for queue row ${object.queueId} failed: ${loggable(recordError)}`);
          }
        }
      }
      if (batch.length < DRAIN_BATCH) break;
    }

    for (const orphan of await store.listOrphans(now, graceHours, ORPHAN_BATCH)) {
      try {
        await storage.remove(orphan.bucket, orphan.path);
        summary.orphansDeleted++;
      } catch (error) {
        summary.orphansFailed++;
        console.error(`accounts-deletion-worker orphan sweep delete failed: ${loggable(error)}`);
      }
    }
    return summary;
  };
}
