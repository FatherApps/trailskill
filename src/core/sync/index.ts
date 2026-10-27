export { isPermanentUploadError, SupabaseConnector } from './connector';
export { connectOptions, db } from './db';
export { AppSchema } from './schema';
export type { Database } from './schema';
export { supabase, supabaseConfigError } from './supabase';
// A reactive read of the local database; modules reach it here so Jest suites that mock core/sync never load the ESM-only package.
export { useQuery } from '@powersync/react';
export { connectionState, countUnsentRecords, recordSyncState, useGlobalSyncSummary, useRecordSyncState, useRecordSyncStates } from './syncState';
export type { RecordSyncState, SyncConnection } from './syncState';
export { RecordSyncStatus } from './RecordSyncStatus';
export { deleteRecord, editRecord, retryFailedRecord, setSessionUser, writeBatch, writeRecord } from './writes';
export type { RetryResult, WriteBatch } from './writes';
