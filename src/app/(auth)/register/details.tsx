import { router } from 'expo-router';

import { useSession } from '../../../core/session';
import { AccountDetailsContainer, createSecureStoreRegistrationDraftRepository } from '../../../modules/accounts';

const drafts = createSecureStoreRegistrationDraftRepository();

// Step 2 of registration. Once the code checks out the session gate leaves the auth group on its own.
export default function RegisterDetails() {
  const { requestCode, verifyCode } = useSession();
  return (
    <AccountDetailsContainer
      drafts={drafts}
      requestCode={requestCode}
      verifyCode={verifyCode}
      // Returns to step 1 without stacking a second copy of it.
      onBack={() => router.dismissTo('/register')}
      onSignIn={() => router.replace('/sign-in')}
    />
  );
}
