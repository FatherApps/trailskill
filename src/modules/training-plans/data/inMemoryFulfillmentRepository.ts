import type { BlockRecording } from '../types';
import { checkSeriesLink, currentMarks, validatedCount, type FulfillmentMark, type FulfillmentRepository } from './fulfillment';

/** What the local database knows, to check a mark's series; a series is refused when it is not listed here. */
export type FulfillmentLookups = {
  recordings?: Record<string, BlockRecording>;
  assignmentSchools?: Record<string, string>;
  seriesSchools?: Record<string, string>;
};

export function createInMemoryFulfillmentRepository(lookups: FulfillmentLookups = {}): FulfillmentRepository {
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
      const id = `mark-${stored.length + 1}`;
      stored.push({ ...mark, id, completedRepetitions, seriesId: mark.seriesId ?? null, capturedAt: mark.capturedAt ?? new Date().toISOString() });
      return id;
    },
  };
}
