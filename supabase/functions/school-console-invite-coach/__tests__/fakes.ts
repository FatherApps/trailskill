import type { CreateOutcome, Invitation, InvitationStore } from '../port.ts';

/** An in-memory store that mimics the database rule: only an admin of the school creates an invitation, and one pending invitation exists per school and email. */
export function createMemoryStore(adminOf: string[]) {
  const invitations: Invitation[] = [];
  const store: InvitationStore = {
    async create(schoolId, email): Promise<CreateOutcome> {
      if (!adminOf.includes(schoolId)) return { ok: false, error: { code: 'not_authorized' } };
      const existing = invitations.find((i) => i.schoolId === schoolId && i.email === email);
      if (existing) return { ok: true, value: existing };
      const created = { id: `invitation-${invitations.length + 1}`, schoolId, email };
      invitations.push(created);
      return { ok: true, value: created };
    },
  };
  return { store, invitations };
}
