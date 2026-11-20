/** A school that keeps the account from being deleted (it still manages that school). */
export type BlockingSchool = { id: string; name: string };

type Blocked = { status: 'blocked'; reason: 'school' | 'platform_admin'; schools: BlockingSchool[] };

export type RequestResult =
  | { status: 'code_issued'; code: string; email: string }
  | Blocked
  | { status: 'rate_limited' }
  | { status: 'already_marked'; deleteAfter: string };

export type ConfirmResult =
  | { status: 'marked'; deleteAfter: string; email: string }
  | Blocked
  | { status: 'invalid_code' }
  | { status: 'code_expired' }
  | { status: 'too_many_attempts' }
  | { status: 'already_marked'; deleteAfter: string };

export type CancelResult = { status: 'cancelled' | 'not_marked' };

/** Where the deletion requests live. The database decides everything; the user is always the one whose token the request carried. */
export interface AccountDeletionStore {
  /** Issues a confirmation code for the user (never answered to the caller: it only goes by email). */
  request(userId: string): Promise<RequestResult>;
  /** Checks the code and, when right, marks the account for deletion after the grace period. */
  confirm(userId: string, code: string): Promise<ConfirmResult>;
  /** Cancels a pending deletion. */
  cancel(userId: string): Promise<CancelResult>;
}

export type Email = { to: string; subject: string; text: string; idempotencyKey: string };

/** How an email leaves. Resolves true when an email left, false when the adapter sent nothing (the test mailer). Rejects when delivery failed. */
export interface Mailer {
  send(email: Email): Promise<boolean>;
}
