import { db } from '../../../core/sync';

export type AuthorizationPurpose = 'record_times' | 'import_official_results' | 'share_results_with_school';

export interface AuthorizationStatusRepository {
  /** Ids of the athletes whose authorization_status row for the purpose has is_granted = 1. No row or 0 is not granted. Local database only. */
  listGrantedAthleteIds(purpose: AuthorizationPurpose): Promise<string[]>;
  /** Every authorization_status row of the athletes, any purpose. A purpose without a row has never been answered. Local database only. */
  listStatuses(athleteIds: readonly string[]): Promise<AuthorizationStatusRow[]>;
}

export function createPowerSyncAuthorizationStatusRepository(): AuthorizationStatusRepository {
  return {
    async listGrantedAthleteIds(purpose) {
      const rows = await db.getAll<{ athlete_id: string }>(
        'SELECT DISTINCT athlete_id FROM authorization_status WHERE purpose = ? AND is_granted = 1 ORDER BY athlete_id',
        [purpose],
      );
      return rows.map((row) => row.athlete_id);
    },
    async listStatuses(athleteIds) {
      const rows = await db.getAll<{ athlete_id: string; purpose: AuthorizationPurpose; is_granted: number }>(
        'SELECT athlete_id, purpose, is_granted FROM authorization_status WHERE athlete_id IN (SELECT value FROM json_each(?))',
        [JSON.stringify(athleteIds)],
      );
      return rows.map((row) => ({ athleteId: row.athlete_id, purpose: row.purpose, isGranted: row.is_granted === 1 }));
    },
  };
}

export type AuthorizationStatusRow = { athleteId: string; purpose: AuthorizationPurpose; isGranted: boolean };

export function createInMemoryAuthorizationStatusRepository(rows: AuthorizationStatusRow[]): AuthorizationStatusRepository {
  return {
    async listGrantedAthleteIds(purpose) {
      const granted = rows.filter((row) => row.purpose === purpose && row.isGranted).map((row) => row.athleteId);
      return [...new Set(granted)].sort();
    },
    async listStatuses(athleteIds) {
      return rows.filter((row) => athleteIds.includes(row.athleteId)).map((row) => ({ ...row }));
    },
  };
}
