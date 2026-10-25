import type { BlockStatus } from '../types';

export type FulfillmentMark = {
  id: string;
  assignmentId: string;
  versionId: string;
  blockId: string;
  athleteId: string;
  status: BlockStatus;
  // Only for 'partial'; null for every other status, never zero.
  completedRepetitions: number | null;
  // The series whose arrivals are the times of a timed block; null until a series is linked.
  seriesId: string | null;
  authorId: string;
  deviceId: string;
  capturedAt: string;
};

export type NewFulfillmentMark = Pick<FulfillmentMark, 'assignmentId' | 'versionId' | 'blockId' | 'athleteId' | 'status' | 'authorId' | 'deviceId'> & {
  completedRepetitions?: number;
  seriesId?: string;
  // Device time of the mark; now when omitted.
  capturedAt?: string;
};

export interface FulfillmentRepository {
  /** The current mark of each cell of the assignment: the latest one per athlete and block. A cell never marked has none. */
  list(assignmentId: string): Promise<FulfillmentMark[]>;
  /**
   * Saves a mark on the device and queues it for upload; it never waits for the network. Marks are append-only: a new mark of a cell
   * replaces the previous one as the current one, and marks of different cells never touch each other. Returns the mark id.
   * Rejects with InvalidFulfillmentError, writing nothing, when a 'partial' mark has no count of at least 1.
   */
  mark(mark: NewFulfillmentMark): Promise<string>;
}

/** A mark that the database would refuse for good, so nothing was written. */
export class InvalidFulfillmentError extends Error {
  constructor(reason: string) {
    super(`Invalid fulfillment mark: ${reason}`);
    this.name = 'InvalidFulfillmentError';
  }
}

/** The count to store: required and at least 1 for 'partial', none for any other status. Both repositories call it before writing. */
export function validatedCount({ status, completedRepetitions }: NewFulfillmentMark): number | null {
  if (status !== 'partial') return null;
  if (!Number.isInteger(completedRepetitions) || completedRepetitions! < 1) throw new InvalidFulfillmentError('a partial mark needs a count of at least 1');
  return completedRepetitions!;
}

/** The latest mark of each cell, from marks listed oldest first. */
export function currentMarks(oldestFirst: FulfillmentMark[]): FulfillmentMark[] {
  const byCell = new Map<string, FulfillmentMark>();
  for (const mark of oldestFirst) byCell.set(`${mark.athleteId}:${mark.blockId}`, mark);
  return [...byCell.values()];
}
