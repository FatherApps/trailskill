import type { Transaction } from '@powersync/react-native';

import { db } from './db';

// Table and column names are interpolated into SQL, so only plain snake_case names are allowed.
function assertIdentifier(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
}

function markPending(tx: Transaction, table: string, id: string) {
  return tx.execute('INSERT INTO pending_writes (id, table_name, record_id) VALUES (uuid(), ?, ?)', [table, id]);
}

// PowerSync tables are views, which report no rowsAffected: check existence with a SELECT.
async function rowExists(tx: Transaction, table: string, id: string): Promise<boolean> {
  return (await tx.getOptional(`SELECT 1 FROM ${table} WHERE id = ?`, [id])) !== null;
}

/**
 * Saves a row on the device and queues it for upload in the same transaction, so a committed write
 * survives a force-quit. Inserts a new row (generating a UUID when `id` is missing) or updates only
 * the given columns of an existing one. Returns the row id.
 */
export async function writeRecord(table: string, values: Record<string, unknown> & { id?: string }): Promise<string> {
  const { id: givenId, ...fields } = values;
  const columns = Object.keys(fields);
  assertIdentifier(table);
  columns.forEach(assertIdentifier);

  return db.writeTransaction(async (tx) => {
    const id = givenId ?? (await tx.get<{ id: string }>('SELECT uuid() AS id')).id;
    const params = columns.map((column) => fields[column]);

    if (givenId !== undefined && (await rowExists(tx, table, id))) {
      // Nothing changes, so there is nothing to upload and no marker that would never clear.
      if (columns.length === 0) return id;
      const assignments = columns.map((column) => `${column} = ?`).join(', ');
      await tx.execute(`UPDATE ${table} SET ${assignments} WHERE id = ?`, [...params, id]);
    } else {
      const placeholders = ['?', ...columns.map(() => '?')].join(', ');
      await tx.execute(`INSERT INTO ${table} (${['id', ...columns].join(', ')}) VALUES (${placeholders})`, [id, ...params]);
    }

    await markPending(tx, table, id);
    return id;
  });
}

/** Deletes a row on the device and queues the deletion for upload in the same transaction. */
export async function deleteRecord(table: string, id: string): Promise<void> {
  assertIdentifier(table);

  await db.writeTransaction(async (tx) => {
    // A missing row produces no CRUD operation, so a marker would never clear.
    if (!(await rowExists(tx, table, id))) return;
    await tx.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    await markPending(tx, table, id);
  });
}

// Columns the server fills with a default; sending an explicit null breaks `not null default` (23502).
const SERVER_ASSIGNED_COLUMNS = ['created_at', 'created_by'];

/** What a retry did: `row_missing` and `nothing_to_send` both queued nothing, for different reasons. */
export type RetryResult = 'queued' | 'row_missing' | 'nothing_to_send';

/**
 * Requeues the rejected writes of a record using the values on the device now, never the stored payloads,
 * so an old payload can never overwrite a newer edit. The user's intent decides what is queued:
 * a latest failed DELETE is retried as a DELETE even if the row came back; a missing row otherwise queues
 * nothing (sync-down may have dropped it, and the failure keeps its payload); any failed PUT requeues the
 * whole current row as a PUT (null audit columns omitted, other nulls sent), which covers later PATCHes;
 * only failed PATCHes requeue the current values of their still-existing columns.
 * `powersync_crud` is PowerSync's documented manual-queue API (raw tables); it must be verified on a device (#35).
 */
export async function retryFailedRecord(table: string, id: string): Promise<RetryResult> {
  assertIdentifier(table);

  return db.writeTransaction<RetryResult>(async (tx) => {
    // One aggregate row (a plain `get`, which every transaction supports); sorted here so the order never depends on SQLite.
    const { failures: json } = await tx.get<{ failures: string }>(
      "SELECT json_group_array(json_object('op', op, 'payload', payload, 'failed_at', failed_at, 'client_id', client_id)) AS failures FROM upload_failures WHERE table_name = ? AND record_id = ?",
      [table, id],
    );
    // PowerSync numbers ops with AUTOINCREMENT, so client_id is the real queue order when failed_at ties (null, from older rows, sorts first).
    const failures = (JSON.parse(json) as { op: string; payload: string; failed_at: string; client_id: number | null }[]).sort(
      (a, b) => a.failed_at.localeCompare(b.failed_at) || (a.client_id ?? -1) - (b.client_id ?? -1),
    );
    if (failures.length === 0) return 'nothing_to_send';

    const row = await tx.getOptional<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    let op: 'DELETE' | 'PUT' | 'PATCH';
    let data: Record<string, unknown> | undefined;

    if (failures[failures.length - 1].op === 'DELETE') {
      op = 'DELETE';
    } else if (!row) {
      return 'row_missing';
    } else {
      const { id: _id, ...values } = row;
      if (failures.some((failure) => failure.op === 'PUT')) {
        op = 'PUT';
        data = Object.fromEntries(Object.entries(values).filter(([column, value]) => value !== null || !SERVER_ASSIGNED_COLUMNS.includes(column)));
      } else {
        op = 'PATCH';
        const columns = new Set(failures.flatMap((failure) => Object.keys(JSON.parse(failure.payload))));
        data = Object.fromEntries([...columns].filter((column) => column in values).map((column) => [column, values[column]]));
        if (Object.keys(data).length === 0) return 'nothing_to_send';
      }
    }

    await tx.execute(
      data ? 'INSERT INTO powersync_crud (op, id, type, data) VALUES (?, ?, ?, ?)' : 'INSERT INTO powersync_crud (op, id, type) VALUES (?, ?, ?)',
      data ? [op, id, table, JSON.stringify(data)] : [op, id, table],
    );
    await markPending(tx, table, id);
    await tx.execute('DELETE FROM upload_failures WHERE table_name = ? AND record_id = ?', [table, id]);
    return 'queued';
  });
}
