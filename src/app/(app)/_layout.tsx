import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { useTheme } from '../../core/theme';
import {
  createPowerSyncManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseAdultProfileRepository,
  createSupabaseInvitationRepository,
  ResumeRegistration,
  useFinishRegistration,
  usePendingInvitations,
  type RegistrationStep,
} from '../../modules/accounts';
import { createPowerSyncAthleteRepository, createPowerSyncSchoolAthleteRepository } from '../../modules/athletes';

const drafts = createSecureStoreRegistrationDraftRepository();
const profiles = createSupabaseAdultProfileRepository();
const managedProfiles = createPowerSyncManagedAthleteProfileRepository(
  createPowerSyncAthleteRepository(createPowerSyncManagedAthleteRepository(), createPowerSyncSchoolAthleteRepository()),
);
const invitation = { pending: createSecureStorePendingInvitationRepository(), invitations: createSupabaseInvitationRepository() };

export default function Layout() {
  const router = useRouter();
  const { session } = useSession();
  const openNext = (step: RegistrationStep) => router.replace(step === 'add_athletes' ? '/athletes/add' : '/athletes/authorizations');
  // A person who just registered gets the profile typed in the draft stored once the account exists; a guardian goes on to add the athletes and an adult to the authorizations.
  const offer = useFinishRegistration(session?.user.id, session?.user.email, drafts, profiles, managedProfiles, openNext, invitation);
  // The school invitation of an athlete is accepted once the athlete reached the server, so it is tried again after each sync.
  const { lastSyncedAt } = useGlobalSyncSummary();
  usePendingInvitations(session?.user.id, invitation.pending, invitation.invitations, lastSyncedAt?.getTime());
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
