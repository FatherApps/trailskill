import { router, Stack } from 'expo-router';

import { useSession } from '../../core/session';
import {
  createPowerSyncManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseAdultProfileRepository,
  useFinishRegistration,
} from '../../modules/accounts';
import { createPowerSyncAthleteRepository, createPowerSyncSchoolAthleteRepository } from '../../modules/athletes';

const drafts = createSecureStoreRegistrationDraftRepository();
const profiles = createSupabaseAdultProfileRepository();
const managedProfiles = createPowerSyncManagedAthleteProfileRepository(
  createPowerSyncAthleteRepository(createPowerSyncManagedAthleteRepository(), createPowerSyncSchoolAthleteRepository()),
);
const openAddAthletes = () => router.replace('/athletes/add');

export default function Layout() {
  const { session } = useSession();
  // A person who just registered gets the profile typed in the draft stored once the account exists; a guardian goes on to add the athletes.
  useFinishRegistration(session?.user.id, session?.user.email, drafts, profiles, managedProfiles, openAddAthletes);
  return <Stack screenOptions={{ headerShown: false }} />;
}
