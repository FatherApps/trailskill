export type Notice = {
  id: string;
  athleteId: string;
  assignmentId: string;
  versionId: string;
  // null: a note about the whole plan. The server may also null it later when the block is deleted.
  blockId: string | null;
  body: string;
  authorId: string;
  // ISO 8601; the device time until the server sets its own.
  createdAt: string;
};

export type NewNotice = Pick<Notice, 'athleteId' | 'assignmentId' | 'versionId' | 'blockId' | 'body' | 'authorId'> & {
  // Device time of the note; now when omitted.
  createdAt?: string;
};

export interface NoticeRepository {
  /** The notes of the athlete about the assignment's plan, newest first. Local database only. */
  list(athleteId: string, assignmentId: string): Promise<Notice[]>;
  /**
   * Saves a note on the device and queues it for upload; it never waits for the network. Notes are append-only: they are never edited or deleted.
   * Rejects with InvalidNoticeError, writing nothing, when the trimmed body is empty or longer than MAX_NOTICE_LENGTH. Returns the note id.
   */
  add(notice: NewNotice): Promise<string>;
}

// Same limit as the database check on the body.
export const MAX_NOTICE_LENGTH = 500;

/** A note the database would refuse for good, so nothing was written. */
export class InvalidNoticeError extends Error {
  constructor(reason: string) {
    super(`Invalid notice: ${reason}`);
    this.name = 'InvalidNoticeError';
  }
}

/** The body to store: trimmed, 1 to MAX_NOTICE_LENGTH characters. Both repositories call it before writing. */
export function validatedBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new InvalidNoticeError('the note is empty');
  if (trimmed.length > MAX_NOTICE_LENGTH) throw new InvalidNoticeError(`the note is longer than ${MAX_NOTICE_LENGTH} characters`);
  return trimmed;
}
