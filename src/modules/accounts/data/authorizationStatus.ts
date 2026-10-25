import { db } from '../../../core/sync';

export type AuthorizationPurpose = 'record_times' | 'import_official_results' | 'share_results_with_school';

export interface AuthorizationStatusRepository {
  /** Ids of the athletes whose authorization_status row for the purpose has is_granted = 1. No row or 0 is not granted. Local database only. */
  listGrantedAthleteIds(purpose: AuthorizationPurpose): Promise<string[]>;
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
  };
}

export type AuthorizationStatusRow = { athleteId: string; purpose: AuthorizationPurpose; isGranted: boolean };

export function createInMemoryAuthorizationStatusRepository(rows: AuthorizationStatusRow[]): AuthorizationStatusRepository {
  return {
    async listGrantedAthleteIds(purpose) {
      const granted = rows.filter((row) => row.purpose === purpose && row.isGranted).map((row) => row.athleteId);
      return [...new Set(granted)].sort();
    },
  };
}
