import type { Mailer } from '../accounts-delete-account/port.ts';

export type { Mailer };

export type MailKind = 'reminder' | 'deleted' | 'stopped';

/** One email the database says is due. `formerAthleteKeys` only has content for `deleted`; the keys are never logged. */
export type DueMail = { requestId: string; kind: MailKind; email: string; deleteAfter: string; formerAthleteKeys: string[] };

export type EraseStatus = 'deleted' | 'stopped' | 'skipped';

/** The database side of the daily run. Every call receives the same `now` of the run, so tests drive time. */
export interface WorkerStore {
  /** Ids of the deletion requests whose grace period is over. */
  listDue(now: Date, limit: number): Promise<string[]>;
  /** Erases the account of one request, or reports it was stopped (a school linked the swimmer again) or skipped (nothing to do). */
  erase(requestId: string, now: Date): Promise<EraseStatus>;
  /** Leases the emails that are due: a claimed email is not returned again for 15 minutes. */
  claimMail(now: Date, limit: number): Promise<DueMail[]>;
  /** Marks the email as sent, for good. */
  finishMail(requestId: string, kind: MailKind): Promise<void>;
}

export interface Clock {
  now(): Date;
}
