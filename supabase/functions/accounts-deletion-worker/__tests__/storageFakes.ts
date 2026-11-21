import type { OrphanObject, QueuedObject, StorageApi, StorageDrainStore } from '../storagePort.ts';

export const LEASE_MS = 15 * 60 * 1000;
export const ATHLETE = '12330000-0000-4000-8000-0000000000d1';
export const pathOf = (n: number) => `${ATHLETE}/12330000-0000-4000-8000-${String(n).padStart(12, '0')}.jpg`;

type Row = QueuedObject & { attempts: number; leasedUntil: number };

/** A Storage API holding a set of `bucket/path` keys. `failing` makes the listed keys reject with the given message; a key not held is already gone and resolves. */
export function createFakeStorage({ objects = [], failing = {} }: { objects?: string[]; failing?: Record<string, string> } = {}) {
  const held = new Set(objects);
  const storage: StorageApi = {
    async remove(bucket, path) {
      const key = `${bucket}/${path}`;
      if (failing[key]) throw new Error(failing[key]);
      held.delete(key);
    },
  };
  return { storage, held };
}

/** In-memory database semantics of the drain: a claimed row is leased for 15 minutes, a failed one keeps its attempt and its lease, a finished one is gone. */
export function createMemoryDrainStore({ queued = [], orphans = [], referenced = [] }: { queued?: { id: string; bucket: string; path: string }[]; orphans?: OrphanObject[]; referenced?: string[] } = {}) {
  const rows: Row[] = queued.map((q) => ({ queueId: q.id, bucket: q.bucket, path: q.path, attempts: 0, leasedUntil: 0 }));
  const graceCalls: number[] = [];
  const store: StorageDrainStore = {
    async claim(now, limit) {
      for (let i = rows.length - 1; i >= 0; i--) if (referenced.includes(rows[i].path)) rows.splice(i, 1);
      const due = rows.filter((r) => r.leasedUntil <= now.getTime()).slice(0, limit);
      for (const r of due) r.leasedUntil = now.getTime() + LEASE_MS;
      return due.map(({ queueId, bucket, path }) => ({ queueId, bucket, path }));
    },
    async finish(queueId) {
      const i = rows.findIndex((r) => r.queueId === queueId);
      if (i >= 0) rows.splice(i, 1);
    },
    async fail(queueId, now) {
      const row = rows.find((r) => r.queueId === queueId);
      if (row) {
        row.attempts++;
        row.leasedUntil = now.getTime() + LEASE_MS;
      }
    },
    async listOrphans(_now, graceHours, limit) {
      graceCalls.push(graceHours);
      return orphans.slice(0, limit);
    },
  };
  return { store, rows, graceCalls };
}
