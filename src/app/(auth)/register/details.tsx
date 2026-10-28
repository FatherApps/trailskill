import { useRouter } from 'expo-router';

import { useSession } from '../../../core/session';
import { AccountDetailsContainer, createSecureStoreRegistrationDraftRepository, createSupabaseInvitationRepository } from '../../../modules/accounts';

const drafts = createSecureStoreRegistrationDraftRepository();
const invitations = createSupabaseInvitationRepository();

// Step 2 of registration. Once the code checks out the session gate leaves the auth group on its own.
export default function RegisterDetails() {
  const router = useRouter();
  const { requestCode, verifyCode, signInWithProvider } = useSession();
  return (
    <AccountDetailsContainer
      drafts={drafts}
      invitations={invitations}
      requestCode={requestCode}
      verifyCode={verifyCode}
      signInWithProvider={signInWithProvider}
      // Returns to step 1 without stacking a second copy of it.
      onBack={() => router.dismissTo('/register')}
      onSignIn={() => router.replace('/sign-in')}
    />
  );
}
