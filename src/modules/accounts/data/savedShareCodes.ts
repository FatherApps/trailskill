import { db, supabase } from '../../../core/sync';

/**
 * A share code another family gave this person, kept once that family accepted a time sent with it (issue 1302), so the next send can
 * pick it instead of asking again. The server keeps it and removes it, for everyone, as soon as the family changes the code. Only
 * what the person already had comes with it: the code and the swimmer's short name ("Ana M.").
 * When the family changes the code the row stays with `expiredAt` set (issue 1320): the person sees it expired and asks for the new
 * one. It is null while the code is current.
 */
export type SavedShareCode = { id: string; code: string; athleteShortName: string; savedAt: string; expiredAt: string | null };

export interface SavedShareCodeRepository {
  /**
   * This person's kept codes, most recently kept first. Without `includeExpired` only the current ones come back, so a screen that does
   * not know about expired codes (the send picker today) never offers a dead code as a normal one; the screen that shows them asks for them.
   */
  list(userId: string, options?: { includeExpired?: boolean }): Promise<SavedShareCode[]>;
  /** Online: stops keeping a code ("Quitar"). It leaves the phone with the next sync. */
  forget(id: string): Promise<void>;
}

type Row = { id: string; code: string; athlete_short_name: string; saved_at: string; expired_at?: string | null };

// The rows reach the phone by sync (saved_athlete_share_codes); only the server functions write them.
export function createPowerSyncSavedShareCodeRepository(): SavedShareCodeRepository {
  return {
    async list(userId, { includeExpired = false } = {}) {
      const rows = await db.getAll<Row>(
        `SELECT id, code, athlete_short_name, saved_at, expired_at FROM saved_athlete_share_codes WHERE user_id = ?${includeExpired ? '' : ' AND expired_at IS NULL'} ORDER BY saved_at DESC, id`,
        [userId],
      );
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        athleteShortName: row.athlete_short_name,
        savedAt: row.saved_at,
        expiredAt: row.expired_at ?? null,
      }));
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
    async list(userId, { includeExpired = false } = {}) {
      return rows
        .filter((row) => row.userId === userId && (includeExpired || !row.expiredAt))
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
