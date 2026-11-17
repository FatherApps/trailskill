import type { InvitationStore } from './port.ts';

export type SendClaim = 'claimed' | 'caller_rate_limited' | 'recipient_rate_limited';

/** The caller's own client, reduced to calling a database function; the database decides. */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;

const NOT_AUTHORIZED = '42501';
const LIMITS: readonly string[] = ['caller_rate_limited', 'recipient_rate_limited'];

/**
 * Counts every call that would send an invitation: per calling admin and per recipient (the invitation). The counter lives in
 * the database (`claim_coach_invitation_send`), so it survives restarts of the function and is serialized per caller and per
 * invitation: concurrent requests cannot slip past the limit. The limits and their window are named constants of that function.
 * A limited call answers its own error code and the service sends no email. An error carries the Postgres code and nothing else.
 */
export function withSendLimit(store: InvitationStore, rpc: Rpc): InvitationStore {
  return {
    async create(schoolId, email) {
      const created = await store.create(schoolId, email);
      if (!created.ok) return created;
      const { data, error } = await rpc('claim_coach_invitation_send', { invitation_id: created.value.id });
      if (error?.code === NOT_AUTHORIZED) return { ok: false, error: { code: 'not_authorized' } };
      if (error || typeof data !== 'string' || (data !== 'claimed' && !LIMITS.includes(data))) {
        throw new Error(`Claiming the send failed (${error?.code ?? 'unknown'})`);
      }
      return data === 'claimed' ? created : { ok: false, error: { code: data as Exclude<SendClaim, 'claimed'> } };
    },
  };
}
