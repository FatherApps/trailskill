import { Stack } from 'expo-router';

import { useSession } from '../../core/session';
import {
  createSecureStoreRegistrationDraftRepository,
  createSupabaseAdultProfileRepository,
  useFinishRegistration,
} from '../../modules/accounts';

const drafts = createSecureStoreRegistrationDraftRepository();
const profiles = createSupabaseAdultProfileRepository();

export default function Layout() {
  const { session } = useSession();
  // A person who just registered gets the profile typed in the draft stored once the account exists.
  useFinishRegistration(session?.user.id, session?.user.email, drafts, profiles);
  return <Stack screenOptions={{ headerShown: false }} />;
}
