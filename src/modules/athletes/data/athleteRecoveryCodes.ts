import { supabase } from '../../../core/sync';

/** The texts the server hands over once: the permanent code and the 8 recovery codes. The server only keeps their hashes. */
export type RecoveryCodes = { mainCode: string; recoveryCodes: string[] };

export interface AthleteRecoveryCodeRepository {
  /**
   * Asks the server for the permanent code and the 8 recovery codes of a swimmer the caller manages. Online only. Returns `null` when the
   * owner already confirmed them (the server never gives the texts again). While not confirmed, asking again replaces the whole set.
   * Rejects with `not_allowed` (the caller does not manage the swimmer) or the original error, offline included.
   */
  issue(athleteId: string): Promise<RecoveryCodes | null>;
  /** The owner saved the texts: from now on they cannot be issued again. Repeating it is harmless. Rejects with `no_recovery_identity` or the original error. */
  confirm(athleteId: string): Promise<void>;
  /** A new set of 8 recovery codes, once one of the current set was used. Rejects with `no_recovery_code_used`, `no_recovery_identity`, `not_allowed` or the original error. */
  regenerate(athleteId: string): Promise<string[]>;
}

// The part of the Supabase client used here; tests pass a fake.
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: (Error & { code?: string }) | null }> };

// 42501: the database refused the caller; P0001 carries the reason in its message (see the recovery code functions).
function failure(error: Error & { code?: string }): Error {
  if (error.code === '42501') return new Error('not_allowed');
  if (error.code === 'P0001' && (error.message === 'no_recovery_identity' || error.message === 'no_recovery_code_used')) return new Error(error.message);
  return error;
}

const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

export function createSupabaseAthleteRecoveryCodeRepository(client: RpcClient = supabase): AthleteRecoveryCodeRepository {
  return {
    async issue(athleteId) {
      const { data, error } = await client.rpc('issue_athlete_recovery_code', { athlete: athleteId });
      if (error) throw failure(error);
      const row = Array.isArray(data) ? (data[0] as { main_code?: unknown; recovery_codes?: unknown } | undefined) : undefined;
      if (!row) return null;
      if (typeof row.main_code !== 'string' || !isTexts(row.recovery_codes)) throw new Error('unexpected_recovery_codes_answer');
      return { mainCode: row.main_code, recoveryCodes: row.recovery_codes };
    },
    async confirm(athleteId) {
      const { error } = await client.rpc('confirm_athlete_recovery_codes', { athlete: athleteId });
      if (error) throw failure(error);
    },
    async regenerate(athleteId) {
      const { data, error } = await client.rpc('regenerate_athlete_recovery_codes', { athlete: athleteId });
      if (error) throw failure(error);
      if (!isTexts(data)) throw new Error('unexpected_recovery_codes_answer');
      return data;
    },
  };
}

// Counts the calls so a test can prove the server is asked once; `used` are the swimmers with a recovery code already used.
// Synthetic texts only. `managedIds` are the swimmers the caller manages, as the server decides it.
export function createInMemoryAthleteRecoveryCodeRepository(managedIds: string[]): AthleteRecoveryCodeRepository & {
  calls: { issue: number; confirm: number; regenerate: number };
  used: Set<string>;
  confirmed: Set<string>;
} {
  const calls = { issue: 0, confirm: 0, regenerate: 0 };
  const used = new Set<string>();
  const confirmed = new Set<string>();
  const issued = new Set<string>();
  let sets = 0;
  const allowed = (athleteId: string) => {
    if (!managedIds.includes(athleteId)) throw new Error('not_allowed');
  };
  const set = () => {
    sets += 1;
    return Array.from({ length: 8 }, (_, index) => `RC-TEST-${sets}-000${index + 1}`);
  };
  return {
    calls,
    used,
    confirmed,
    async issue(athleteId) {
      calls.issue += 1;
      allowed(athleteId);
      if (confirmed.has(athleteId)) return null;
      issued.add(athleteId);
      return { mainCode: `TR-TEST-${athleteId}`, recoveryCodes: set() };
    },
    async confirm(athleteId) {
      calls.confirm += 1;
      allowed(athleteId);
      if (!issued.has(athleteId)) throw new Error('no_recovery_identity');
      confirmed.add(athleteId);
    },
    async regenerate(athleteId) {
      calls.regenerate += 1;
      allowed(athleteId);
      if (!issued.has(athleteId)) throw new Error('no_recovery_identity');
      if (!used.has(athleteId)) throw new Error('no_recovery_code_used');
      used.delete(athleteId);
      return set();
    },
  };
}
