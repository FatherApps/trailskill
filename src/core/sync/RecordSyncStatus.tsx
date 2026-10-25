import { useState } from 'react';

import { t } from '../i18n';
import { SyncStatus } from '../ui';
import { useRecordSyncState } from './syncState';
import { retryFailedRecord, type RetryResult } from './writes';

const retryMessageKey: Partial<Record<RetryResult, string>> = {
  row_missing: 'sync.retry_row_missing',
  nothing_to_send: 'sync.retry_nothing_to_send',
};

/** Connects one record's sync state and its retry to the presentational SyncStatus. */
export function RecordSyncStatus({ table, id }: { table: string; id: string }) {
  const state = useRecordSyncState(table, id);
  // Kept for the retry message; tagged with the state it answered and cleared as soon as the state changes.
  const [retry, setRetry] = useState<{ state: typeof state; result: RetryResult } | null>(null);
  if (retry && retry.state !== state) setRetry(null); // adjusting state while rendering, not in an effect
  const retryResult: RetryResult | null = retry?.state === state ? retry.result : null;
  const onRetry = () => {
    // No row values in the log: they can be personal data.
    retryFailedRecord(table, id).then((result) => setRetry({ state, result })).catch((error: unknown) => console.error('Retrying a failed record did not work', error));
  };
  return <SyncStatus
      state={state}
      onRetry={onRetry}
      message={retryResult && retryMessageKey[retryResult] ? t(retryMessageKey[retryResult]) : undefined}
    />;
}
