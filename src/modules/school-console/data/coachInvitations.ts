import { supabase } from '../../../core/sync';
import type { CoachInvitation } from '../components/InviteCoachSheet';

// The port for inviting a coach. school_invitations is the athletes' registration link; coaches are invited through the school-console-invite-coach function.
export interface CoachInvitationRepository {
  /** Delivers the invitation for the school; rejects when it could not be delivered, so the sheet stays open. */
  invite(schoolId: string, invitation: CoachInvitation): Promise<void>;
}

export type SentCoachInvitation = { schoolId: string; invitation: CoachInvitation };

export function createInMemoryCoachInvitationRepository(): CoachInvitationRepository & { readonly sent: SentCoachInvitation[] } {
  const sent: SentCoachInvitation[] = [];
  return {
    sent,
    async invite(schoolId, invitation) {
      sent.push({ schoolId, invitation });
    },
  };
}

/** Why an invitation was not sent: the server's error code, `offline` when the request never arrived, or `unexpected`. Never the message, which could carry the email. */
export class CoachInvitationError extends Error {
  constructor(readonly code: string) {
    super(`The coach invitation was not sent (${code})`);
    this.name = 'CoachInvitationError';
  }
}

type FunctionsError = { name?: string; context?: { json(): Promise<unknown> } };
export type CoachInvitationClient = {
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: FunctionsError | null }> };
};

// The adapter. The function takes the school and the email; the name and the groups are not part of its contract yet.
export function createSupabaseCoachInvitationRepository(client: CoachInvitationClient = supabase): CoachInvitationRepository {
  return {
    async invite(schoolId, { email }) {
      const { error } = await client.functions.invoke('school-console-invite-coach', { body: { schoolId, email } });
      if (!error) return;
      // A refusal carries the server's `{ ok: false, error: { code } }`; no response at all is a connection that is not there.
      if (error.name === 'FunctionsHttpError' && error.context) {
        const body = (await error.context.json().catch(() => null)) as { error?: { code?: unknown } } | null;
        throw new CoachInvitationError(typeof body?.error?.code === 'string' ? body.error.code : 'unexpected');
      }
      throw new CoachInvitationError(error.name === 'FunctionsFetchError' ? 'offline' : 'unexpected');
    },
  };
}
