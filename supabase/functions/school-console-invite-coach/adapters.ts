import type { CreateOutcome, InvitationStore } from './port.ts';

// The message is typed so it can be seen and dropped: errors built here never repeat it.
export type DbError = { code?: string; message?: string };

/** The caller's own client (their JWT, never service_role), reduced to what this adapter uses; row level security decides. */
export interface Db {
  insert(table: string, row: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: DbError | null }>;
  selectOne(table: string, match: Record<string, unknown>, columns: string): Promise<{ data: Record<string, unknown> | null; error: DbError | null }>;
}

const NOT_AUTHORIZED = '42501';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

// An error carries the Postgres code and nothing else: the message of a failed call could echo an argument.
const failure = (what: string, error: DbError | null) => new Error(`${what} failed${error ? ` (${error.code ?? 'unknown'})` : ''}`);

/**
 * `public.coach_invitations`: a 42501 is the policy refusing a caller who does not administer the school; a 23505 is the pending
 * invitation that already exists; a 23514 is the email check (`email = lower(btrim(email))`) refusing an email the handler
 * lowercased differently (JavaScript and Postgres disagree on some characters, such as 'İ'): the caller's input, so bad_request.
 */
export function createInvitationStore(db: Db): InvitationStore {
  return {
    async create(schoolId, email): Promise<CreateOutcome> {
      const { data, error } = await db.insert('coach_invitations', { school_id: schoolId, email });
      if (error?.code === NOT_AUTHORIZED) return { ok: false, error: { code: 'not_authorized' } };
      if (error?.code === CHECK_VIOLATION) return { ok: false, error: { code: 'bad_request' } };
      if (error?.code === UNIQUE_VIOLATION) {
        const existing = await db.selectOne('coach_invitations', { school_id: schoolId, email, status: 'pending' }, 'id');
        if (existing.error || typeof existing.data?.id !== 'string') throw failure('Reading the pending invitation', existing.error);
        return { ok: true, value: { id: existing.data.id, schoolId, email } };
      }
      if (error || typeof data?.id !== 'string') throw failure('Creating the invitation', error);
      return { ok: true, value: { id: data.id, schoolId, email } };
    },
  };
}
