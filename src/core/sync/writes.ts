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

/**
 * Requeues the last rejected write of a record using the values on the device now, never the stored payload,
 * so an old payload can never overwrite a newer edit. `powersync_crud` is PowerSync's documented manual-queue
 * API (raw tables); it must be verified on a device (#35).
 */
export async function retryFailedRecord(table: string, id: string): Promise<void> {
  assertIdentifier(table);

  await db.writeTransaction(async (tx) => {
    const failure = await tx.getOptional<{ op: string; payload: string }>(
      'SELECT op, payload FROM upload_failures WHERE table_name = ? AND record_id = ? ORDER BY failed_at DESC LIMIT 1',
      [table, id],
    );
    if (!failure) return;

    const row = await tx.getOptional<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!row) {
      await tx.execute('INSERT INTO powersync_crud (op, id, type) VALUES (?, ?, ?)', ['DELETE', id, table]);
    } else {
      const { id: _id, ...values } = row;
      const patch = failure.op === 'PATCH';
      // Only the columns the failed PATCH carried, taken from the current row.
      const data = patch
        ? Object.fromEntries(Object.keys(JSON.parse(failure.payload)).filter((column) => column in values).map((column) => [column, values[column]]))
        : // A PUT omits null columns so the server applies its defaults, like the original insert; an explicit null breaks not-null defaults (23502).
          Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null));
      await tx.execute('INSERT INTO powersync_crud (op, id, type, data) VALUES (?, ?, ?, ?)', [
        patch ? 'PATCH' : 'PUT',
        id,
        table,
        JSON.stringify(data),
      ]);
    }

    await markPending(tx, table, id);
    await tx.execute('DELETE FROM upload_failures WHERE table_name = ? AND record_id = ?', [table, id]);
  });
}
