import { useRouter, useLocalSearchParams } from 'expo-router';

import { useSession } from '../../core/session';
import { createSecureStoreRegistrationDraftRepository, InviteLinkContainer } from '../../modules/accounts';

const drafts = createSecureStoreRegistrationDraftRepository();

// trailskill://invite/<token>: outside both guarded groups, so it opens signed in or out.
export default function InviteLink() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useSession();
  return (
    <InviteLinkContainer
      token={token}
      signedIn={session != null}
      drafts={drafts}
      onDone={(next) => router.replace(next === 'register' ? '/register' : '/')}
    />
  );
}
