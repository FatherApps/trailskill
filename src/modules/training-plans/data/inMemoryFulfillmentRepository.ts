import { currentMarks, validatedCount, type FulfillmentMark, type FulfillmentRepository } from './fulfillment';

export function createInMemoryFulfillmentRepository(): FulfillmentRepository {
  const stored: FulfillmentMark[] = [];
  return {
    async list(assignmentId) {
      const ofAssignment = stored.filter((mark) => mark.assignmentId === assignmentId);
      return currentMarks(ofAssignment.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id))).map((mark) => ({ ...mark }));
    },
    async mark(mark) {
      const completedRepetitions = validatedCount(mark);
      const id = `mark-${stored.length + 1}`;
      stored.push({ ...mark, id, completedRepetitions, seriesId: mark.seriesId ?? null, capturedAt: mark.capturedAt ?? new Date().toISOString() });
      return id;
    },
  };
}
