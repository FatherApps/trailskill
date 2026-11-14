import type { InvitationSender, InvitationStore } from './port.ts';

export type InviteError = { code: 'not_authorized' } | { code: 'unavailable' };
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
    } catch {
      return { ok: false, error: { code: 'unavailable' } };
    }
    return { ok: true, value: { invitationId: created.value.id } };
  };
}
