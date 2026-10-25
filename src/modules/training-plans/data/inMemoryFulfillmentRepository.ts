import type { BlockRecording } from '../types';
import type { InMemoryTrainingPlanRepository } from './inMemoryTrainingPlanRepository';
import { checkSeriesLink, currentMarks, validatedCount, type FulfillmentMark, type FulfillmentRepository } from './fulfillment';

/** What the local database knows, to check a mark's series; a value not listed here is unknown and lets the mark through. */
export type FulfillmentLookups = {
  recordings?: Record<string, BlockRecording>;
  assignmentSchools?: Record<string, string>;
  seriesSchools?: Record<string, string>;
};

// With the plan repository, the sessions that get a mark are known to it, so saving the plan keeps their version.
export function createInMemoryFulfillmentRepository(lookups: FulfillmentLookups = {}, plans?: InMemoryTrainingPlanRepository): FulfillmentRepository {
  const stored: FulfillmentMark[] = [];
  return {
    async list(assignmentId) {
      const ofAssignment = stored.filter((mark) => mark.assignmentId === assignmentId);
      return currentMarks(ofAssignment.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id))).map((mark) => ({ ...mark }));
    },
    async mark(mark) {
      const completedRepetitions = validatedCount(mark);
      if (mark.seriesId) {
        checkSeriesLink({
          recording: lookups.recordings?.[mark.blockId],
          assignmentSchoolId: lookups.assignmentSchools?.[mark.assignmentId],
          seriesSchoolId: lookups.seriesSchools?.[mark.seriesId],
        });
      }
      plans?.store.marked.add(mark.assignmentId);
      const id = `mark-${stored.length + 1}`;
      stored.push({ ...mark, id, completedRepetitions, seriesId: mark.seriesId ?? null, capturedAt: mark.capturedAt ?? new Date().toISOString() });
      return id;
    },
  };
}
