import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

// Test-only: a PowerSync-like database over a real SQLite file, so a test can "restart" the app
// by opening a new instance over the same file. Plain tables stand in for PowerSync's views.

export type Statement = { sql: string; params: unknown[] };

export type FakeDatabase = ReturnType<typeof openDatabase>;

/** Creates a SQLite file with the tables the sync tests use; returns its path and a cleanup. */
export function createStore(): { path: string; remove: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'trailskill-sync-'));
  const path = join(dir, 'trailskill.db');
  const store = new DatabaseSync(path);
  store.exec(`
    CREATE TABLE athletes (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT);
    CREATE TABLE record_conflicts (id TEXT PRIMARY KEY, table_name TEXT, record_id TEXT, status TEXT);
    CREATE TABLE pending_writes (id TEXT PRIMARY KEY, table_name TEXT, record_id TEXT);
    CREATE TABLE upload_failures (
      id TEXT PRIMARY KEY, table_name TEXT, record_id TEXT, op TEXT, payload TEXT, error_code TEXT, failed_at TEXT
    );
  `);
  store.close();
  return { path, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Opens one app launch over the store. `transactions` records the statements of each write transaction. */
export function openDatabase(path: string) {
  const store = new DatabaseSync(path);
  store.function('uuid', () => randomUUID());
  const transactions: Statement[][] = [];
  const bind = (params: unknown[]) => params as SQLInputValue[];

  const context = (statements: Statement[]) => ({
    async execute(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });
      store.prepare(sql).run(...bind(params));
      return {};
    },
    async getOptional<T>(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });
      return (store.prepare(sql).get(...bind(params)) as T | undefined) ?? null;
    },
    async getAll<T>(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });
      return store.prepare(sql).all(...bind(params)) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });
      const row = store.prepare(sql).get(...bind(params));
      if (!row) throw new Error(`No row for ${sql}`);
      return row as T;
    },
  });

  return {
    transactions,
    async writeTransaction<T>(callback: (tx: ReturnType<typeof context>) => Promise<T>): Promise<T> {
      const statements: Statement[] = [];
      transactions.push(statements);
      store.exec('BEGIN');
      try {
        const result = await callback(context(statements));
        store.exec('COMMIT');
        return result;
      } catch (error) {
        store.exec('ROLLBACK');
        throw error;
      }
    },
    getAll<T>(sql: string, params: unknown[] = []): T[] {
      return store.prepare(sql).all(...bind(params)) as T[];
    },
  };
}
