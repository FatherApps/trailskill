import type { AccountDeletionStore, BlockingSchool, CancelResult, ConfirmResult, RequestResult } from './port.ts';

/** The service-role client, reduced to calling a database function. The message is typed so it can be seen and dropped: errors built here never repeat it. */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

// An error carries the Postgres code and nothing else: the message of a failed call could echo an argument.
const failure = (fn: string, error: { code?: string } | null) => new Error(`Calling ${fn} failed (${error?.code ?? 'unknown'})`);
const malformed = (fn: string) => new Error(`Calling ${fn} failed (malformed)`);

const REASONS = ['school', 'platform_admin'] as const;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value !== '';

const schoolsOf = (value: unknown): BlockingSchool[] | null => {
  if (!Array.isArray(value)) return null;
  const schools: BlockingSchool[] = [];
  for (const school of value) {
    if (!isRecord(school) || !text(school.id) || typeof school.name !== 'string') return null;
    schools.push({ id: school.id, name: school.name });
  }
  return schools;
};

/** The three account-deletion functions of the database, called as service role for the user the handler authenticated. Anything unknown or malformed throws. */
export function createAccountDeletionStore(rpc: Rpc): AccountDeletionStore {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await rpc(fn, args);
    if (error) throw failure(fn, error);
    if (!isRecord(data)) throw malformed(fn);
    return data;
  };
  const blocked = (fn: string, data: Record<string, unknown>) => {
    const schools = schoolsOf(data.schools);
    const reason = REASONS.find((r) => r === data.reason);
    if (!reason || !schools) throw malformed(fn);
    return { status: 'blocked' as const, reason, schools };
  };
  return {
    async request(userId): Promise<RequestResult> {
      const fn = 'request_account_deletion';
      const data = await call(fn, { p_user_id: userId });
      switch (data.status) {
        case 'code_issued':
          if (!text(data.code) || !text(data.email)) throw malformed(fn);
          return { status: 'code_issued', code: data.code, email: data.email };
        case 'blocked':
          return blocked(fn, data);
        case 'rate_limited':
          return { status: 'rate_limited' };
        case 'already_marked':
          if (!text(data.delete_after)) throw malformed(fn);
          return { status: 'already_marked', deleteAfter: data.delete_after };
        default:
          throw malformed(fn);
      }
    },
    async confirm(userId, code): Promise<ConfirmResult> {
      const fn = 'confirm_account_deletion';
      const data = await call(fn, { p_user_id: userId, p_code: code });
      switch (data.status) {
        case 'marked':
          if (!text(data.delete_after) || !text(data.email)) throw malformed(fn);
          return { status: 'marked', deleteAfter: data.delete_after, email: data.email };
        case 'blocked':
          return blocked(fn, data);
        case 'invalid_code':
        case 'code_expired':
        case 'too_many_attempts':
          return { status: data.status };
        case 'already_marked':
          if (!text(data.delete_after)) throw malformed(fn);
          return { status: 'already_marked', deleteAfter: data.delete_after };
        default:
          throw malformed(fn);
      }
    },
    async cancel(userId): Promise<CancelResult> {
      const fn = 'cancel_account_deletion';
      const data = await call(fn, { p_user_id: userId });
      if (data.status !== 'cancelled' && data.status !== 'not_marked') throw malformed(fn);
      return { status: data.status };
    },
  };
}
