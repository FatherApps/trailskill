import { router, Stack } from 'expo-router';

import { useSession } from '../../core/session';
import {
  createPowerSyncManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseAdultProfileRepository,
  useFinishRegistration,
  type RegistrationStep,
} from '../../modules/accounts';
import { createPowerSyncAthleteRepository, createPowerSyncSchoolAthleteRepository } from '../../modules/athletes';

const drafts = createSecureStoreRegistrationDraftRepository();
const profiles = createSupabaseAdultProfileRepository();
const managedProfiles = createPowerSyncManagedAthleteProfileRepository(
  createPowerSyncAthleteRepository(createPowerSyncManagedAthleteRepository(), createPowerSyncSchoolAthleteRepository()),
);
const openNext = (step: RegistrationStep) => router.replace(step === 'add_athletes' ? '/athletes/add' : '/athletes/authorizations');

export default function Layout() {
  const { session } = useSession();
  // A person who just registered gets the profile typed in the draft stored once the account exists; a guardian goes on to add the athletes and an adult to the authorizations.
  useFinishRegistration(session?.user.id, session?.user.email, drafts, profiles, managedProfiles, openNext);
  return <Stack screenOptions={{ headerShown: false }} />;
}
