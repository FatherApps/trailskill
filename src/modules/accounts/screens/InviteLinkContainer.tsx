import { useEffect } from 'react';

import type { RegistrationDraftRepository } from '../data/registrationDraft';

export type InviteLinkContainerProps = {
  token: string;
  signedIn: boolean;
  drafts: RegistrationDraftRepository;
  onDone: (next: 'register' | 'home') => void;
};

// trailskill://invite/<token>: keeps the token in the registration draft, then moves on.
// A failed local save must not block the person: the screens simply show no invitation.
export function InviteLinkContainer({ token, signedIn, drafts, onDone }: InviteLinkContainerProps) {
  useEffect(() => {
    (async () => {
      const draft = await drafts.load().catch(() => null);
      await drafts.save({ firstName: '', lastName: '', email: '', ...draft, invitationToken: token }).catch(() => {});
      onDone(signedIn ? 'home' : 'register');
    })();
    // Runs once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return null;
}
