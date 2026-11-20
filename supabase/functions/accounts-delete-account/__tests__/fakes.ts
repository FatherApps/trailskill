import type { AccountDeletionStore, CancelResult, ConfirmResult, Email, Mailer, RequestResult } from '../port.ts';

/** The code every in-memory request issues. */
export const CODE = '123456';
export const EMAIL = 'user@example.test';
export const DELETE_AFTER = '2026-12-20T15:00:00.000Z';

/** An in-memory store that answers what it is told and remembers every call. */
export function createMemoryStore(answers: { request?: RequestResult; confirm?: ConfirmResult; cancel?: CancelResult } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const store: AccountDeletionStore = {
    async request(...args) {
      calls.push({ method: 'request', args });
      return answers.request ?? { status: 'code_issued', code: CODE, email: EMAIL };
    },
    async confirm(...args) {
      calls.push({ method: 'confirm', args });
      return answers.confirm ?? { status: 'marked', deleteAfter: DELETE_AFTER, email: EMAIL };
    },
    async cancel(...args) {
      calls.push({ method: 'cancel', args });
      return answers.cancel ?? { status: 'cancelled' };
    },
  };
  return { store, calls };
}

/** A mailer that records what it was asked to send, answers `sent` and rejects with `failWith` when given. */
export function createRecordingMailer({ sent = true, failWith }: { sent?: boolean; failWith?: Error } = {}) {
  const emails: Email[] = [];
  const mailer: Mailer = {
    async send(email) {
      emails.push(email);
      if (failWith) throw failWith;
      return sent;
    },
  };
  return { mailer, emails };
}
