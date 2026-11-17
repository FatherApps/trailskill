/** A pending invitation of a coach to a school. The school name is there because the message must say who invites. */
export type Invitation = { id: string; schoolId: string; email: string; schoolName: string };

export type CreateOutcome =
  | { ok: true; value: Invitation }
  | { ok: false; error: { code: 'not_authorized' } | { code: 'bad_request' } | { code: 'caller_rate_limited' } | { code: 'recipient_rate_limited' } };

/** Where invitations live. Acts as the caller: the database decides whether the caller may invite to the school. */
export interface InvitationStore {
  /** Creates the pending invitation, or answers the one already pending for the school and email. */
  create(schoolId: string, email: string): Promise<CreateOutcome>;
}

/** How an invitation reaches the coach. Resolves true when an email left, false when the adapter sent nothing (the test sender). Rejects when delivery failed. */
export interface InvitationSender {
  deliver(invitation: Invitation): Promise<boolean>;
}
