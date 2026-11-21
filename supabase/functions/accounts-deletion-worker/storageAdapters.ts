import type { Rpc } from '../accounts-delete-account/adapters.ts';
import type { OrphanObject, QueuedObject, StorageApi, StorageDrainStore } from './storagePort.ts';

// An error carries the Postgres code and nothing else: the message of a failed call could echo a path.
const failure = (fn: string, code?: string) => new Error(`Calling ${fn} failed (${code ?? 'unknown'})`);
const malformed = (fn: string) => failure(fn, 'malformed');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** The Storage drain functions of the database, called as service role. Anything unknown or malformed throws. */
export function createStorageDrainStore(rpc: Rpc): StorageDrainStore {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await rpc(fn, args);
    if (error) throw failure(fn, error.code);
    return data;
  };
  const done = (fn: string, data: unknown) => {
    if (!isRecord(data) || data.status !== 'ok') throw malformed(fn);
  };
  return {
    async claim(now, limit): Promise<QueuedObject[]> {
      const fn = 'claim_storage_deletions';
      const data = await call(fn, { p_now: now.toISOString(), p_limit: limit });
      if (!Array.isArray(data)) throw malformed(fn);
      return data.map((row) => {
        if (!isRecord(row) || !text(row.queue_id) || !text(row.bucket) || !text(row.path)) throw malformed(fn);
        return { queueId: row.queue_id, bucket: row.bucket, path: row.path };
      });
    },
    async finish(queueId) {
      const fn = 'finish_storage_deletion';
      done(fn, await call(fn, { p_id: queueId }));
    },
    async fail(queueId, now) {
      const fn = 'fail_storage_deletion';
      done(fn, await call(fn, { p_id: queueId, p_now: now.toISOString() }));
    },
    async listOrphans(now, graceHours, limit): Promise<OrphanObject[]> {
      const fn = 'list_orphan_photo_objects';
      const data = await call(fn, { p_now: now.toISOString(), p_grace_hours: graceHours, p_limit: limit });
      if (!Array.isArray(data)) throw malformed(fn);
      return data.map((row) => {
        if (!isRecord(row) || !text(row.bucket) || !text(row.path)) throw malformed(fn);
        return { bucket: row.bucket, path: row.path };
      });
    },
  };
}

/** What supabase-js `storage.from(bucket).remove(paths)` answers, narrowed to what the adapter reads. */
export type StorageRemove = (bucket: string, paths: string[]) => Promise<{ error: { status?: unknown } | null }>;

/** The Storage API through supabase-js. A 404 counts as deleted; any other failure carries only its HTTP status. */
export function createStorageApi(remove: StorageRemove): StorageApi {
  return {
    async remove(bucket, path) {
      let result: Awaited<ReturnType<StorageRemove>>;
      try {
        result = await remove(bucket, [path]);
      } catch {
        throw new Error('Storage delete failed (network)');
      }
      if (!result.error) return;
      const status = result.error.status;
      if (status === 404) return;
      throw new Error(typeof status === 'number' && status >= 100 && status <= 599 ? `Storage delete failed (HTTP ${status})` : 'Storage delete failed (network)');
    },
  };
}
