import type { CoachInvitation } from '../components/InviteCoachSheet';

// The port for inviting a coach. There is no real adapter yet: school_invitations is the athletes' registration link and cannot invite a coach.
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
