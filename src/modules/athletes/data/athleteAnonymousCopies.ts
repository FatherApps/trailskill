import { supabase } from '../../../core/sync';

/** What the server answers to «copy this swimmer» (see create_anonymous_school_copy). */
export type AnonymousCopyResult = {
  status: 'created' | 'already_copied';
  /** The anonymous swimmer. */
  athleteId: string;
  /** It carries the recovery identity of the swimmer, so the family can relink it. False until the owner issues their code. */
  linkable: boolean;
  /** How many marks were copied (0 when it already existed). */
  copied: number;
};

/** An anonymous swimmer of a school, as its admins see it: never a name, a code or an identity. */
export type AnonymousCopy = { athleteId: string; createdAt: string; linkable: boolean; timesCount: number };

/**
 * The school's anonymous copies of its swimmers (issue 1420, listed in 1421). Online only: nothing is stored on the device. Every method
 * rejects with `not_allowed` when the server refuses the caller (not an active admin of the school), `no_school_access` (the school no
 * longer reads the swimmer), `already_anonymous` (the swimmer is itself a copy) or the original error for anything else, offline included.
 */
export interface AthleteAnonymousCopyRepository {
  /** An active admin copies the marks the school reads of a swimmer into an anonymous swimmer. Asking again for the same swimmer copies nothing more. */
  create(athleteId: string, schoolId: string): Promise<AnonymousCopyResult>;
  /** The anonymous swimmers of a school, newest first. */
  list(schoolId: string): Promise<AnonymousCopy[]>;
}

// The part of the Supabase client used here; tests pass a fake.
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: (Error & { code?: string }) | null }> };

const RAISED = ['no_school_access', 'already_anonymous'];

// 42501: the database refused the caller. P0001 carries the name of the rule in its message.
function fail(error: Error & { code?: string }): never {
  if (error.code === '42501') throw new Error('not_allowed');
  throw RAISED.includes(error.message) ? new Error(error.message) : error;
}

type CopyRow = { athlete_id: string; created_at: string; linkable: boolean; times_count: number };

export function createSupabaseAthleteAnonymousCopyRepository(client: RpcClient = supabase): AthleteAnonymousCopyRepository {
  return {
    async create(athleteId, schoolId) {
      const { data, error } = await client.rpc('create_anonymous_school_copy', { p_athlete: athleteId, p_school: schoolId });
      if (error) fail(error);
      const row = data as { status: AnonymousCopyResult['status']; athlete_id: string; linkable: boolean; copied: number };
      return { status: row.status, athleteId: row.athlete_id, linkable: row.linkable, copied: row.copied };
    },
    async list(schoolId) {
      const { data, error } = await client.rpc('school_anonymous_copies', { p_school: schoolId });
      if (error) fail(error);
      return ((data ?? []) as CopyRow[]).map((r) => ({ athleteId: r.athlete_id, createdAt: r.created_at, linkable: r.linkable, timesCount: r.times_count }));
    },
  };
}
