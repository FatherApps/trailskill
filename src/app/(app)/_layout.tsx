import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { useSession } from '../../core/session';
import { useTheme } from '../../core/theme';
import {
  createPowerSyncManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseAdultProfileRepository,
  ResumeRegistration,
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
  const offer = useFinishRegistration(session?.user.id, session?.user.email, drafts, profiles, managedProfiles, openNext);
  const { colors, space } = useTheme();
  // A draft typed here and never confirmed by a code is offered once the person is in with the same email.
  if (offer) {
    return (
      <View style={{ flex: 1, padding: space[4], justifyContent: 'center', backgroundColor: colors['surface-0'] }}>
        <ResumeRegistration email={offer.email} onResume={offer.resume} onRestart={offer.startOver} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
