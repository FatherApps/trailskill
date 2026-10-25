import type { AbstractPowerSyncDatabase, CrudEntry, PowerSyncBackendConnector } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Postgres errors that retrying cannot fix: class 22, class 23 and insufficient_privilege. */
export function isPermanentUploadError(error: { code?: string }): boolean {
  const code = error.code ?? '';
  return /^2[23]/.test(code) || code === '42501';
}

type Result = { data: unknown[] | null; error: { code?: string } | null };

/** A permanent rejection becomes its code, no error is null, any other error is thrown so PowerSync retries. */
function failureCode(result: Result): string | null {
  if (!result.error) return null;
  if (isPermanentUploadError(result.error)) return result.error.code ?? '';
  throw result.error;
}

// Spec "New measurements are append-only" (2026-10-24-pilot-design.md): these tables are only ever inserted, never updated by the app.
const INSERT_ONLY_TABLES = new Set(['measurements', 'timing_series']);

export class SupabaseConnector implements PowerSyncBackendConnector {
  constructor(
    private readonly client: SupabaseClient,
    private readonly endpoint: string,
  ) {}

  async fetchCredentials(): Promise<{ endpoint: string; token: string } | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    let session = data.session;
    if (!session) return null;

    if (session.expires_at !== undefined && session.expires_at <= Math.floor(Date.now() / 1000)) {
      const refreshed = await this.client.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      session = refreshed.data.session;
      if (!session) return null;
    }
    return { endpoint: this.endpoint, token: session.access_token };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    // Every op is sent before any bookkeeping: a thrown network error must leave local state untouched for the retry.
    const codes: (string | null)[] = [];
    for (const op of transaction.crud) codes.push(await this.send(op));

    // One transaction: either every mark and failure of this batch is recorded, or none.
    // Successes clear the record's old failures first, then this batch's failures are inserted, so a failure recorded here is never cleared by it.
    await database.writeTransaction(async (tx) => {
      for (const [i, op] of transaction.crud.entries()) {
        // One mark per op: a newer write queued for the same record keeps its own mark.
        await tx.execute(
          'DELETE FROM pending_writes WHERE id = (SELECT id FROM pending_writes WHERE table_name = ? AND record_id = ? LIMIT 1)',
          [op.table, op.id],
        );
        if (!codes[i]) await tx.execute('DELETE FROM upload_failures WHERE table_name = ? AND record_id = ?', [op.table, op.id]);
      }
      for (const [i, op] of transaction.crud.entries()) {
        const code = codes[i];
        if (!code) continue;
        await tx.execute(
          'INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)',
          [op.table, op.id, op.op, JSON.stringify(op.opData ?? {}), code, new Date().toISOString()],
        );
      }
    });
    // complete() runs in its own transaction: a crash between the two re-sends ops already sent, which is safe (inserts are idempotent, marks are per op).
    await transaction.complete();
  }

  /** Sends one op. Returns a failure code for a permanent rejection, throws on any other error. */
  private async send(op: CrudEntry): Promise<string | null> {
    const table = this.client.from(op.table);
    let result: Result;
    switch (op.op) {
      case 'PUT':
        if (INSERT_ONLY_TABLES.has(op.table)) {
          // ON CONFLICT DO NOTHING: a retry of a saved row must not hit the update policy. No row back means a conflict, so confirm it exists.
          result = await table.upsert({ id: op.id, ...op.opData }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
          return failureCode(result) ?? (result.data?.length ? null : this.confirm(op, true));
        }
        result = await table.upsert({ id: op.id, ...op.opData });
        return failureCode(result);
      case 'PATCH':
        result = await table.update(op.opData ?? {}).eq('id', op.id).select('id');
        // RLS filters rows silently: an empty result means the write changed nothing.
        return failureCode(result) ?? (result.data?.length ? null : 'no_rows_affected');
      default:
        result = await table.delete().eq('id', op.id).select('id');
        return failureCode(result) ?? (result.data?.length ? null : this.confirm(op, false));
    }
  }

  /** An op that changed no row is fine only if the row is where it should be: present after an insert, absent after a delete. */
  private async confirm(op: CrudEntry, expectedPresent: boolean): Promise<string | null> {
    const result: Result = await this.client.from(op.table).select('id').eq('id', op.id);
    const failure = failureCode(result);
    if (failure !== null) return failure;
    return !!result.data?.length === expectedPresent ? null : 'no_rows_affected';
  }
}
