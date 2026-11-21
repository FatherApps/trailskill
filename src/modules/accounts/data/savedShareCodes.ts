import { db, supabase } from '../../../core/sync';

/**
 * A share code another family gave this person, kept once that family accepted a time sent with it (#1302), so the next send can
 * pick it instead of asking again. The server keeps it and removes it, for everyone, as soon as the family changes the code. Only
 * what the person already had comes with it: the code and the swimmer's short name ("Ana M.").
 */
export type SavedShareCode = { id: string; code: string; athleteShortName: string; savedAt: string };

export interface SavedShareCodeRepository {
  /** This person's kept codes, most recently kept first. */
  list(userId: string): Promise<SavedShareCode[]>;
  /** Online: stops keeping a code ("Quitar"). It leaves the phone with the next sync. */
  forget(id: string): Promise<void>;
}

type Row = { id: string; code: string; athlete_short_name: string; saved_at: string };

// The rows reach the phone by sync (saved_athlete_share_codes); only the server functions write them.
export function createPowerSyncSavedShareCodeRepository(): SavedShareCodeRepository {
  return {
    async list(userId) {
      const rows = await db.getAll<Row>(
        'SELECT id, code, athlete_short_name, saved_at FROM saved_athlete_share_codes WHERE user_id = ? ORDER BY saved_at DESC, id',
        [userId],
      );
      return rows.map((row) => ({ id: row.id, code: row.code, athleteShortName: row.athlete_short_name, savedAt: row.saved_at }));
    },
    async forget(id) {
      const { error } = await supabase.rpc('forget_saved_athlete_share_code', { saved: id });
      if (error) throw error;
    },
  };
}

// For tests and the gallery.
export function createInMemorySavedShareCodeRepository(seed: (SavedShareCode & { userId: string })[] = [], options: { failing?: boolean } = {}) {
  const rows = [...seed];
  const repository: SavedShareCodeRepository & { rows: typeof rows } = {
    rows,
    async list(userId) {
      return rows
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id))
        .map(({ userId: _owner, ...saved }) => saved);
    },
    async forget(id) {
      if (options.failing) throw new Error('no signal');
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
  };
  return repository;
}
