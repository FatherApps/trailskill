import type { CreateOutcome, Invitation, InvitationStore } from '../port.ts';
import type { Rpc } from '../sendLimit.ts';

/** The school name every in-memory invitation carries. */
export const SCHOOL_NAME = 'Escuela de prueba';

/** An in-memory store that mimics the database rule: only an admin of the school creates an invitation, and one pending invitation exists per school and email. */
export function createMemoryStore(adminOf: string[]) {
  const invitations: Invitation[] = [];
  const store: InvitationStore = {
    async create(schoolId, email): Promise<CreateOutcome> {
      if (!adminOf.includes(schoolId)) return { ok: false, error: { code: 'not_authorized' } };
      const existing = invitations.find((i) => i.schoolId === schoolId && i.email === email);
      if (existing) return { ok: true, value: existing };
      const created = { id: `invitation-${invitations.length + 1}`, schoolId, email, schoolName: SCHOOL_NAME };
      invitations.push(created);
      return { ok: true, value: created };
    },
  };
  return { store, invitations };
}

/** An in-memory claim_coach_invitation_send: per recipient (invitation) and for the whole caller, counted over calls. The window never expires here; the database owns it. */
export function createMemoryLimiter({ callerLimit, recipientLimit }: { callerLimit: number; recipientLimit: number }) {
  const sends: string[] = [];
  const rpc: Rpc = async (_fn, { invitation_id }) => {
    const id = invitation_id as string;
    if (sends.length >= callerLimit) return { data: 'caller_rate_limited', error: null };
    if (sends.filter((sent) => sent === id).length >= recipientLimit) return { data: 'recipient_rate_limited', error: null };
    sends.push(id);
    return { data: 'claimed', error: null };
  };
  return { rpc, sends };
}
