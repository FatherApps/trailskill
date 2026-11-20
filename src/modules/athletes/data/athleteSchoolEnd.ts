import { supabase } from '../../../core/sync';
import type { AthleteSchoolRow } from './athleteSchools';

export interface AthleteSchoolEndRepository {
  /**
   * A school ends the link of a swimmer with it (the «baja»). Deletes nothing and has no undo. Online only: the server checks that the
   * caller is an active admin of that school. Rejects with `not_allowed` (not an admin of the school), `not_enrolled` (the swimmer is not
   * in that school) or the original error for anything else, offline included. Repeating it is harmless.
   */
  endLink(athleteId: string, schoolId: string): Promise<void>;
}

// The part of the Supabase client used here; tests pass a fake.
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: (Error & { code?: string }) | null }> };

// 42501: the database refused the caller; P0002: no such link (see end_athlete_school).
const ERROR_BY_CODE: Record<string, string> = { '42501': 'not_allowed', P0002: 'not_enrolled' };

export function createSupabaseAthleteSchoolEndRepository(client: RpcClient = supabase): AthleteSchoolEndRepository {
  return {
    async endLink(athleteId, schoolId) {
      const { error } = await client.rpc('end_athlete_school', { athlete: athleteId, school: schoolId });
      if (!error) return;
      const known = error.code ? ERROR_BY_CODE[error.code] : undefined;
      throw known ? new Error(known) : error;
    },
  };
}

// Ends the link on the rows it is given, so an in-memory AthleteSchoolRepository over the same array sees it. `adminSchoolIds` are the
// schools the caller administers, as the server decides it.
export function createInMemoryAthleteSchoolEndRepository(rows: AthleteSchoolRow[], adminSchoolIds: string[]): AthleteSchoolEndRepository {
  return {
    async endLink(athleteId, schoolId) {
      if (!adminSchoolIds.includes(schoolId)) throw new Error('not_allowed');
      const row = rows.find((candidate) => candidate.athleteId === athleteId && candidate.schoolId === schoolId);
      if (!row) throw new Error('not_enrolled');
      row.endedAt ??= new Date().toISOString();
    },
  };
}
