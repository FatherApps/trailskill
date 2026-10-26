import { db, writeRecord } from '../../../core/sync';
import { validatedBody, type Notice, type NoticeRepository } from './notices';

type NoticeRow = {
  id: string;
  athlete_id: string;
  assignment_id: string;
  version_id: string;
  block_id: string | null;
  body: string;
  created_by: string;
  created_at: string;
};

export function createPowerSyncNoticeRepository(): NoticeRepository {
  return {
    async list(athleteId, assignmentId) {
      // julianday compares moments: synced rows may use a space instead of 'T' between date and time.
      const rows = await db.getAll<NoticeRow>(
        `SELECT id, athlete_id, assignment_id, version_id, block_id, body, created_by, created_at
         FROM training_plan_notices WHERE athlete_id = ? AND assignment_id = ? ORDER BY julianday(created_at) DESC, id DESC`,
        [athleteId, assignmentId],
      );
      return rows.map(
        (row): Notice => ({
          id: row.id,
          athleteId: row.athlete_id,
          assignmentId: row.assignment_id,
          versionId: row.version_id,
          blockId: row.block_id,
          body: row.body,
          authorId: row.created_by,
          createdAt: row.created_at,
        }),
      );
    },
    async add(notice) {
      const body = validatedBody(notice.body);
      // One row per note, with its author. The server overwrites created_at with the reception time.
      return writeRecord('training_plan_notices', {
        created_by: notice.authorId,
        created_at: notice.createdAt ?? new Date().toISOString(),
        athlete_id: notice.athleteId,
        assignment_id: notice.assignmentId,
        version_id: notice.versionId,
        block_id: notice.blockId,
        body,
      });
    },
  };
}
