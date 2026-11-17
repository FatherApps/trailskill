import { supabase } from '../../../core/sync';
import type { CoachInvitation } from '../components/InviteCoachSheet';

/** What came of an invitation that was created: `emailSent` is false when the invitation exists but no email left. */
export type CoachInvitationResult = { emailSent: boolean };

// The port for inviting a coach. school_invitations is the athletes' registration link; coaches are invited through the school-console-invite-coach function.
export interface CoachInvitationRepository {
  /** Creates the invitation for the school; rejects when it was not created, so the sheet stays open. Resolves with `emailSent: false` when it was created but the email did not go out. */
  invite(schoolId: string, invitation: CoachInvitation): Promise<CoachInvitationResult>;
}

export type SentCoachInvitation = { schoolId: string; invitation: CoachInvitation };

export function createInMemoryCoachInvitationRepository(): CoachInvitationRepository & { readonly sent: SentCoachInvitation[] } {
  const sent: SentCoachInvitation[] = [];
  return {
    sent,
    async invite(schoolId, invitation) {
      sent.push({ schoolId, invitation });
      return { emailSent: true };
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
      const { data, error } = await client.functions.invoke('school-console-invite-coach', { body: { schoolId, email } });
      // An older function does not say whether the email went out: it is taken as sent, as before.
      if (!error) return { emailSent: (data as { value?: { emailSent?: unknown } } | null)?.value?.emailSent !== false };
      // A refusal carries the server's `{ ok: false, error: { code } }`; no response at all is a connection that is not there.
      if (error.name === 'FunctionsHttpError' && error.context) {
        const body = (await error.context.json().catch(() => null)) as { error?: { code?: unknown; invitationId?: unknown } } | null;
        // The mail provider failed but the pending invitation exists: created without email, not a failure. An older function sends no invitationId and still fails here.
        if (body?.error?.code === 'unavailable' && typeof body.error.invitationId === 'string') return { emailSent: false };
        throw new CoachInvitationError(typeof body?.error?.code === 'string' ? body.error.code : 'unexpected');
      }
      throw new CoachInvitationError(error.name === 'FunctionsFetchError' ? 'offline' : 'unexpected');
    },
  };
}
