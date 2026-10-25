import { useQuery, useStatus } from '@powersync/react';

export type RecordSyncState = 'on_device' | 'sending' | 'synced' | 'not_sent';

/** A server rejection wins over everything; otherwise a pending write is on the device or being sent. */
export function recordSyncState(input: { pending: boolean; failed: boolean; uploading: boolean }): RecordSyncState {
  if (input.failed) return 'not_sent';
  if (input.pending) return input.uploading ? 'sending' : 'on_device';
  return 'synced';
}

export function useRecordSyncState(table: string, id: string): RecordSyncState {
  const { data } = useQuery<{ pending: number; failed: number }>(
    `SELECT EXISTS (SELECT 1 FROM pending_writes WHERE table_name = ? AND record_id = ?) AS pending,
            EXISTS (SELECT 1 FROM upload_failures WHERE table_name = ? AND record_id = ?) AS failed`,
    [table, id, table, id],
  );
  const status = useStatus();
  const row = data[0];

  return recordSyncState({
    // Until the first result lands, never claim "sent" without proof.
    pending: row ? row.pending === 1 : true,
    failed: row?.failed === 1,
    uploading: status.dataFlowStatus.uploading,
  });
}

export function useGlobalSyncSummary(): { pending: number; failed: number; uploading: boolean; lastSyncedAt: Date | null } {
  // A record can have several pending rows: count records, not rows.
  const { data } = useQuery<{ pending: number; failed: number }>(
    `SELECT (SELECT COUNT(*) FROM (SELECT DISTINCT table_name, record_id FROM pending_writes)) AS pending,
            (SELECT COUNT(*) FROM (SELECT DISTINCT table_name, record_id FROM upload_failures)) AS failed`,
  );
  const status = useStatus();

  return {
    pending: data[0]?.pending ?? 0,
    failed: data[0]?.failed ?? 0,
    uploading: status.dataFlowStatus.uploading,
    lastSyncedAt: status.lastSyncedAt ?? null,
  };
}
