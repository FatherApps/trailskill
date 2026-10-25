import { db, writeBatch } from '../../../core/sync';
import {
  PlanNotAssignableError,
  targetColumns,
  validateSessionDate,
  type Assignment,
  type AssignmentRepository,
  type AssignmentTarget,
} from './assignments';
import { latestVersionId } from './powerSyncTrainingPlanRepository';

type AssignmentRow = {
  id: string;
  school_id: string;
  plan_id: string;
  version_id: string;
  session_date: string;
  target: AssignmentTarget['kind'];
  athlete_id: string | null;
  group_id: string | null;
  category_id: string | null;
};

// Rows are trusted: the server checks that exactly the column of the target is set.
function toTarget(row: AssignmentRow): AssignmentTarget {
  switch (row.target) {
    case 'athlete':
      return { kind: 'athlete', athleteId: row.athlete_id! };
    case 'group':
      return { kind: 'group', groupId: row.group_id! };
    case 'category':
      return { kind: 'category', categoryId: row.category_id! };
    case 'school':
      return { kind: 'school' };
  }
}

export function createPowerSyncAssignmentRepository(): AssignmentRepository {
  return {
    async list(schoolId, sessionDate) {
      const rows = await db.getAll<AssignmentRow>(
        `SELECT id, school_id, plan_id, version_id, session_date, target, athlete_id, group_id, category_id
         FROM training_plan_assignments WHERE school_id = ? AND session_date = ? AND withdrawn_at IS NULL ORDER BY created_at, id`,
        [schoolId, sessionDate],
      );
      return rows.map(
        (row): Assignment => ({
          id: row.id,
          schoolId: row.school_id,
          planId: row.plan_id,
          versionId: row.version_id,
          sessionDate: row.session_date,
          target: toTarget(row),
        }),
      );
    },
    async create({ schoolId, planId, sessionDate, target }) {
      validateSessionDate(sessionDate);
      // Reads and write share one transaction, so the version chosen is the one the row is saved with.
      return writeBatch(async (batch) => {
        const [plan] = await batch.getAll<{ id: string }>('SELECT id FROM training_plans WHERE id = ? AND school_id = ?', [planId, schoolId]);
        const versionId = plan ? await latestVersionId(batch, planId) : null;
        if (!versionId) throw new PlanNotAssignableError(planId);
        return batch.write('training_plan_assignments', {
          school_id: schoolId,
          plan_id: planId,
          version_id: versionId,
          session_date: sessionDate,
          ...targetColumns(target),
        });
      });
    },
    withdraw(id) {
      // One transaction: writing alone would INSERT a broken row for an id that is not here. Only withdrawn_at is sent; the server sets withdrawn_by.
      return writeBatch(async (batch) => {
        const [row] = await batch.getAll<{ withdrawn_at: string | null }>('SELECT withdrawn_at FROM training_plan_assignments WHERE id = ?', [id]);
        if (!row) throw new Error(`Cannot withdraw assignment ${id}: it is not on this device`);
        if (row.withdrawn_at !== null) return;
        await batch.write('training_plan_assignments', { id, withdrawn_at: new Date().toISOString() });
      });
    },
  };
}
