import type { AbstractPowerSyncDatabase, CrudEntry, PowerSyncBackendConnector } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Postgres errors that retrying cannot fix: class 22, class 23 and insufficient_privilege. */
export function isPermanentUploadError(error: { code?: string }): boolean {
  const code = error.code ?? '';
  return /^2[23]/.test(code) || code === '42501';
}

type Result = { data: unknown[] | null; error: { code?: string } | null; status?: number };

/** A permanent rejection becomes its code, no error is null, any other error is thrown (with the HTTP status attached) so PowerSync retries. */
function failureCode(result: Result): string | null {
  if (!result.error) return null;
  if (isPermanentUploadError(result.error)) return result.error.code ?? '';
  throw Object.assign(result.error, { status: result.status });
}

// Spec "New measurements are append-only" (2026-10-24-pilot-design.md): these tables are only ever inserted, never updated by the app.
const INSERT_ONLY_TABLES = new Set(['measurements', 'timing_series']);

/** Refresh a session that expires within this window, so a skewed device clock does not send an expired token. */
const TOKEN_REFRESH_MARGIN_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;
/** PostgREST JWT invalid, missing or expired: they last until the session is refreshed or the user signs in again, so they must never exhaust the retries. */
const AUTH_ERROR_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);
/** Postgres statement timeout, serialization failure and deadlock: the server itself says to retry, so they are treated like a network error. */
const TRANSIENT_ERROR_CODES = new Set(['57014', '40001', '40P01']);
/** Gateway statuses: the request never reached PostgREST's own error handling, so the server may recover. Any other 5xx with a code is a deterministic SQLSTATE failure. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);
const BASE_WAIT_MS = 1000;
const MAX_WAIT_MS = 30_000;

function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Upload wait canceled'));
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Upload wait canceled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export type ConnectorOptions = { maxAttempts?: number; sleep?: (ms: number, signal: AbortSignal) => Promise<void> };

export class SupabaseConnector implements PowerSyncBackendConnector {
  private readonly maxAttempts: number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private waitController = new AbortController();
  // shortcut: attempts are counted in memory, so they reset when the app restarts; persist the counter if a restart loop is ever seen.
  private readonly attempts = new Map<number, number>();
  // Consecutive failures that never give up (network, auth, transient): they only grow the wait.
  private readonly waits = new Map<number, number>();

  constructor(
    private readonly client: SupabaseClient,
    private readonly endpoint: string,
    options: ConnectorOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.sleep = options.sleep ?? sleepUnlessAborted;
  }

  /**
   * Ends the upload in progress at once: its wait stops, no further op is sent, and that uploadData call rejects without bookkeeping or complete(),
   * so a batch cut by the end of a session is sent again on the next connection. The caller (sign-out, session end, app going to background) is expected to call it.
   */
  cancelWaits(): void {
    this.waitController.abort();
    this.waitController = new AbortController();
  }

  async fetchCredentials(): Promise<{ endpoint: string; token: string } | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    let session = data.session;
    if (!session) return null;

    if (session.expires_at !== undefined && session.expires_at <= Math.floor(Date.now() / 1000) + TOKEN_REFRESH_MARGIN_SECONDS) {
      const refreshed = await this.client.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      session = refreshed.data.session;
      if (!session) return null;
    }
    return { endpoint: this.endpoint, token: session.access_token };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    // Captured first: a cancelWaits() during this call must reach it.
    const signal = this.waitController.signal;
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    // Every op is sent before any bookkeeping: a thrown network error must leave local state untouched for the retry.
    const codes: (string | null)[] = [];
    for (const op of transaction.crud) {
      if (signal.aborted) throw new Error('Upload canceled');
      codes.push(await this.sendLimited(op));
    }
    // An answer that arrived after the session ended was sent without the user's token: recording it would mark valid records "No enviado".
    if (signal.aborted) throw new Error('Upload canceled');

    // One transaction: either every mark and failure of this batch is recorded, or none.
    // Successes clear the record's old failures first, then this batch's failures are inserted, so a failure recorded here is never cleared by it.
    await database.writeTransaction(async (tx) => {
      // PowerSync numbers ps_crud with AUTOINCREMENT, so lower ids belong to completed transactions and ids are never reused: they can be pruned.
      if (transaction.crud.length) await tx.execute('DELETE FROM uploaded_ops WHERE client_id < ?', [transaction.crud[0].clientId]);
      // A crash between this transaction and complete() re-sends the ops: bookkeeping already recorded for an op must not run twice.
      const done = new Set<number>();
      for (const op of transaction.crud) {
        if (await tx.getOptional('SELECT client_id FROM uploaded_ops WHERE client_id = ?', [op.clientId])) done.add(op.clientId);
      }
      for (const [i, op] of transaction.crud.entries()) {
        if (done.has(op.clientId)) continue;
        // One mark per op: a newer write queued for the same record keeps its own mark.
        await tx.execute(
          'DELETE FROM pending_writes WHERE id = (SELECT id FROM pending_writes WHERE table_name = ? AND record_id = ? LIMIT 1)',
          [op.table, op.id],
        );
        if (!codes[i]) await tx.execute('DELETE FROM upload_failures WHERE table_name = ? AND record_id = ?', [op.table, op.id]);
      }
      for (const [i, op] of transaction.crud.entries()) {
        const code = codes[i];
        if (!code || done.has(op.clientId)) continue;
        await tx.execute(
          'INSERT INTO upload_failures (id, table_name, record_id, op, payload, error_code, failed_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)',
          [op.table, op.id, op.op, JSON.stringify(op.opData ?? {}), code, new Date().toISOString()],
        );
      }
      for (const clientId of new Set(transaction.crud.map((op) => op.clientId))) {
        if (!done.has(clientId)) await tx.execute('INSERT INTO uploaded_ops (id, client_id) VALUES (uuid(), ?)', [clientId]);
      }
    });
    // complete() runs in its own transaction: a crash between the two re-sends ops already sent, which is safe (inserts are idempotent, uploaded_ops stops the bookkeeping from running twice).
    await transaction.complete();
    for (const op of transaction.crud) this.forget(op);
  }

  /**
   * Sends one op. An error with a code that is not permanent is retried with a growing wait; after maxAttempts it becomes a recorded failure ("No enviado").
   * An error without a code (network), a JWT/auth error (AUTH_ERROR_CODES), a transient server error (TRANSIENT_ERROR_CODES) or a gateway status (502/503/504)
   * is also retried with a growing wait but never counted toward giving up: offline, an expired session or an overloaded server never gives up.
   */
  private async sendLimited(op: CrudEntry): Promise<string | null> {
    // Captured before the request: a cancelWaits() while it is in flight must still abort the wait that follows.
    const signal = this.waitController.signal;
    try {
      const code = await this.send(op);
      this.forget(op);
      return code;
    } catch (error) {
      const { code, status } = error as { code?: string; status?: number };
      const neverGiveUp = !code || AUTH_ERROR_CODES.has(code) || TRANSIENT_ERROR_CODES.has(code) || GATEWAY_STATUSES.has(status ?? 0);
      const counts = neverGiveUp ? this.waits : this.attempts;
      const attempt = (counts.get(op.clientId) ?? 0) + 1;
      // The count is kept even on give-up: if a later op throws, this op gives up at once next round. uploadData clears it after complete().
      counts.set(op.clientId, attempt);
      if (!neverGiveUp && attempt >= this.maxAttempts) return code!;
      await this.sleep(Math.min(BASE_WAIT_MS * 2 ** (attempt - 1), MAX_WAIT_MS), signal);
      throw error;
    }
  }

  private forget(op: CrudEntry): void {
    this.attempts.delete(op.clientId);
    this.waits.delete(op.clientId);
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
