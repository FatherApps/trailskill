import type { AbstractPowerSyncDatabase, CrudEntry, PowerSyncBackendConnector } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Postgres errors that retrying cannot fix: class 22, class 23 and insufficient_privilege. */
export function isPermanentUploadError(error: { code?: string }): boolean {
  const code = error.code ?? '';
  return /^2[23]/.test(code) || code === '42501';
}

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

    const failures: { op: CrudEntry; code: string }[] = [];
    for (const op of transaction.crud) {
      const code = await this.send(op);
      if (code) failures.push({ op, code });
    }

    // Bookkeeping waits until every op was sent: a thrown network error must leave local state untouched for the retry.
    for (const { op, code } of failures) {
      await database.execute(
        'INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)',
        [op.table, op.id, op.op, JSON.stringify(op.opData ?? {}), code, new Date().toISOString()],
      );
    }
    for (const op of transaction.crud) {
      await database.execute('DELETE FROM pending_writes WHERE table_name = ? AND record_id = ?', [op.table, op.id]);
    }
    await transaction.complete();
  }

  /** Sends one op. Returns a failure code for a permanent rejection, throws on any other error. */
  private async send(op: CrudEntry): Promise<string | null> {
    const table = this.client.from(op.table);
    let result: { data: unknown[] | null; error: { code?: string } | null };
    let expectsRow = true;
    switch (op.op) {
      case 'PUT':
        result = await table.upsert({ id: op.id, ...op.opData });
        expectsRow = false;
        break;
      case 'PATCH':
        result = await table.update(op.opData ?? {}).eq('id', op.id).select('id');
        break;
      default:
        result = await table.delete().eq('id', op.id).select('id');
    }

    if (result.error) {
      if (isPermanentUploadError(result.error)) return result.error.code ?? '';
      throw result.error;
    }
    // RLS filters rows silently: an empty result means the write changed nothing.
    return expectsRow && !result.data?.length ? 'no_rows_affected' : null;
  }
}
