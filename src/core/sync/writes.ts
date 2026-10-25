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
