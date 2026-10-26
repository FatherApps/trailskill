import { useRouter } from 'expo-router';

import { useSession } from '../../../core/session';
import { RecordSyncStatus } from '../../../core/sync';
import {
  AddAthletesContainer,
  createPowerSyncManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseInvitationRepository,
} from '../../../modules/accounts';
import { createPowerSyncAthleteRepository, createPowerSyncSchoolAthleteRepository } from '../../../modules/athletes';

const athletes = createPowerSyncAthleteRepository(createPowerSyncManagedAthleteRepository(), createPowerSyncSchoolAthleteRepository());
const drafts = createSecureStoreRegistrationDraftRepository();
const invitations = createSupabaseInvitationRepository();
const pending = createSecureStorePendingInvitationRepository();
const profiles = createPowerSyncManagedAthleteProfileRepository(athletes);

export default function AddAthletesRoute() {
  const router = useRouter();
  const { session } = useSession();

  if (!session) return null;
  return (
    <AddAthletesContainer
      userId={session.user.id}
      profiles={profiles}
      athletes={athletes}
      drafts={drafts}
      invitations={invitations}
      pending={pending}
      // The account exists already: back must not drop the person on a half-done registration.
      blockSystemBack
      // Reached with replace, so back may have no history: it goes home.
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      renderStatus={(id) => <RecordSyncStatus table="athletes" id={id} />}
      onContinue={() => router.replace('/athletes/authorizations')}
    />
  );
}
