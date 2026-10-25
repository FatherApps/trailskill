import { SyncStatus } from '../ui';
import { useRecordSyncState } from './syncState';
import { retryFailedRecord } from './writes';

/** Connects one record's sync state and its retry to the presentational SyncStatus. */
export function RecordSyncStatus({ table, id }: { table: string; id: string }) {
  const state = useRecordSyncState(table, id);
  const onRetry = () => {
    // No row values in the log: they can be personal data.
    retryFailedRecord(table, id).catch((error: unknown) => console.error('Retrying a failed record did not work', error));
  };
  return <SyncStatus state={state} onRetry={onRetry} />;
}
