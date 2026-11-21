import { db } from '../../../core/sync';
import { toCatalogEntry, type TournamentCatalogEntry, type TournamentCatalogRepository } from './tournamentCatalog';

const columns = `id, organization_id AS organizationId, year, date_key AS dateKey, name, city, discipline, course, source_url AS sourceUrl,
  refreshed_at AS refreshedAt`;

export function createPowerSyncTournamentCatalogRepository(): TournamentCatalogRepository {
  return {
    async list() {
      const rows = await db.getAll<TournamentCatalogEntry>(`SELECT ${columns} FROM results_import_tournaments ORDER BY date_key DESC, id ASC`);
      return rows.flatMap((row) => toCatalogEntry(row) ?? []);
    },
  };
}
