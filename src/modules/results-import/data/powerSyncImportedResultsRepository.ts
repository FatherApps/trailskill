import { db } from '../../../core/sync';
import type { ImportedResult, ImportedResultsRepository, PendingResultChange } from './importedResults';

const resultColumns = `id, athlete_id AS athleteId, import_id AS importId, provider, source_result_key AS sourceResultKey, revision,
  supersedes_id AS supersedesId, stroke, distance, pool, hundredths, swum_on AS swumOn, competition, created_at AS createdAt`;
const changeColumns = `id, imported_result_id AS importedResultId, athlete_id AS athleteId, import_id AS importId, stroke, distance, pool,
  hundredths, swum_on AS swumOn, competition, created_at AS createdAt`;

export function createPowerSyncImportedResultsRepository(): ImportedResultsRepository {
  return {
    async listByAthlete(athleteId) {
      return db.getAll<ImportedResult>(
        `SELECT ${resultColumns} FROM imported_results r
         WHERE athlete_id = ? AND NOT EXISTS (SELECT 1 FROM imported_results s WHERE s.supersedes_id = r.id)
         ORDER BY swum_on DESC, id ASC`,
        [athleteId],
      );
    },
    async listPendingChanges(athleteId) {
      return db.getAll<PendingResultChange>(
        `SELECT ${changeColumns} FROM imported_result_changes WHERE athlete_id = ? AND status = 'pending' ORDER BY created_at ASC, id ASC`,
        [athleteId],
      );
    },
    async listAllChanges(athleteId) {
      return db.getAll<PendingResultChange>(`SELECT ${changeColumns} FROM imported_result_changes WHERE athlete_id = ? ORDER BY created_at ASC, id ASC`, [athleteId]);
    },
    async lastImportedAt(athleteId) {
      const [row] = await db.getAll<{ at: string | null }>('SELECT MAX(requested_at) AS at FROM results_imports WHERE athlete_id = ?', [athleteId]);
      return row?.at ?? null;
    },
  };
}
