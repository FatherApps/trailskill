import { db, supabase } from '../../../core/sync';

export interface AthleteResultSharingRepository {
  /** The ids of the schools the owner opened the swimmer's results to, in force now, by school id. Local database only: a withdrawn row has left it. */
  listSharedSchools(athleteId: string): Promise<string[]>;
  /**
   * The owner opens the swimmer's results to a school where the swimmer is active. Online only, and it opens the marks of every school the
   * swimmer is active in to that school. Rejects with `not_allowed` (the caller does not manage the swimmer), `not_active` (the swimmer is
   * not active in that school) or the original error, offline included. Repeating it is harmless.
   */
  grant(athleteId: string, schoolId: string): Promise<void>;
  /** The owner withdraws it. Online only. Rejects with `not_allowed` or the original error, offline included. Repeating it is harmless. */
  revoke(athleteId: string, schoolId: string): Promise<void>;
}

// The part of the Supabase client used here; tests pass a fake.
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: (Error & { code?: string }) | null }> };

// 42501: the caller does not manage the swimmer; 22023: the swimmer is not active in that school (see grant_athlete_result_sharing).
const ERROR_BY_CODE: Record<string, string> = { '42501': 'not_allowed', '22023': 'not_active' };

async function call(client: RpcClient, fn: string, athleteId: string, schoolId: string): Promise<void> {
  const { error } = await client.rpc(fn, { athlete: athleteId, school: schoolId });
  if (!error) return;
  const known = error.code ? ERROR_BY_CODE[error.code] : undefined;
  throw known ? new Error(known) : error;
}

export function createPowerSyncAthleteResultSharingRepository(client: RpcClient = supabase): AthleteResultSharingRepository {
  return {
    async listSharedSchools(athleteId) {
      const rows = await db.getAll<{ schoolId: string }>(
        'SELECT DISTINCT target_school_id AS schoolId FROM athlete_result_sharing WHERE athlete_id = ? AND revoked_at IS NULL ORDER BY target_school_id',
        [athleteId],
      );
      return rows.map((row) => row.schoolId);
    },
    grant: (athleteId, schoolId) => call(client, 'grant_athlete_result_sharing', athleteId, schoolId),
    revoke: (athleteId, schoolId) => call(client, 'revoke_athlete_result_sharing', athleteId, schoolId),
  };
}

// One row of the local table; `revokedAt` is set when the owner withdrew it, `null` while it is in force.
export type AthleteResultSharingRow = { athleteId: string; schoolId: string; revokedAt: string | null };

const bySchool = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Works on the rows it is given, so a test sees at once what the sync would bring. `managedIds` are the swimmers the caller manages, as the
// server decides it; without it every swimmer is managed.
export function createInMemoryAthleteResultSharingRepository(rows: AthleteResultSharingRow[], options: { managedIds?: string[] } = {}): AthleteResultSharingRepository {
  const check = (athleteId: string) => {
    if (options.managedIds && !options.managedIds.includes(athleteId)) throw new Error('not_allowed');
  };
  const inForce = (athleteId: string, schoolId: string) => rows.find((row) => row.athleteId === athleteId && row.schoolId === schoolId && !row.revokedAt);
  return {
    async listSharedSchools(athleteId) {
      return rows
        .filter((row) => row.athleteId === athleteId && !row.revokedAt)
        .map((row) => row.schoolId)
        .sort(bySchool);
    },
    async grant(athleteId, schoolId) {
      check(athleteId);
      if (!inForce(athleteId, schoolId)) rows.push({ athleteId, schoolId, revokedAt: null });
    },
    async revoke(athleteId, schoolId) {
      check(athleteId);
      const row = inForce(athleteId, schoolId);
      if (row) row.revokedAt = new Date().toISOString();
    },
  };
}
