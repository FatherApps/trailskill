import { useEffect, useState } from 'react';

import type { InvitationRepository } from '../data/invitations';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import type { Invitation } from '../components/notices';

// Resolves the invitation token saved in the draft; the categories are the ones to offer when adding an athlete. Registration is never blocked:
// an unknown, expired or revoked link is dropped from the draft and reported as invalid;
// no signal keeps the token so the next registration screen asks again.
export function useInvitation(drafts: RegistrationDraftRepository, invitations: InvitationRepository) {
  const [state, setState] = useState<{ invitation?: Invitation; categories: { id: string; name: string }[]; invalid: boolean }>({ invalid: false, categories: [] });

  useEffect(() => {
    let current = true;
    (async () => {
      const token = (await drafts.load())?.invitationToken;
      if (!token) return;
      const resolved = await invitations.resolve(token);
      if (resolved === null) {
        // Read again: the person may have typed since the first read.
        const latest = await drafts.load();
        if (latest?.invitationToken === token) await drafts.save({ ...latest, invitationToken: undefined });
        if (current) setState({ invalid: true, categories: [] });
      } else if (current) setState({ invalid: false, categories: resolved.categories, invitation: { school: resolved.school, group: resolved.group } });
    })().catch(() => {});
    return () => {
      current = false;
    };
  }, [drafts, invitations]);

  return state;
}
