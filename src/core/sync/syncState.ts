import { useQuery, useStatus } from '@powersync/react';

import { db } from './db';

export type RecordSyncState = 'on_device' | 'sending' | 'synced' | 'not_sent' | 'needs_review';

/**
 * A server rejection wins over everything, then an open edit conflict ("Revisar": nothing is lost, an administrator decides);
 * otherwise a pending write is on the device or being sent.
 */
export function recordSyncState(input: { pending: boolean; failed: boolean; uploading: boolean; conflict?: boolean }): RecordSyncState {
  if (input.failed) return 'not_sent';
  if (input.conflict) return 'needs_review';
  if (input.pending) return input.uploading ? 'sending' : 'on_device';
  return 'synced';
}

export function useRecordSyncState(table: string, id: string): RecordSyncState {
  const { data } = useQuery<{ pending: number; failed: number; conflict: number }>(
    `SELECT EXISTS (SELECT 1 FROM pending_writes WHERE table_name = ? AND record_id = ?) AS pending,
            EXISTS (SELECT 1 FROM upload_failures WHERE table_name = ? AND record_id = ?) AS failed,
            EXISTS (SELECT 1 FROM record_conflicts WHERE table_name = ? AND record_id = ? AND status = 'open') AS conflict`,
    [table, id, table, id, table, id],
  );
  const status = useStatus();
  const row = data[0];

  return recordSyncState({
    // Until the first result lands, never claim "sent" without proof.
    pending: row ? row.pending === 1 : true,
    failed: row?.failed === 1,
    conflict: row?.conflict === 1,
    uploading: status.dataFlowStatus.uploading,
  });
}

/** The sync state of many records of one table in a single watched read, by record id. */
export function useRecordSyncStates(table: string, ids: string[]): Map<string, RecordSyncState> {
  const { data } = useQuery<{ id: string; pending: number; failed: number; conflict: number }>(
    `SELECT r.value AS id,
            EXISTS (SELECT 1 FROM pending_writes WHERE table_name = ? AND record_id = r.value) AS pending,
            EXISTS (SELECT 1 FROM upload_failures WHERE table_name = ? AND record_id = r.value) AS failed,
            EXISTS (SELECT 1 FROM record_conflicts WHERE table_name = ? AND record_id = r.value AND status = 'open') AS conflict
     FROM json_each(?) r`,
    [table, table, table, JSON.stringify(ids)],
  );
  const { dataFlowStatus } = useStatus();
  return new Map(
    data.map((row) => [
      row.id,
      recordSyncState({ pending: row.pending === 1, failed: row.failed === 1, conflict: row.conflict === 1, uploading: dataFlowStatus.uploading }),
    ]),
  );
}

// A record can have several pending rows: count records, not rows.
const pendingRecords = 'SELECT DISTINCT table_name, record_id FROM pending_writes';
const failedRecords = 'SELECT DISTINCT table_name, record_id FROM upload_failures';

/**
 * Records that exist only on this device or were rejected by the server: signing out would lose them.
 * `rejected` counts the ones among them the server rejected: they are not sent again on their own.
 */
export async function countUnsentRecords(): Promise<{ unsent: number; rejected: number }> {
  const rows = await db.getAll<{ unsent: number; rejected: number }>(
    `SELECT (SELECT COUNT(*) FROM (${pendingRecords} UNION ${failedRecords})) AS unsent, (SELECT COUNT(*) FROM (${failedRecords})) AS rejected`,
  );
  return { unsent: rows[0]?.unsent ?? 0, rejected: rows[0]?.rejected ?? 0 };
}

export type SyncConnection = 'connected' | 'connecting' | 'offline';

/**
 * PowerSync reports `connected: false` both while it is connecting and when it cannot connect. A failed sync attempt leaves
 * `downloadError` until a sync completes, so: connected, or not connected with an error (offline), or not connected yet (connecting).
 * Limit: without a network-state dependency, an unreachable backend is also reported as offline.
 */
export function connectionState(status: { connected: boolean; dataFlowStatus: { downloadError?: Error } }): SyncConnection {
  if (status.connected) return 'connected';
  return status.dataFlowStatus.downloadError ? 'offline' : 'connecting';
}

export function useGlobalSyncSummary(): {
  pending: number;
  failed: number;
  uploading: boolean;
  lastSyncedAt: Date | null;
  connected: boolean;
  connection: SyncConnection;
} {
  const { data } = useQuery<{ pending: number; failed: number }>(
    `SELECT (SELECT COUNT(*) FROM (${pendingRecords})) AS pending, (SELECT COUNT(*) FROM (${failedRecords})) AS failed`,
  );
  const status = useStatus();

  return {
    pending: data[0]?.pending ?? 0,
    failed: data[0]?.failed ?? 0,
    uploading: status.dataFlowStatus.uploading,
    lastSyncedAt: status.lastSyncedAt ?? null,
    connected: status.connected,
    connection: connectionState(status),
  };
}
