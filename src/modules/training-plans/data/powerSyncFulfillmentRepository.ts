import { db, writeRecord } from '../../../core/sync';
import type { BlockRecording, BlockStatus } from '../types';
import { checkSeriesLink, currentMarks, validatedCount, type FulfillmentMark, type FulfillmentRepository } from './fulfillment';

type MarkRow = {
  id: string;
  assignment_id: string;
  version_id: string;
  block_id: string;
  athlete_id: string;
  status: BlockStatus;
  completed_repetitions: number | null;
  series_id: string | null;
  created_by: string;
  device_id: string;
  captured_at: string;
};

export function createPowerSyncFulfillmentRepository(): FulfillmentRepository {
  return {
    async list(assignmentId) {
      // julianday compares moments: synced rows may use a space instead of 'T' between date and time. A hidden mark (set by the server
      // after a record_times withdrawal) is not shown; hidden is NULL on a mark the server has not answered yet.
      const rows = await db.getAll<MarkRow>(
        `SELECT id, assignment_id, version_id, block_id, athlete_id, status, completed_repetitions, series_id, created_by, device_id, captured_at
         FROM training_plan_fulfillments WHERE assignment_id = ? AND COALESCE(hidden, 0) = 0 ORDER BY julianday(captured_at), id`,
        [assignmentId],
      );
      return currentMarks(
        rows.map(
          (row): FulfillmentMark => ({
            id: row.id,
            assignmentId: row.assignment_id,
            versionId: row.version_id,
            blockId: row.block_id,
            athleteId: row.athlete_id,
            status: row.status,
            completedRepetitions: row.completed_repetitions,
            seriesId: row.series_id,
            authorId: row.created_by,
            deviceId: row.device_id,
            capturedAt: row.captured_at,
          }),
        ),
      );
    },
    async mark(mark) {
      const completedRepetitions = validatedCount(mark);
      if (mark.seriesId) {
        const [link] = await db.getAll<{ recording: BlockRecording | null; assignment_school: string | null; series_school: string | null }>(
          `SELECT (SELECT recording FROM training_plan_blocks WHERE id = ?) AS recording,
                  (SELECT school_id FROM training_plan_assignments WHERE id = ?) AS assignment_school,
                  (SELECT school_id FROM timing_series WHERE id = ?) AS series_school`,
          [mark.blockId, mark.assignmentId, mark.seriesId],
        );
        checkSeriesLink({ recording: link?.recording, assignmentSchoolId: link?.assignment_school, seriesSchoolId: link?.series_school });
      }
      // One row per mark, with its author and device. The server sets created_at and hidden.
      return writeRecord('training_plan_fulfillments', {
        created_by: mark.authorId,
        device_id: mark.deviceId,
        assignment_id: mark.assignmentId,
        version_id: mark.versionId,
        block_id: mark.blockId,
        athlete_id: mark.athleteId,
        status: mark.status,
        completed_repetitions: completedRepetitions,
        series_id: mark.seriesId ?? null,
        captured_at: mark.capturedAt ?? new Date().toISOString(),
      });
    },
  };
}
