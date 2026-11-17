import type { InvitationSender, InvitationStore } from './port.ts';

// The only messages a sender may put in the log: the fixed ones of the Resend sender. Anything else (a future sender's message
// could carry the address, an id or a response) is logged as "unknown".
const LOGGABLE = /^Resend (delivery failed \((network|HTTP \d{3})\)|sender is not configured)$/;

export type InviteError =
  | { code: 'not_authorized' }
  | { code: 'bad_request' }
  | { code: 'caller_rate_limited' }
  | { code: 'recipient_rate_limited' }
  | { code: 'unavailable' };
export type InviteOutcome = { ok: true; value: { invitationId: string } } | { ok: false; error: InviteError };

/**
 * Creates the pending invitation, then delivers it. When delivery fails the pending invitation stays: inviting the same email
 * again reuses it and delivers again. A store failure is not caught here.
 */
export function createInviteCoach({ store, sender }: { store: InvitationStore; sender: InvitationSender }) {
  return async function inviteCoach({ schoolId, email }: { schoolId: string; email: string }): Promise<InviteOutcome> {
    const created = await store.create(schoolId, email);
    if (!created.ok) return created;
    try {
      await sender.deliver(created.value);
    } catch (error) {
      console.error(`school-console-invite-coach delivery failed: ${error instanceof Error && LOGGABLE.test(error.message) ? error.message : 'unknown'}`);
      return { ok: false, error: { code: 'unavailable' } };
    }
    return { ok: true, value: { invitationId: created.value.id } };
  };
}
