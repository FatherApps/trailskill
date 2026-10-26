import { router } from 'expo-router';

import { createSecureStoreRegistrationDraftRepository, createSupabaseInvitationRepository, WhoSwimsContainer } from '../../../modules/accounts';

const drafts = createSecureStoreRegistrationDraftRepository();
const invitations = createSupabaseInvitationRepository();

// Step 1 of registration. Issues #42 and #43 add the next steps as sibling routes in this folder.
export default function RegisterWhoSwims() {
  return (
    <WhoSwimsContainer
      drafts={drafts}
      invitations={invitations}
      onContinue={() => router.push('/register/details')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
    />
  );
}
