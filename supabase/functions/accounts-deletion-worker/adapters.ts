import type { Rpc } from '../accounts-delete-account/adapters.ts';
import type { DueMail, EraseStatus, MailKind, WorkerStore } from './port.ts';

// An error carries the Postgres code and nothing else: the message of a failed call could echo an argument.
const failure = (fn: string, code?: string) => new Error(`Calling ${fn} failed (${code ?? 'unknown'})`);
const malformed = (fn: string) => failure(fn, 'malformed');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value !== '';
const KINDS: readonly string[] = ['reminder', 'deleted', 'stopped'];
const ERASE: readonly string[] = ['deleted', 'stopped', 'skipped'];

/** The worker functions of the database, called as service role. Anything unknown or malformed throws. */
export function createWorkerStore(rpc: Rpc): WorkerStore {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await rpc(fn, args);
    if (error) throw failure(fn, error.code);
    return data;
  };
  return {
    async listDue(now, limit) {
      const fn = 'list_due_account_deletions';
      const data = await call(fn, { p_now: now.toISOString(), p_limit: limit });
      if (!Array.isArray(data) || !data.every(text)) throw malformed(fn);
      return data;
    },
    async erase(requestId, now): Promise<EraseStatus> {
      const fn = 'erase_account';
      const data = await call(fn, { p_request_id: requestId, p_now: now.toISOString() });
      if (!isRecord(data) || typeof data.status !== 'string' || !ERASE.includes(data.status)) throw malformed(fn);
      return data.status as EraseStatus;
    },
    async claimMail(now, limit): Promise<DueMail[]> {
      const fn = 'claim_account_deletion_mail';
      const data = await call(fn, { p_now: now.toISOString(), p_limit: limit });
      if (!Array.isArray(data)) throw malformed(fn);
      return data.map((row) => {
        if (!isRecord(row) || !text(row.request_id) || !text(row.kind) || !KINDS.includes(row.kind) || !text(row.email) || !text(row.delete_after)) throw malformed(fn);
        if (!Array.isArray(row.former_athlete_keys) || !row.former_athlete_keys.every(text)) throw malformed(fn);
        return { requestId: row.request_id, kind: row.kind as MailKind, email: row.email, deleteAfter: row.delete_after, formerAthleteKeys: row.former_athlete_keys };
      });
    },
    async finishMail(requestId, kind) {
      const fn = 'finish_account_deletion_mail';
      const data = await call(fn, { p_request_id: requestId, p_kind: kind });
      if (!isRecord(data) || data.status !== 'ok') throw malformed(fn);
    },
  };
}
