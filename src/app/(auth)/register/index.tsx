import { router } from 'expo-router';

import { createSecureStoreRegistrationDraftRepository, WhoSwimsContainer } from '../../../modules/accounts';

const drafts = createSecureStoreRegistrationDraftRepository();

// Step 1 of registration. Issues #42 and #43 add the next steps as sibling routes in this folder.
export default function RegisterWhoSwims() {
  return (
    <WhoSwimsContainer
      drafts={drafts}
      onContinue={() => router.push('/register/details')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
    />
  );
}
