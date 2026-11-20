import { codeEmail, markedEmail } from './emailTexts.ts';
import type { AccountDeletionStore, BlockingSchool, Mailer } from './port.ts';

// The only messages a mailer may put in the log: the fixed ones of the Resend sender. Anything else (a future mailer's message
// could carry the address or a response) is logged as "unknown".
const LOGGABLE = /^Resend (delivery failed \((network|HTTP \d{3})\)|sender is not configured)$/;
const loggable = (error: unknown) => (error instanceof Error && LOGGABLE.test(error.message) ? error.message : 'unknown');

export type DeletionError =
  | { code: 'blocked_by_school' | 'platform_admin'; schools: BlockingSchool[] }
  | { code: 'rate_limited' | 'invalid_code' | 'code_expired' | 'too_many_attempts' | 'unavailable' };
export type DeletionOutcome<T> = { ok: true; value: T } | { ok: false; error: DeletionError };

type Blocked = { status: 'blocked'; reason: 'school' | 'platform_admin'; schools: BlockingSchool[] };
const blockedError = (blocked: Blocked): { ok: false; error: DeletionError } => ({
  ok: false,
  error: { code: blocked.reason === 'school' ? 'blocked_by_school' : 'platform_admin', schools: blocked.schools },
});

/**
 * The three steps of an account deletion for the user the handler authenticated. The code only ever goes by email: it is in no
 * answer and no log. A store failure is not caught here.
 */
export function createAccountDeletion({
  store,
  mailer,
  newKey = () => globalThis.crypto.randomUUID(),
}: {
  store: AccountDeletionStore;
  mailer: Mailer;
  /** One Idempotency-Key per code email: a code is new every time. */
  newKey?: () => string;
}) {
  return {
    async request(userId: string): Promise<DeletionOutcome<{ status: 'code_sent'; emailSent: boolean } | { status: 'already_marked'; deleteAfter: string }>> {
      const result = await store.request(userId);
      if (result.status === 'blocked') return blockedError(result);
      if (result.status === 'rate_limited') return { ok: false, error: { code: 'rate_limited' } };
      if (result.status === 'already_marked') return { ok: true, value: { status: 'already_marked', deleteAfter: result.deleteAfter } };
      try {
        const emailSent = await mailer.send({ to: result.email, ...codeEmail(result.code), idempotencyKey: `account-deletion-code/${newKey()}` });
        return { ok: true, value: { status: 'code_sent', emailSent } };
      } catch (error) {
        console.error(`accounts-delete-account code email failed: ${loggable(error)}`);
        return { ok: false, error: { code: 'unavailable' } };
      }
    },

    async confirm(userId: string, code: string): Promise<DeletionOutcome<{ status: 'marked'; deleteAfter: string; emailSent: boolean } | { status: 'already_marked'; deleteAfter: string }>> {
      const result = await store.confirm(userId, code);
      if (result.status === 'blocked') return blockedError(result);
      if (result.status === 'invalid_code' || result.status === 'code_expired' || result.status === 'too_many_attempts') return { ok: false, error: { code: result.status } };
      if (result.status === 'already_marked') return { ok: true, value: { status: 'already_marked', deleteAfter: result.deleteAfter } };
      let emailSent = false;
      try {
        // The account is already marked: a failed email does not undo it.
        emailSent = await mailer.send({ to: result.email, ...markedEmail(result.deleteAfter), idempotencyKey: `account-deletion-marked/${newKey()}` });
      } catch (error) {
        console.error(`accounts-delete-account marked email failed: ${loggable(error)}`);
      }
      return { ok: true, value: { status: 'marked', deleteAfter: result.deleteAfter, emailSent } };
    },

    async cancel(userId: string): Promise<DeletionOutcome<{ status: 'cancelled' | 'not_marked' }>> {
      return { ok: true, value: await store.cancel(userId) };
    },
  };
}
