/** A pending invitation of a coach to a school. */
export type Invitation = { id: string; schoolId: string; email: string };

export type CreateOutcome = { ok: true; value: Invitation } | { ok: false; error: { code: 'not_authorized' } | { code: 'bad_request' } };

/** Where invitations live. Acts as the caller: the database decides whether the caller may invite to the school. */
export interface InvitationStore {
  /** Creates the pending invitation, or answers the one already pending for the school and email. */
  create(schoolId: string, email: string): Promise<CreateOutcome>;
}

/** How an invitation reaches the coach. Rejects when it was not delivered. */
export interface InvitationSender {
  deliver(invitation: Invitation): Promise<void>;
}
